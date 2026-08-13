import yaml from "js-yaml";
import fs from "node:fs";
import path from "node:path";
import type { UsmFile, SystemUsm, ServiceUsm, FeatureUsm, FeedbackUsm } from "./types.js";

/**
 * Parse a .usm YAML file into a typed object.
 */
export function parseUsm(content: string): UsmFile {
  const raw = yaml.load(content);
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid .usm file: not a valid YAML object");
  }
  return raw as UsmFile;
}

/**
 * Parse a .usm file from disk.
 */
export function parseUsmFile(filePath: string): UsmFile {
  const absolute = path.resolve(filePath);
  const content = fs.readFileSync(absolute, "utf-8");
  return parseUsm(content);
}

/**
 * Type guard: is this a system file?
 */
export function isSystemFile(file: UsmFile): file is SystemUsm {
  return file.$type === "system";
}

/**
 * Type guard: is this a service file?
 */
export function isServiceFile(file: UsmFile): file is ServiceUsm {
  return file.$type === "service";
}

/**
 * Type guard: is this a feature file?
 */
export function isFeatureFile(file: UsmFile): file is FeatureUsm {
  return file.$type === "feature";
}

/**
 * Type guard: is this a feedback file?
 */
export function isFeedbackFile(file: UsmFile): file is FeedbackUsm {
  return file.$type === "feedback";
}

// ─── Parse integrity check ──────────────────────────────────────────────────

/**
 * Feature fields that hold lists of objects keyed by `id`. Used by
 * findMissingListIds to detect silent YAML swallowing (issue #13).
 */
const ID_LIST_FIELDS = ["contracts", "flows", "tests", "decisions", "interfaces"];

/**
 * Collect every `id` property value from a parsed value, recursively.
 */
function collectParsedIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectParsedIds(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "id" && (typeof v === "string" || typeof v === "number")) {
        out.add(String(v));
      } else {
        collectParsedIds(v, out);
      }
    }
  }
}

/**
 * Detect list-entry ids that appear in the raw YAML text but are missing
 * from the parsed object.
 *
 * Why: YAML block-scalar edge cases (indentation mistakes, tabs, a stray
 * `|`/`>` indicator) can silently absorb later list entries into a previous
 * scalar. The file still validates (contracts/flows/etc. are length-agnostic),
 * so `usm generate` faithfully renders a parsed object that is missing
 * entries — silent content loss in the generated docs (issue #13).
 *
 * This is a heuristic cross-check of raw text vs parsed data, used ONLY to
 * emit warnings — it never blocks generation.
 */
export function findMissingListIds(content: string, parsed: UsmFile): Array<{ field: string; id: string }> {
  const missing: Array<{ field: string; id: string }> = [];

  for (const field of ID_LIST_FIELDS) {
    // Locate the top-level `field:` key in the raw text
    const sectionMatch = content.match(new RegExp(`^${field}:[ \\t]*(?:#.*)?$`, "m"));
    if (!sectionMatch || sectionMatch.index === undefined) continue;

    // Section = everything after the `field:` line up to the next top-level key.
    // (Start scanning on the line AFTER the key so the key itself isn't matched;
    // block-scalar bodies are indented so they never look like top-level keys.)
    const keyLineEnd = content.indexOf("\n", sectionMatch.index);
    const afterKeyLine = keyLineEnd === -1 ? "" : content.slice(keyLineEnd + 1);
    const nextTop = afterKeyLine.search(/^[^\s#-][^:\n]*:(?:[ \t]|$)/m);
    const section = nextTop === -1 ? afterKeyLine : afterKeyLine.slice(0, nextTop);

    // Collect id values mentioned anywhere in the raw section.
    // Only identifier-shaped values count — prose inside block scalars
    // ("id: some sentence continues here…") is ignored to avoid false alarms.
    const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
    const rawIds = new Set<string>();
    for (const m of section.matchAll(/^[ \t]+(?:-[ \t]+)?id:[ \t]*([^\n]+?)[ \t]*$/gm)) {
      let id = m[1].trim();
      if ((id.startsWith('"') && id.endsWith('"')) || (id.startsWith("'") && id.endsWith("'"))) {
        id = id.slice(1, -1);
      }
      if (id && IDENTIFIER_RE.test(id)) rawIds.add(id);
    }
    if (rawIds.size === 0) continue;

    // Collect every id in the parsed subtree for this field (nested steps etc.)
    const parsedIds = new Set<string>();
    collectParsedIds((parsed as unknown as Record<string, unknown>)[field], parsedIds);

    for (const id of rawIds) {
      if (!parsedIds.has(id)) missing.push({ field, id });
    }
  }

  return missing;
}

/**
 * Read a .usm file from disk and return both the parsed object and any
 * parse-integrity warnings (list ids present in raw text but missing from
 * the parsed object).
 */
export function parseUsmFileWithWarnings(filePath: string): { parsed: UsmFile; warnings: string[] } {
  const absolute = path.resolve(filePath);
  const content = fs.readFileSync(absolute, "utf-8");
  const parsed = parseUsm(content);
  const warnings: string[] = [];
  for (const { field, id } of findMissingListIds(content, parsed)) {
    warnings.push(
      `entry "${id}" under \`${field}:\` appears in the raw YAML but is MISSING from the parsed data — ` +
      `it was likely swallowed by a YAML block-scalar (check indentation/tabs around this entry). ` +
      `Generated docs would silently omit it.`,
    );
  }
  return { parsed, warnings };
}

/**
 * Find all .usm files in a directory.
 */
export function findUsmFiles(dir: string): string[] {
    
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");
  return glob.sync("**/*.usm", {
    cwd: path.resolve(dir),
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
}

/**
 * Find all .usm files across all .usm/ directories in the monorepo.
 * Scans the root .usm/ plus any .usm/ directories under apps/, packages/,
 * and infrastructure/services/.
 *
 * @param root — monorepo root directory
 */
export function findAllUsmFiles(root: string): string[] {
  const resolvedRoot = path.resolve(root);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");

  // Find all directories named .usm (but not nested inside node_modules or .next)
  const usmDirs = glob.sync("**/.usm", {
    cwd: resolvedRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    onlyDirectories: true,
  });

  // The root .usm/ is already included in the glob results.
  // Now scan each .usm/ directory for .usm files.
  const allFiles: string[] = [];
  for (const dir of usmDirs) {
    const files = glob.sync("**/*.usm", {
      cwd: dir,
      absolute: true,
      ignore: ["**/node_modules/**"],
    });
    allFiles.push(...files);
  }

  return allFiles;
}

/**
 * Find all .usm/ directory paths in the monorepo.
 *
 * @param root — monorepo root directory
 */
export function findAllUsmDirs(root: string): string[] {
  const resolvedRoot = path.resolve(root);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");

  return glob.sync("**/.usm", {
    cwd: resolvedRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    onlyDirectories: true,
  });
}
