// Source mapping — builds a bidirectional file-to-feature-to-service-to-module
// mapping from .usm specs and renders multiple views from it.
//
// This is the "code navigator" capability: it answers "which files do what,
// and which are undocumented?" by inverting the implementation relationship
// across all specs. Three views render from one SourceMap:
//   file-tree        — directory tree with descriptions, grouped by service/module
//   coverage-matrix  — table of file, module, owning feature, spec status
//   orphan-report    — files with no governing feature spec
//
// Universal — reads the project's own .usm specs, no USM-specific content.
// No new schema fields — uses existing modules[], implementation.primary,
// routes[].file_path.

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { ServiceUsm, FeatureUsm } from "../types.js";
import type { ContentBlock } from "./contentBlocks.js";

// ─── SourceMap data structures ────────────────────────────────────────────────

/** A file entry in the source map. */
export interface MappedFile {
  /** Relative path from repo root (e.g. src/scan/detectors.ts). */
  path: string;
  /** The service $id that owns this file's directory. */
  service: string;
  /** The module name from service.usm modules[] (if matched). */
  module?: string;
  /** The module purpose from service.usm modules[] (if matched). */
  modulePurpose?: string;
  /** The feature $id whose implementation.primary points at this file (if any). */
  feature?: string;
  /** The feature summary (if a feature owns this file). */
  featureSummary?: string;
  /** True if this file is a route source (matched by routes[].file_path). */
  isRoute?: boolean;
}

/** The complete source map — built once, rendered into multiple views. */
export interface SourceMap {
  files: MappedFile[];
  orphans: MappedFile[];
  services: Array<{ id: string; name: string }>;
  modules: Array<{ service: string; name: string; purpose: string }>;
}

// ─── Build the source map ─────────────────────────────────────────────────────

const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/.next/**", "**/.usm-workspace/**", "**/build/**", "**/coverage/**"];

/**
 * Build a SourceMap from all service and feature specs.
 *
 * Reads service.usm modules[].paths[] for directory grouping and feature.usm
 * implementation.primary for file ownership. Walks the filesystem within each
 * service's paths[] to enumerate actual files. Files not claimed by any
 * feature spec are orphans.
 *
 * @param services - All parsed service.usm files
 * @param features - All parsed feature.usm files
 * @param root - Repo root directory
 */
export function buildSourceMap(
  services: ServiceUsm[],
  features: FeatureUsm[],
  root: string,
): SourceMap {
  // Build feature ownership index: file path → feature
  const fileToFeature = new Map<string, { id: string; summary?: string }>();
  for (const feat of features) {
    if (feat.implementation?.primary) {
      // implementation.primary can be a semicolon-separated list
      const files = feat.implementation.primary.split(";").map((f) => f.trim());
      for (const f of files) {
        fileToFeature.set(f, { id: feat.$id, summary: feat.summary });
      }
    }
    if (feat.implementation?.test_code) {
      fileToFeature.set(feat.implementation.test_code, { id: feat.$id, summary: feat.summary });
    }
    if (feat.routes) {
      for (const route of feat.routes) {
        if (route.file_path) {
          fileToFeature.set(route.file_path, { id: feat.$id, summary: feat.summary });
        }
      }
    }
  }

  const files: MappedFile[] = [];
  const orphans: MappedFile[] = [];
  const modulesList: Array<{ service: string; name: string; purpose: string }> = [];
  const servicesList: Array<{ id: string; name: string }> = [];

  for (const svc of services) {
    const svcId = svc.$id;
    const svcName = svc.name || svcId.split("/").pop() || svcId;
    servicesList.push({ id: svcId, name: svcName });

    // Collect module info
    if (svc.modules) {
      for (const mod of svc.modules) {
        modulesList.push({ service: svcId, name: mod.name, purpose: mod.purpose });
      }
    }

    // Walk each path in service paths[]
    const servicePaths = svc.paths || [];
    for (const svcPath of servicePaths) {
      const absPath = path.resolve(root, svcPath);
      if (!fs.existsSync(absPath)) continue;

      // If it's a directory, walk it; if it's a file, just use it
      const isDir = fs.statSync(absPath).isDirectory();
      const foundFiles = isDir
        ? fg.sync("**/*", { cwd: absPath, absolute: true, ignore: DEFAULT_EXCLUDES, onlyFiles: true })
        : [absPath];

      for (const absFile of foundFiles) {
        const relPath = path.relative(root, absFile);
        const mapped = mapFile(relPath, svcId, svc, fileToFeature);
        files.push(mapped);
        if (!mapped.feature) {
          orphans.push(mapped);
        }
      }
    }
  }

  return { files, orphans, services: servicesList, modules: modulesList };
}

/** Map a single file to its module, feature, and route status. */
function mapFile(
  relPath: string,
  serviceId: string,
  svc: ServiceUsm,
  fileToFeature: Map<string, { id: string; summary?: string }>,
): MappedFile {
  const mapped: MappedFile = { path: relPath, service: serviceId };

  // Match to a module by checking which module paths[] directory contains this file
  if (svc.modules) {
    for (const mod of svc.modules) {
      if (!mod.paths) continue;
      for (const modPath of mod.paths) {
        // Normalize: modPath might be "src/scan" or "src/scan/"
        const normalizedModPath = modPath.replace(/\/$/, "");
        if (relPath.startsWith(normalizedModPath + "/") || relPath === normalizedModPath) {
          mapped.module = mod.name;
          mapped.modulePurpose = mod.purpose;
          break;
        }
      }
      if (mapped.module) break;
    }
  }

  // Match to a feature by implementation.primary
  const featMatch = fileToFeature.get(relPath);
  if (featMatch) {
    mapped.feature = featMatch.id;
    mapped.featureSummary = featMatch.summary;
  }

  // Check if it's a route file (already captured via routes[].file_path above,
  // which sets fileToFeature — so if feature is set via a route, mark isRoute)
  // We check if the feature match came from a route by seeing if the file
  // looks like a page.tsx or route.ts
  if (relPath.endsWith("page.tsx") || relPath.endsWith("route.ts") || relPath.endsWith("route.js")) {
    mapped.isRoute = true;
  }

  return mapped;
}

// ─── View renderers ──────────────────────────────────────────────────────────

/**
 * Render the file-tree view as content blocks.
 * Groups files by service → module, showing descriptions and owning features.
 */
export function renderFileTreeBlocks(map: SourceMap): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Group by service
  const byService = groupBy(map.files, (f) => f.service);

  for (const [svcId, svcFiles] of byService) {
    const svc = map.services.find((s) => s.id === svcId);
    blocks.push({ type: "heading", level: 2, text: svc?.name || svcId });

    // Group by module within service
    const byModule = groupBy(svcFiles, (f) => f.module || "ungrouped");
    for (const [modName, modFiles] of byModule) {
      const modInfo = map.modules.find((m) => m.service === svcId && m.name === modName);
      blocks.push({ type: "heading", level: 3, text: modName });
      if (modInfo?.purpose) {
        blocks.push({ type: "paragraph", text: modInfo.purpose });
      }

      // Build a table of files in this module
      const rows: string[][] = [];
      for (const f of modFiles.sort((a, b) => a.path.localeCompare(b.path))) {
        const fileName = path.basename(f.path);
        const feature = f.feature ? `[${f.feature}]` : "—";
        rows.push([`\`${fileName}\``, feature]);
      }
      blocks.push({
        type: "table",
        headers: ["File", "Feature"],
        rows,
      });
    }
  }

  return blocks;
}

/**
 * Render the coverage-matrix view as content blocks.
 * Table of file, module, owning feature, spec status.
 */
export function renderCoverageMatrixBlocks(map: SourceMap): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  blocks.push({
    type: "paragraph",
    text: `**${map.files.length}** files mapped across **${map.services.length}** services. **${map.orphans.length}** files have no governing feature spec.`,
  });

  const rows: string[][] = [];
  for (const f of map.files.sort((a, b) => a.path.localeCompare(b.path))) {
    const status = f.feature ? "specced" : "orphan";
    rows.push([
      `\`${f.path}\``,
      f.module || "—",
      f.feature ? `[${f.feature}]` : "—",
      status,
    ]);
  }

  blocks.push({
    type: "table",
    headers: ["File", "Module", "Owning Feature", "Spec Status"],
    rows,
  });

  return blocks;
}

/**
 * Render the orphan-report view as content blocks.
 * Only files with no governing feature spec.
 */
export function renderOrphanReportBlocks(map: SourceMap): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (map.orphans.length === 0) {
    blocks.push({
      type: "callout",
      variant: "tip",
      text: "No orphan files found — every file in the codebase is claimed by a feature spec.",
    });
    return blocks;
  }

  blocks.push({
    type: "paragraph",
    text: `**${map.orphans.length}** files have no governing feature spec. These are candidates for new specs or inclusion in existing ones.`,
  });

  // Group orphans by service → module
  const byService = groupBy(map.orphans, (f) => f.service);
  for (const [svcId, svcOrphans] of byService) {
    const svc = map.services.find((s) => s.id === svcId);
    blocks.push({ type: "heading", level: 2, text: svc?.name || svcId });

    const rows: string[][] = [];
    for (const f of svcOrphans.sort((a, b) => a.path.localeCompare(b.path))) {
      rows.push([`\`${f.path}\``, f.module || "ungrouped"]);
    }
    blocks.push({
      type: "table",
      headers: ["File", "Module"],
      rows,
    });
  }

  return blocks;
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}