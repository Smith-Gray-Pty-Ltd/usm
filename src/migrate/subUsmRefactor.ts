#!/usr/bin/env node

/**
 * One-time migration script: Move .usm files from monorepo-root .usm/ to
 * sub-.usm/ directories alongside the code they describe.
 *
 * Usage:
 *   node packages/usm/src/migrate/subUsmRefactor.ts
 *   node packages/usm/src/migrate/subUsmRefactor.ts --dry-run
 *
 * Layout after migration:
 *   .usm/system.usm              ← monorepo platform-level (stays)
 *   .usm/data/models.usm         ← cross-cutting (stays)
 *   apps/{app}/.usm/             ← app service + features
 *   infrastructure/services/{svc}/.usm/ ← shared services
 *   packages/{pkg}/.usm/         ← shared packages
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = path.resolve(process.cwd());
const USM_DIR = path.join(ROOT, ".usm");
const DRY_RUN = process.argv.includes("--dry-run");

interface ServiceEntry {
  $id: string;
  paths?: string[];
  type?: string;
}

interface FeatureEntry {
  $id: string;
  $service?: string;
  $type?: string;
}

// ─── Destination mapping ────────────────────────────────────────────────────

function serviceDestination(filePath: string): string | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content) as ServiceEntry;
  const paths = parsed.paths || [];

  // App services: paths contain "apps/{name}"
  for (const p of paths) {
    const match = p.match(/^apps\/([^/]+)/);
    if (match) {
      const appName = match[1];
      return path.join(ROOT, "apps", appName, ".usm", "services", `${appName}.usm`);
    }
  }

  // Package services: paths contain "packages/{name}"
  for (const p of paths) {
    const match = p.match(/^packages\/([^/]+)/);
    if (match) {
      const pkgName = match[1];
      return path.join(ROOT, "packages", pkgName, ".usm", "services", `${pkgName}.usm`);
    }
  }

  // Infrastructure services: paths contain "docker-compose.yml" or are known shared services
  const slug = parsed.$id.split("/").pop() || "";
  const sharedServiceSlugs = ["zitadel", "litellm", "langflow", "nango", "postgres"];

  if (sharedServiceSlugs.includes(slug)) {
    // Check if infrastructure/services/{slug} exists
    const infraDir = path.join(ROOT, "infrastructure", "services", slug);
    if (fs.existsSync(infraDir)) {
      return path.join(infraDir, ".usm", "services", `${slug}.usm`);
    }
    // Fallback: create infrastructure/services/{slug} if it doesn't exist
    return path.join(ROOT, "infrastructure", "services", slug, ".usm", "services", `${slug}.usm`);
  }

  // docker-compose.yml reference
  if (paths.some(p => p.includes("docker-compose") || p.includes("compose"))) {
    return path.join(ROOT, "infrastructure", "services", slug, ".usm", "services", `${slug}.usm`);
  }

  return null;
}

function featureDestination(filePath: string): string | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content) as FeatureEntry;

  if (!parsed.$service) return null;

  const serviceSlug = parsed.$service.split("/").pop() || "";

  // Get the relative path from .usm/features/ to preserve hierarchy
  const featuresDir = path.join(USM_DIR, "features");
  const relPath = path.relative(featuresDir, filePath);

  // Known app services
  const appSlugs = ["the-architect", "tenant", "platform", "marketing", "mobile", "desktop"];
  if (appSlugs.includes(serviceSlug)) {
    return path.join(ROOT, "apps", serviceSlug, ".usm", "features", relPath);
  }

  // Known shared services
  const sharedServiceSlugs = ["zitadel", "litellm", "langflow", "nango"];
  if (sharedServiceSlugs.includes(serviceSlug)) {
    return path.join(ROOT, "infrastructure", "services", serviceSlug, ".usm", "features", relPath);
  }

  // Package services
  const pkgSlugs = [
    "agent-smith", "ai-ui", "api", "auth", "config", "db",
    "embeddings", "llm-sdk", "theme", "types", "ui", "usm", "utils",
  ];
  if (pkgSlugs.includes(serviceSlug)) {
    return path.join(ROOT, "packages", serviceSlug, ".usm", "features", relPath);
  }

  // Unknown — put in apps/{serviceSlug} as a best guess
  return path.join(ROOT, "apps", serviceSlug, ".usm", "features", relPath);
}

// ─── Move helper ────────────────────────────────────────────────────────────

function moveFile(src: string, dest: string): void {
  const destDir = path.dirname(dest);

  if (!fs.existsSync(destDir)) {
    if (DRY_RUN) {
      console.log(`  Would create dir: ${destDir}`);
    } else {
      fs.mkdirSync(destDir, { recursive: true });
    }
  }

  if (DRY_RUN) {
    console.log(`  Would move: ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`);
  } else {
    // Copy the file to the new location
    fs.writeFileSync(dest, fs.readFileSync(src, "utf-8"), "utf-8");
    // Remove the original
    fs.unlinkSync(src);
  }
}

// ─── Clean up empty dirs ────────────────────────────────────────────────────

function removeEmptyDirs(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      removeEmptyDirs(subDir);
    }
  }

  // Check if directory is now empty (no files, no non-empty subdirs)
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    if (DRY_RUN) {
      console.log(`  Would remove empty dir: ${path.relative(ROOT, dir)}`);
    } else {
      fs.rmdirSync(dir);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`\n${DRY_RUN ? "DRY RUN" : "MIGRATION"}: Sub-.usm/ refactor`);
  console.log(`Root: ${ROOT}\n`);

  // ── Phase 1: Move service files ────────────────────────────────────────
  console.log("=== Moving service files ===");

  const servicesDir = path.join(USM_DIR, "services");
  const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith(".usm"));

  let servicesMoved = 0;
  for (const fileName of serviceFiles) {
    const src = path.join(servicesDir, fileName);
    const dest = serviceDestination(src);

    if (dest) {
      moveFile(src, dest);
      servicesMoved++;
    } else {
      console.log(`  ⚠ No destination for: ${fileName} — leaving in place`);
    }
  }

  // ── Phase 2: Move feature files ────────────────────────────────────────
  console.log("\n=== Moving feature files ===");

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");
  const featuresDir = path.join(USM_DIR, "features");
  const featureFiles = glob.sync("**/*.usm", { cwd: featuresDir, absolute: true });

  let featuresMoved = 0;
  for (const src of featureFiles) {
    const dest = featureDestination(src);

    if (dest) {
      moveFile(src, dest);
      featuresMoved++;
    } else {
      console.log(`  ⚠ No destination for: ${path.relative(ROOT, src)} — leaving in place`);
    }
  }

  // ── Phase 3: Clean up empty dirs in .usm/features/ and .usm/services/ ─
  if (!DRY_RUN) {
    console.log("\n=== Cleaning up empty directories ===");
    removeEmptyDirs(path.join(USM_DIR, "features"));
    removeEmptyDirs(path.join(USM_DIR, "services"));
  }

  console.log(`\n✓ ${DRY_RUN ? "Would move" : "Moved"} ${servicesMoved} service files`);
  console.log(`✓ ${DRY_RUN ? "Would move" : "Moved"} ${featuresMoved} feature files`);
  console.log(`\nRemaining in .usm/:`);
  const remainingFiles = glob.sync("**/*.usm", { cwd: USM_DIR, absolute: true });
  for (const f of remainingFiles) {
    console.log(`  ${path.relative(ROOT, f)}`);
  }

  console.log(`\nNew .usm/ locations:`);
  // Scan all .usm directories across the monorepo
  const allUsmDirs = glob.sync("**/.usm", {
    cwd: ROOT,
    absolute: true,
    ignore: ["**/node_modules/**", ".usm"],
    onlyDirectories: true,
  });
  // Plus the root .usm
  allUsmDirs.push(USM_DIR);
  allUsmDirs.sort();

  let totalFiles = 0;
  for (const dir of allUsmDirs) {
    const filesInDir = glob.sync("**/*.usm", { cwd: dir, absolute: true });
    if (filesInDir.length > 0) {
      console.log(`  ${path.relative(ROOT, dir)}: ${filesInDir.length} files`);
      totalFiles += filesInDir.length;
    }
  }
  console.log(`\nTotal: ${totalFiles} .usm files across ${allUsmDirs.filter((d: string) => glob.sync("**/*.usm", { cwd: d }).length > 0).length} directories`);
}

main();
