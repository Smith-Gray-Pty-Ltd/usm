/**
 * sync-versions.ts — keep all version surfaces in sync with package.json.
 *
 * Surfaces updated:
 *   - README.md  → USM:FACTS block (version, CLI commands, MCP tool count)
 *   - web/public/og-image.svg → version badge text
 *   - web/public/og-image.png → re-rasterized from SVG (if sharp available)
 *
 * Surfaces that auto-update (no action needed):
 *   - npm shields badges (https://img.shields.io/npm/v/@smithgray/usm) — live from npm
 *   - web/src/app/page.tsx hero/footer badge — reads root package.json at build time
 *
 * Usage:  pnpm run sync-versions   (or)   npx tsx scripts/sync-versions.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ─── Read the canonical version from package.json ───────────────────────────
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const version = pkg.version;

if (!version) {
  console.error("ERROR: no version field in package.json");
  process.exit(1);
}

console.log(`\n  usm.dev version sync — v${version}\n`);

let changed = 0;

// ─── 1. README.md USM:FACTS block ───────────────────────────────────────────
const readmePath = resolve(root, "README.md");
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, "utf-8");

  // The USM:FACTS block is delimited by START/END comments.
  // We only update the version line — CLI commands and MCP tool counts
  // are managed by `usm generate --only readme-facts`.
  const factsRegex = /(?<=<!-- USM:FACTS:START -->\n> \*\*Current release:\*\* `)v[0-9]+\.[0-9]+\.[0-9]+/;
  const updated = readme.replace(factsRegex, `v${version}`);

  if (updated !== readme) {
    writeFileSync(readmePath, updated);
    console.log(`  ✅ README.md — USM:FACTS version → v${version}`);
    changed++;
  } else {
    // Check if the block exists at all
    if (readme.includes("USM:FACTS:START")) {
      console.log(`  ✓  README.md — already at v${version}`);
    } else {
      console.log(`  ⚠️  README.md — no USM:FACTS block found (skip)`);
    }
  }
}

// ─── 2. OG image SVG version badge ──────────────────────────────────────────
const ogSvgPath = resolve(root, "web/public/og-image.svg");
if (existsSync(ogSvgPath)) {
  const svg = readFileSync(ogSvgPath, "utf-8");

  // Match v0.0.0 in the version badge text element
  const svgRegex = /v[0-9]+\.[0-9]+\.[0-9]+( — Free &amp; open source)/;
  const svgUpdated = svg.replace(svgRegex, `v${version}$1`);

  if (svgUpdated !== svg) {
    writeFileSync(ogSvgPath, svgUpdated);
    console.log(`  ✅ web/public/og-image.svg — version badge → v${version}`);
    changed++;

    // Try to re-rasterize the PNG if sharp is available
    try {
      const sharp = (await import("sharp")) as typeof import("sharp");
      const pngPath = resolve(root, "web/public/og-image.png");
      await sharp(svgUpdated, { density: 144 })
        .resize(1200, 630, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toFile(pngPath);
      console.log(`  ✅ web/public/og-image.png — re-rasterized`);
      changed++;
    } catch {
      console.log(`  ⚠️  og-image.png — sharp not available, SVG updated only`);
    }
  } else {
    console.log(`  ✓  web/public/og-image.svg — already at v${version}`);
  }
}

// ─── 3. Check npm published version ─────────────────────────────────────────
// This is informational only — publishing is handled by changesets.
try {
  const { execSync } = await import("node:child_process");
  const published = execSync("npm view @smithgray/usm version 2>/dev/null", {
    encoding: "utf-8",
  }).trim();
  if (published !== version) {
    console.log(`\n  ⚠️  npm published version is ${published} — package.json is ${version}`);
    console.log(`     Run changesets release flow to publish v${version} to npm.`);
  } else {
    console.log(`  ✓  npm published version matches (${version})`);
  }
} catch {
  console.log(`  ⚠️  Could not check npm published version (offline?)`);
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n  ${changed > 0 ? `${changed} file(s) updated.` : "All surfaces in sync."}\n`);