import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { parseUsmFile, isFeatureFile, findAllUsmFiles } from "../parse.js";
import type { SystemUsm, FeatureUsm, ServiceUsm, DataUsm } from "../types.js";
import { getDesignSections, DESIGN_SECTION_LABELS } from "../generators/technicalDesign.js";

type Audience = "developer" | "help";

// ─── Port helpers ─────────────────────────────────────────────────────────────

/**
 * Check if a port is free by attempting to listen on it.
 * Returns true if the port is available, false if in use.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      server.close();
      resolve(false);
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Find the next free port starting from `startPort`, up to `startPort + maxProbes`.
 * Returns the free port, or null if none found.
 */
async function findFreePort(startPort: number, maxProbes = 100): Promise<number | null> {
  for (let port = startPort; port < startPort + maxProbes; port++) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

/**
 * Get the process name/PID using a port via lsof (macOS/Linux).
 * Returns a string like "node (PID 12345)" or null if lsof is unavailable.
 */
function getPortProcess(port: number): string | null {
  try {
    const result = execSync(`lsof -i :${port} -sTCP:LISTEN -t -P -n 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    const pids = result.trim().split("\n").filter(Boolean);
    if (pids.length === 0) return null;
    const pid = pids[0];
    // Try to get the process name
    try {
      const name = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 2000,
      }).trim();
      return `${name} (PID ${pid})`;
    } catch {
      return `PID ${pid}`;
    }
  } catch {
    return null;
  }
}

// ─── PID file helpers ─────────────────────────────────────────────────────────

function pidFilePath(docsRoot: string): string {
  return path.join(docsRoot, ".vitepress.pid");
}

function readPidFile(docsRoot: string): number | null {
  const filePath = pidFilePath(docsRoot);
  try {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    const pid = parseInt(content, 10);
    if (isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

function writePidFile(docsRoot: string, pid: number): void {
  fs.writeFileSync(pidFilePath(docsRoot), String(pid), "utf-8");
}

function removePidFile(docsRoot: string): void {
  try {
    fs.unlinkSync(pidFilePath(docsRoot));
  } catch {
    // File may already be gone — ignore
  }
  // Also clean up the port companion file
  try {
    fs.unlinkSync(portFilePath(docsRoot));
  } catch {
    // ignore
  }
}

function portFilePath(docsRoot: string): string {
  return path.join(docsRoot, ".vitepress.port");
}

function readPortFile(docsRoot: string): number | null {
  try {
    const content = fs.readFileSync(portFilePath(docsRoot), "utf-8").trim();
    const port = parseInt(content, 10);
    if (isNaN(port)) return null;
    return port;
  } catch {
    return null;
  }
}

function writePortFile(docsRoot: string, port: number): void {
  fs.writeFileSync(portFilePath(docsRoot), String(port), "utf-8");
}

function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks existence without actually signaling
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface SidebarItem {
  text: string;
  link: string;
}

interface SidebarGroup {
  text: string;
  collapsed?: boolean;
  items: (SidebarItem | SidebarGroup)[];
}

/**
 * Check if VitePress is installed (optional peer dependency).
 */
function isVitePressInstalled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require.resolve("vitepress", { paths: [process.cwd()] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure VitePress is available. If missing, offer to install it
 * automatically (interactive prompt) or exit with guidance.
 */
async function requireVitePress(): Promise<void> {
  if (isVitePressInstalled()) return;

  const { execSync } = await import("node:child_process");

  // Detect the package manager from lockfiles
  const usePnpm = fs.existsSync(path.join(process.cwd(), "pnpm-lock.yaml"));
  const isMonorepo = fs.existsSync(path.join(process.cwd(), "pnpm-workspace.yaml"));
  const useNpm = fs.existsSync(path.join(process.cwd(), "package-lock.json"));

  let installCmd: string;
  if (usePnpm) {
    installCmd = isMonorepo ? "pnpm add -Dw vitepress" : "pnpm add -D vitepress";
  } else if (useNpm) {
    installCmd = "npm install -D vitepress";
  } else {
    // Default to npm
    installCmd = "npm install -D vitepress";
  }

  // Interactive prompt — offer to install automatically
  const isTTY = process.stdin.isTTY;
  if (isTTY) {
    console.log("\nVitePress is not installed (optional peer dependency for docs preview).\n");
    process.stdout.write(`Install it now with \`${installCmd}\`? [Y/n] `);

    const answer = await new Promise<string>((resolve) => {
      process.stdin.setEncoding("utf-8");
      process.stdin.resume();
      process.stdin.once("data", (data: string) => {
        process.stdin.pause();
        resolve(data.trim().toLowerCase());
      });
    });

    if (answer === "" || answer === "y" || answer === "yes") {
      console.log(`\nRunning: ${installCmd}\n`);
      try {
        execSync(installCmd, { cwd: process.cwd(), stdio: "inherit" });
        // Verify it installed
        if (isVitePressInstalled()) {
          console.log("✓ VitePress installed.\n");
          return;
        }
        // Maybe installed to a workspace root — check again after a moment
        console.error("Install completed but VitePress still not resolvable. You may need to restart your terminal or install manually.");
        process.exit(1);
      } catch {
        console.error(`\nInstall failed. Run \`${installCmd}\` manually and try again.`);
        process.exit(1);
      }
    } else {
      console.error(`\nSkipped. Install VitePress manually: \`${installCmd}\``);
      process.exit(1);
    }
  } else {
    // Non-interactive (CI, piped input) — just show the guidance
    console.error("VitePress is not installed. It's an optional dependency of USM.\n");
    console.error(`Install it with: \`${installCmd}\`\n`);
    console.error("Or use --skip-docs with usm generate to skip the docs build step.");
    process.exit(1);
  }
}

/**
 * Consolidate feature docs from scattered apps/ directories into
 * a single .usm-workspace/docs/features/ directory.
 *
 * The current generator writes feature docs to per-app .usm-workspace dirs.
 * VitePress needs everything under a single root, so we copy them in.
 */
function consolidateFeatureDocs(root: string): number {
  const docsRoot = path.join(root, ".usm-workspace", "docs");
  const featuresRoot = path.join(docsRoot, "features");
  let copied = 0;

  // Find all .usm-workspace/docs/features/ directories under apps/
  const appsDir = path.join(root, "apps");
  if (!fs.existsSync(appsDir)) return 0;

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appFeaturesDir = path.join(appsDir, entry.name, ".usm-workspace", "docs", "features");
    if (!fs.existsSync(appFeaturesDir)) continue;

    // Copy each subdirectory (cli, generators, mcp, schema) into featuresRoot
    for (const area of fs.readdirSync(appFeaturesDir, { withFileTypes: true })) {
      if (!area.isDirectory()) continue;
      const srcAreaDir = path.join(appFeaturesDir, area.name);
      const dstAreaDir = path.join(featuresRoot, area.name);

      // Copy each .md file
      for (const file of fs.readdirSync(srcAreaDir)) {
        if (!file.endsWith(".md")) continue;
        const srcFile = path.join(srcAreaDir, file);
        const dstFile = path.join(dstAreaDir, file);
        fs.mkdirSync(path.dirname(dstFile), { recursive: true });
        fs.copyFileSync(srcFile, dstFile);
        copied++;
      }
    }
  }

  return copied;
}

/**
 * Escape angle brackets in markdown for VitePress compatibility.
 *
 * VitePress uses Vue's template compiler, which interprets <word> as HTML tags.
 * This escapes <word> patterns to &lt;word&gt; in plain text while leaving
 * code blocks and inline code untouched.
 */
function escapeMarkdownForVitePress(content: string): string {
  // Split by code blocks (```...```) and inline code (`...`) to preserve them
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts
    .map((part, i) => {
      // Odd indices are code blocks/inline code — leave untouched
      if (i % 2 === 1) return part;
      // Escape <word> patterns in non-code text
      return part.replace(/<([a-zA-Z][a-zA-Z0-9_-]*)>/g, "&lt;$1&gt;");
    })
    .join("");
}

/**
 * Apply VitePress escaping to all markdown files in the docs directory.
 */
function escapeAllMarkdown(docsRoot: string): number {
  let count = 0;
  if (!fs.existsSync(docsRoot)) return 0;

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip .vitepress directory
        if (entry.name === ".vitepress") continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const escaped = escapeMarkdownForVitePress(content);
        if (escaped !== content) {
          fs.writeFileSync(fullPath, escaped, "utf-8");
          count++;
        }
      }
    }
  }

  walk(docsRoot);
  return count;
}

/**
 * Files/directories to exclude from help docs (developer-only content).
 */
const HELP_EXCLUDE_PATHS = [
  "deployment.md",
  "togaf",
  "archimate",
  "testing",
  "api/openapi.yaml",
  "api",
  "risks.md",
  "architecture",
  "data",
  // Internal/meta areas — USM describing its own generators, MCP tool build
  // specs, schema-development specs, and internal module docs. Consumers want
  // the reference pages (cli-reference, mcp-reference, schema-reference), not
  // the per-feature build specs behind them.
  "features/generators",
  "features/mcp",
  "features/schema",
  "features/docs-and-schema-improvements",
  "shared-services",
  "packages",
];

/**
 * Check if a feature should be included in help docs.
 * Include if: visibility is "public" OR status is "built" (and not explicitly "internal").
 */
function shouldIncludeInHelpDocs(featurePath: string): boolean {
  try {
    const parsed = parseUsmFile(featurePath);
    if (!isFeatureFile(parsed)) return false;
    const feature = parsed as FeatureUsm;
    // Explicit visibility overrides everything
    if (feature.visibility === "public") return true;
    if (feature.visibility === "internal") return false;
    // Include if built, active, or no status (legacy features)
    // Exclude only planned, in-progress, and deprecated
    if (feature.status === "planned" || feature.status === "in-progress" || feature.status === "deprecated") {
      return false;
    }
    return true; // built, active, or undefined
  } catch {
    return false;
  }
}

/**
 * Simplify a feature doc for help audience — remove contracts, tests, implementation, decisions.
 * Keep: title, summary, status, intent, flows (as numbered steps).
 */
function simplifyFeatureDoc(content: string): string {
  // Help docs keep: title, summary, status, intent, flows.
  // Drop developer-heavy sections (contracts, tests, implementation, decisions…).
  const sectionsToRemove = [
    "## Contracts",
    "## Tests",
    "## Implementation",
    "## Decisions",
    "## See Also",
    "## Interfaces",
    "## Flow Diagrams",
  ];

  const lines = content.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (sectionsToRemove.some((s) => line.startsWith(s))) {
      skipping = true;
      continue;
    }
    if (skipping && line.startsWith("## ") && !sectionsToRemove.some((s) => line.startsWith(s))) {
      skipping = false;
    }
    if (!skipping) {
      result.push(line);
    }
  }

  // Keep lean for public readers — homepage/getting-started own onboarding callouts
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Copy and filter docs from docsRoot into helpRoot for the help audience.
 * - Excludes developer-only pages (deployment, TOGAF, ArchiMate, testing, API)
 * - Excludes features that aren't built (unless visibility: public)
 * - Simplifies feature docs (removes contracts, tests, implementation, decisions)
 */
/**
 * Remove markdown table rows and list items whose link target doesn't exist
 * in the help-docs tree. Fixes dead links in index/roadmap pages after
 * feature filtering removes the target pages.
 */
function stripDeadLinks(content: string, dirPath: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown table row: | text | [link](path) | ... — skip if link target missing
    const linkMatch = line.match(/\[([^\]]*)\]\(([^)]+)\)/);
    if (linkMatch) {
      const target = linkMatch[2];
      // Only check relative .md links (not http URLs or anchors)
      if (!target.startsWith("http") && !target.startsWith("#") && target.endsWith(".md")) {
        const targetPath = path.resolve(dirPath, target);
        if (!fs.existsSync(targetPath)) {
          // Skip this line (table row or list item with a dead link)
          continue;
        }
      }
    }

    result.push(line);
  }

  // Clean up: remove empty tables (header + separator with no rows)
  return result.join("\n").replace(/\|.*\|\n\|[-| :]+\|\n\n/g, "");
}

export function filterForHelpAudience(root: string, docsRoot: string, helpRoot: string): number {
  let copied = 0;

  // Clean help root
  if (fs.existsSync(helpRoot)) {
    fs.rmSync(helpRoot, { recursive: true });
  }
  fs.mkdirSync(helpRoot, { recursive: true });

  // Copy docs, excluding developer-only content and non-built features
  function copyFiltered(srcDir: string, dstDir: string, relBase: string) {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const relPath = path.join(relBase, entry.name);

      // Skip excluded paths (deployment, TOGAF, ArchiMate, testing, API)
      if (HELP_EXCLUDE_PATHS.some((p) => relPath === p || relPath.startsWith(p + "/"))) {
        continue;
      }

      if (entry.isDirectory()) {
        const dstPath = path.join(dstDir, entry.name);
        fs.mkdirSync(dstPath, { recursive: true });
        copyFiltered(srcPath, dstPath, relPath);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".yaml")) {
        // For feature docs, check if the feature should be included in help docs
        if (relPath.startsWith("features/") && entry.name !== "index.md") {
          // Look up the .usm source to check status/visibility
          const usmRelPath = relPath.replace(/\.md$/, ".usm");
          const usmPath = path.join(root, ".usm", "features", usmRelPath.replace(/^features\//, ""));
          if (fs.existsSync(usmPath)) {
            if (!shouldIncludeInHelpDocs(usmPath)) {
              continue; // Skip this feature
            }
          }
        }

        const dstPath = path.join(dstDir, entry.name);
        let content = fs.readFileSync(srcPath, "utf-8");

        // Simplify feature docs (remove contracts, tests, implementation, decisions)
        if (relPath.startsWith("features/") && entry.name !== "index.md") {
          content = simplifyFeatureDoc(content);
        }

        // Strip links to pages that don't exist in the help-docs tree
        // (area-overview indexes and roadmap reference filtered-out features)
        content = stripDeadLinks(content, path.dirname(dstPath));

        fs.writeFileSync(dstPath, content, "utf-8");
        copied++;
      }
    }
  }

  copyFiltered(docsRoot, helpRoot, "");
  return copied;
}

/**
 * Common acronyms for area display names.
 * Maps lowercase area directory names to proper display names.
 * Works for any codebase — extends the map with project-specific acronyms.
 */
const AREA_ACRONYMS: Record<string, string> = {
  cli: "CLI",
  mcp: "MCP",
  api: "API",
  db: "Database",
  idp: "IDP",
  orm: "ORM",
  ui: "UI",
};

function areaDisplayName(area: string): string {
  return AREA_ACRONYMS[area.toLowerCase()]
    || area.charAt(0).toUpperCase() + area.slice(1);
}

/**
 * Status priority for sorting: active features first, planned last.
 */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  built: 1,
  "in-progress": 2,
  experimental: 3,
  planned: 4,
  deprecated: 5,
};

/**
 * Generate a VitePress sidebar from the system.usm index and feature files.
 * Only includes links to files that actually exist in the docs directory.
 *
 * Five-group template (applies to any project):
 *   1. Getting Started — Home, Getting Started
 *   2. Design — 13 section pages (only rendered ones)
 *   3. Project Management — Roadmap, Features (grouped by area), Decision Register
 *   4. Developers — Source Map, Test Coverage, Spec Coverage, API Reference, CLI Reference, Configuration
 *   5. Exports — TOGAF Phases, ArchiMate Model (collapsed)
 *
 * Groups and pages only appear when their data exists.
 */
function generateSidebar(root: string, docsRoot: string, audience: Audience = "developer"): SidebarGroup[] {
  const systemPath = path.join(root, ".usm", "system.usm");
  const featuresRoot = path.join(docsRoot, "features");
  const sidebar: SidebarGroup[] = [];

  function docExists(relPath: string): boolean {
    return (
      fs.existsSync(path.join(docsRoot, relPath + ".md")) ||
      fs.existsSync(path.join(docsRoot, relPath, "index.md"))
    );
  }

  function pushIfAny(text: string, items: SidebarItem[], collapsed = false): void {
    if (items.length === 0) return;
    sidebar.push(collapsed ? { text, collapsed: true, items } : { text, items });
  }

  // ── 1. Getting Started ──────────────────────────────────────────────────────
  const gettingStarted: SidebarItem[] = [];
  gettingStarted.push({ text: "Home", link: "/" });
  if (docExists("getting-started")) {
    gettingStarted.push({ text: "Getting Started", link: "/getting-started" });
  }
  if (audience === "developer" && docExists("agent-setup-guide")) {
    gettingStarted.push({ text: "Agent Setup Guide", link: "/agent-setup-guide" });
  }
  pushIfAny("Getting Started", gettingStarted);

  if (!fs.existsSync(systemPath)) return sidebar;
  const system = parseUsmFile(systemPath) as SystemUsm;

  // Parse all .usm files for design section detection
  const allUsmPaths = findAllUsmFiles(root);
  const serviceFiles: ServiceUsm[] = [];
  const featureFiles: FeatureUsm[] = [];
  const dataFiles: DataUsm[] = [];
  for (const p of allUsmPaths) {
    try {
      const parsed = parseUsmFile(p);
      if (parsed.$type === "service") serviceFiles.push(parsed as ServiceUsm);
      else if (parsed.$type === "feature") featureFiles.push(parsed as FeatureUsm);
      else if (parsed.$type === "data") dataFiles.push(parsed as DataUsm);
    } catch { /* ignore */ }
  }

  // ── 2. Design (13 section pages, only rendered ones) ───────────────────────
  const designSections = getDesignSections(system, serviceFiles, featureFiles, dataFiles);
  const designItems: SidebarItem[] = [];
  for (const sectionId of designSections) {
    const label = DESIGN_SECTION_LABELS[sectionId] || sectionId;
    designItems.push({ text: label, link: `/design/${sectionId}` });
  }
  pushIfAny("Design", designItems);

  // ── 3. Project Management ──────────────────────────────────────────────────
  const pmItems: (SidebarItem | SidebarGroup)[] = [];

  // Roadmap
  if (docExists("roadmap")) {
    pmItems.push({ text: "Roadmap", link: "/roadmap" });
  }

  // Features (grouped by service/area)
  const coveredLinks = new Set<string>();
  const coverLink = (link: string): void => {
    coveredLinks.add(link.replace(/\/+$/, ""));
  };

  const featuresByArea = new Map<string, SidebarItem[]>();
  const flatFeatures: SidebarItem[] = [];
  if (system.index) {
    for (const feat of system.index) {
      const refMatch = feat.ref.match(/\.usm\/features\/([^/]+)\/(.+?)\.usm$/);
      if (!refMatch) continue;
      const area = refMatch[1];
      const slug = refMatch[2];
      const areaDisplay = areaDisplayName(area);
      const relPath = `features/${area}/${slug}`;
      if (!docExists(relPath)) continue;
      if (!featuresByArea.has(areaDisplay)) featuresByArea.set(areaDisplay, []);
      const statusBadge = feat.status === "planned" ? " [planned]"
        : feat.status === "deprecated" ? " [deprecated]"
        : feat.status === "in-progress" ? " [in-progress]"
        : "";
      featuresByArea.get(areaDisplay)!.push({
        text: `${feat.name}${statusBadge}`,
        link: `/${relPath}`,
      });
      coverLink(`/${relPath}`);
    }
  }

  // Feature docs on disk not covered by system.index
  if (fs.existsSync(featuresRoot)) {
    const diskFeaturesByArea = new Map<string, SidebarItem[]>();
    const titleFromSlug = (slug: string): string =>
      slug.split(/[-_/]/).map((w) => AREA_ACRONYMS[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const addDiskFeature = (areaDisplay: string | null, slug: string, link: string): void => {
      if (coveredLinks.has(link.replace(/\/+$/, ""))) return;
      const item = { text: titleFromSlug(slug), link };
      if (areaDisplay === null) flatFeatures.push(item);
      else {
        if (!diskFeaturesByArea.has(areaDisplay)) diskFeaturesByArea.set(areaDisplay, []);
        diskFeaturesByArea.get(areaDisplay)!.push(item);
      }
      coverLink(link);
    };
    const featureEntries = fs.readdirSync(featuresRoot, { withFileTypes: true });
    for (const entry of featureEntries) {
      if (entry.isDirectory()) {
        const indexPath = path.join(featuresRoot, entry.name, "index.md");
        if (fs.existsSync(indexPath)) {
          addDiskFeature(null, entry.name, `/features/${entry.name}/`);
        } else {
          const areaDisplay = areaDisplayName(entry.name);
          const areaDir = path.join(featuresRoot, entry.name);
          for (const md of fs.readdirSync(areaDir)) {
            if (md.endsWith(".md") && md !== "index.md") {
              const slug = md.replace(/\.md$/, "");
              addDiskFeature(areaDisplay, `${entry.name}/${slug}`, `/features/${entry.name}/${slug}`);
            }
          }
        }
      } else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
        addDiskFeature(null, entry.name.replace(/\.md$/, ""), `/features/${entry.name.replace(/\.md$/, "")}`);
      }
    }
    for (const [areaDisplay, items] of [...diskFeaturesByArea.entries()].sort()) {
      items.sort((a, b) => a.text.localeCompare(b.text));
      featuresByArea.set(areaDisplay, [...(featuresByArea.get(areaDisplay) || []), ...items]);
    }
  }

  if (featuresByArea.size > 0 || flatFeatures.length > 0) {
    const featureSubGroups: (SidebarItem | SidebarGroup)[] = [];
    for (const [area, items] of [...featuresByArea.entries()].sort()) {
      items.sort((a, b) => {
        const aStatus = a.text.includes("[planned]") ? STATUS_ORDER["planned"]
          : a.text.includes("[in-progress]") ? STATUS_ORDER["in-progress"]
          : a.text.includes("[deprecated]") ? STATUS_ORDER["deprecated"]
          : STATUS_ORDER["active"];
        const bStatus = b.text.includes("[planned]") ? STATUS_ORDER["planned"]
          : b.text.includes("[in-progress]") ? STATUS_ORDER["in-progress"]
          : b.text.includes("[deprecated]") ? STATUS_ORDER["deprecated"]
          : STATUS_ORDER["active"];
        if (aStatus !== bStatus) return aStatus - bStatus;
        return a.text.localeCompare(b.text);
      });
      featureSubGroups.push({ text: area, collapsed: true, items });
    }
    flatFeatures.sort((a, b) => a.text.localeCompare(b.text));
    featureSubGroups.unshift(...flatFeatures);
    pmItems.push({ text: "Features", collapsed: true, items: featureSubGroups });
  }

  // Decision Register
  if (docExists("design/decision-register")) {
    pmItems.push({ text: "Decision Register", link: "/design/decision-register" });
  }

  if (pmItems.length > 0) {
    sidebar.push({ text: "Project Management", items: pmItems });
  }

  // ── 4. Developers ──────────────────────────────────────────────────────────
  const devItems: SidebarItem[] = [];

  // Source Map / Test Coverage / Spec Coverage
  if (docExists("code-navigator")) devItems.push({ text: "Source Map", link: "/code-navigator" });
  if (docExists("spec-coverage")) devItems.push({ text: "Spec Coverage", link: "/spec-coverage" });
  if (docExists("orphan-files")) devItems.push({ text: "Orphan Files", link: "/orphan-files" });

  // Reference pages (only if data exists)
  if (audience === "developer" && docExists("schema-reference")) {
    devItems.push({ text: "Schema Reference", link: "/schema-reference" });
  }
  if (docExists("cli-reference")) devItems.push({ text: "CLI Reference", link: "/cli-reference" });
  if (docExists("config-reference")) devItems.push({ text: "Configuration", link: "/config-reference" });
  if (docExists("mcp-reference")) devItems.push({ text: "MCP Tools", link: "/mcp-reference" });

  // Per-app API reference
  const apiRefDirs = fs.readdirSync(docsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(docsRoot, e.name, "api-reference.md")));
  for (const dir of apiRefDirs) {
    devItems.push({ text: `${areaDisplayName(dir.name)} API`, link: `/${dir.name}/api-reference` });
  }

  pushIfAny("Developers", devItems, true);

  // ── 5. Exports (collapsed) ──────────────────────────────────────────────────
  if (audience === "developer") {
    const exportItems: (SidebarItem | SidebarGroup)[] = [];

    // TOGAF Phases
    const togafGroup: SidebarItem[] = [];
    if (docExists("architecture/architecture")) {
      togafGroup.push({ text: "Overview", link: "/architecture/architecture" });
    }
    const togafPages: Array<{ file: string; label: string }> = [
      { file: "architecture/A-architecture-vision", label: "Phase A — Vision" },
      { file: "architecture/B-business-architecture", label: "Phase B — Business" },
      { file: "architecture/C1-data-architecture", label: "Phase C1 — Data" },
      { file: "architecture/C2-application-architecture", label: "Phase C2 — Application" },
      { file: "architecture/D-technology-architecture", label: "Phase D — Technology" },
      { file: "architecture/E-opportunities-and-solutions", label: "Phase E — Solutions" },
      { file: "architecture/G-implementation-governance", label: "Phase G — Governance" },
      { file: "architecture/H-architecture-change-management", label: "Phase H — Change Mgmt" },
    ];
    for (const page of togafPages) {
      if (docExists(page.file)) togafGroup.push({ text: page.label, link: `/${page.file}` });
    }

    // ArchiMate
    const archiGroup: SidebarItem[] = [];
    if (docExists("architecture/archimate")) {
      archiGroup.push({ text: "ArchiMate Model", link: "/architecture/archimate" });
    }

    if (togafGroup.length > 0) exportItems.push({ text: "TOGAF Phases", collapsed: true, items: togafGroup });
    if (archiGroup.length > 0) exportItems.push({ text: "ArchiMate", collapsed: true, items: archiGroup });

    // Risks (if not already in Design)
    if (docExists("risks")) {
      exportItems.push({ text: "Risks", link: "/risks" });
    }

    if (exportItems.length > 0) {
      sidebar.push({ text: "Exports", collapsed: true, items: exportItems });
    }
  }

  // ── Help audience extras ────────────────────────────────────────────────────
  if (audience === "help") {
    const helpExtras: SidebarItem[] = [];
    if (docExists("language-support")) helpExtras.push({ text: "Language Support", link: "/language-support" });
    if (docExists("feedback")) helpExtras.push({ text: "Report Issue", link: "/feedback" });
    pushIfAny("Help", helpExtras, true);
  }

  return sidebar;
}

/**
 * Generate the VitePress config file.
 */
function generateVitePressConfig(root: string, docsRoot: string, audience: Audience = "developer"): string {
  const systemPath = path.join(root, ".usm", "system.usm");
  let title = "USM";
  let description = "Universal System Map";
  let repoUrl = "";

  if (fs.existsSync(systemPath)) {
    const system = parseUsmFile(systemPath) as SystemUsm;
    title = system.identity?.name || title;
    description = system.summary?.split("\n")[0]?.slice(0, 120) || description;
    repoUrl = system.identity?.repository || "";
  }

  const sidebar = generateSidebar(root, docsRoot, audience);
  const sidebarJson = JSON.stringify(sidebar, null, 2);

  // Build social links from repo URL (generic — any project)
  const socialLinks = repoUrl
    ? `[{ icon: 'github', link: ${JSON.stringify(repoUrl)} }]`
    : "[]";

  // Build edit link from repo URL (generic — points to .usm source)
  const editLink = repoUrl
    ? `editLink: {
      pattern: ${JSON.stringify(repoUrl + "/tree/main/.usm")},
      text: 'Edit .usm source'
    },`
    : "";

  // Build nav bar (generic — any project gets Report Issue if repo is configured)
  const navItems: string[] = [];
  if (repoUrl) {
    navItems.push(`{ text: 'Report Issue', link: '/feedback' }`);
  }
  const navJson = navItems.length > 0
    ? `nav: [\n    ${navItems.join(",\n    ")}\n  ],`
    : "";

  // Version badge for footer (best-effort from package.json)
  let pkgVersion = "";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(root, "package.json"), "utf-8"),
    ) as { version?: string };
    pkgVersion = pkg.version || "";
  } catch {
    /* optional */
  }
  const generatedAt = new Date().toISOString().slice(0, 10);
  const footerMessage = pkgVersion
    ? `Generated by <a href="https://github.com/Smith-Gray-Pty-Ltd/usm">@smithgray/usm</a> v${pkgVersion} · ${generatedAt} · <a href="https://usm.dev">usm.dev</a>`
    : `Generated by <a href="https://github.com/Smith-Gray-Pty-Ltd/usm">@smithgray/usm</a> · ${generatedAt} · <a href="https://usm.dev">usm.dev</a>`;

  // Mermaid: dynamically load CDN, then render .language-mermaid blocks.
  // VitePress renders ```mermaid as <div class="language-mermaid"><pre><code>...</code></pre></div>.
  // We extract raw text from <pre><code>, set as div.textContent, then mermaid.run() renders SVG.
  // MutationObserver handles SPA nav. Dark mode clears data-processed and re-renders.

  // Layout: full-screen flex — content fills the viewport beside the sidebar.
  // No centered max-width cap; the sidebar takes its natural width and the
  // doc area takes the rest. Paragraph line-length stays readable via a
  // max-width on prose elements only (not the container).
  const layoutCss =
    ":root{--vp-layout-max-width:100%}" +
    ".VPDoc.has-sidebar .content-container{max-width:100%!important}" +
    ".vp-doc :not(pre) > p{max-width:80ch}";

  const mermaidBoot =
    "(function(){" +
    "var s=document.createElement('script');" +
    "s.src='https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';" +
    "s.onload=function(){" +
    "mermaid.initialize({startOnLoad:false," +
    "theme:document.documentElement.classList.contains('dark')?'dark':'default'," +
    "securityLevel:'loose'});" +
    "function render(){" +
    "var els=document.querySelectorAll('.language-mermaid:not([data-mermaid-done])');" +
    "for(var i=0;i<els.length;i++){" +
    "var el=els[i];el.setAttribute('data-mermaid-done','1');" +
    "var code=el.querySelector('pre code');" +
    "if(code)el.textContent=code.textContent;" +
    "}" +
    "if(els.length)mermaid.run({querySelector:'.language-mermaid[data-mermaid-done]'}).catch(function(){});" +
    "}" +
    "render();" +
    // SPA navigation: detect new .language-mermaid blocks
    "try{new MutationObserver(function(ms){" +
    "for(var i=0;i<ms.length;i++)" +
    "for(var j=0;j<ms[i].addedNodes.length;j++){" +
    "var n=ms[i].addedNodes[j];" +
    "if(n.nodeType===1&&(n.classList&&n.classList.contains('language-mermaid')||" +
    "n.querySelectorAll&&n.querySelectorAll('.language-mermaid').length))" +
    "{render();return;}" +
    "}" +
    "}).observe(document.body,{childList:true,subtree:true});}catch(e){}" +
    // Dark mode: clear data-mermaid-done and re-render
    "try{new MutationObserver(function(){" +
    "mermaid.initialize({startOnLoad:false," +
    "theme:document.documentElement.classList.contains('dark')?'dark':'default'," +
    "securityLevel:'loose'});" +
    "document.querySelectorAll('.language-mermaid[data-mermaid-done]').forEach(function(el){" +
    "el.removeAttribute('data-mermaid-done');" +
    "el.innerHTML='<pre><code>'+el.textContent+'</code></pre>';" +
    "});" +
    "render();" +
    "}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});}catch(e){}" +
    "};" +
    "document.head.appendChild(s);" +
    "})();";

  const sitemapHost = audience === "help" ? "https://docs.usm.dev" : "https://dev-docs.usm.dev";

  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
  cleanUrls: true,
  ignoreDeadLinks: true,
  outDir: '.vitepress/dist',
  lastUpdated: true,
  sitemap: { hostname: ${JSON.stringify(sitemapHost)} },
  head: [
    ['script', {}, ${JSON.stringify(mermaidBoot)}],
    ['style', {}, ${JSON.stringify(layoutCss)}]
  ],
  themeConfig: {
    ${navJson}
    sidebar: ${sidebarJson},
    search: {
      provider: 'local'
    },
    outline: { level: [2, 3] },
    ${editLink}
    socialLinks: ${socialLinks},
    footer: {
      message: ${JSON.stringify(footerMessage)},
      copyright: ${JSON.stringify(title)}
    }
  }
})
`;
}

/**
 * VitePress uses index.md as the home page, but the generator produces README.md.
 * Copy README.md → index.md so VitePress serves it at /.
 */
function ensureIndexPage(docsRoot: string): void {
  const readme = path.join(docsRoot, "README.md");
  const index = path.join(docsRoot, "index.md");
  if (fs.existsSync(readme)) {
    fs.copyFileSync(readme, index);
  }
}

/**
 * Write the VitePress config and run vitepress build.
 */
export async function docsBuild(root: string, audience: Audience = "developer"): Promise<void> {
  await requireVitePress();

  // Determine docs root based on audience
  const docsRoot = audience === "help"
    ? path.join(root, ".usm-workspace", "help-docs")
    : path.join(root, ".usm-workspace", "docs");

  if (!fs.existsSync(docsRoot)) {
    if (audience === "help") {
      console.error("No help docs found. Run 'usm generate --only help-docs' first.");
    } else {
      console.error("No docs found. Run 'usm generate' first.");
    }
    process.exit(1);
  }

  // For developer audience, consolidate + escape (help docs are pre-filtered)
  if (audience === "developer") {
    const copied = consolidateFeatureDocs(root);
    if (copied > 0) {
      console.log(`Consolidated ${copied} feature doc(s) into .usm-workspace/docs/features/`);
    }
    const escaped = escapeAllMarkdown(docsRoot);
    if (escaped > 0) {
      console.log(`Escaped angle brackets in ${escaped} file(s) for VitePress`);
    }
    ensureIndexPage(docsRoot);
  }

  // Ensure index.md for help audience too (VitePress needs it, not README.md)
  if (audience === "help") {
    ensureIndexPage(docsRoot);
    // Escape angle brackets in help docs (filter copies raw markdown)
    const escaped = escapeAllMarkdown(docsRoot);
    if (escaped > 0) {
      console.log(`Escaped angle brackets in ${escaped} help file(s) for VitePress`);
    }
  }

  // Step 5: Generate VitePress config
  const configDir = path.join(docsRoot, ".vitepress");
  fs.mkdirSync(configDir, { recursive: true });
  const configContent = generateVitePressConfig(root, docsRoot, audience);
  fs.writeFileSync(path.join(configDir, "config.mts"), configContent, "utf-8");
  console.log("Generated .vitepress/config.mts");

  // Step 6: Build
  console.log("\nBuilding static site...");
  const child = spawn("npx", ["vitepress", "build", docsRoot], {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
  });

  await new Promise<void>((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✓ Static site built: ${path.join(docsRoot, ".vitepress", "dist")}`);
        resolve();
      } else {
        reject(new Error(`vitepress build exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

export interface DocsServeOptions {
  port: number;
  audience?: Audience;
  autoPort?: boolean;
  restart?: boolean;
  watch?: boolean;
  open?: boolean;
}

/**
 * Write the VitePress config and run vitepress dev server.
 * Supports port checking, already-serving detection, watch mode, and graceful shutdown.
 */
export async function docsServe(root: string, options: DocsServeOptions): Promise<void> {
  const { port: requestedPort, audience = "developer", autoPort = false, restart = false, watch = false, open = false } = options;
  await requireVitePress();

  // Determine docs root based on audience
  const docsRoot = audience === "help"
    ? path.join(root, ".usm-workspace", "help-docs")
    : path.join(root, ".usm-workspace", "docs");

  if (!fs.existsSync(docsRoot)) {
    if (audience === "help") {
      console.error("No help docs found. Run 'usm generate --only help-docs' first.");
    } else {
      console.error("No docs found. Run 'usm generate' first.");
    }
    process.exit(1);
  }

  // ── Already-serving detection ────────────────────────────────────────────
  const existingPid = readPidFile(docsRoot);
  if (existingPid && isProcessAlive(existingPid)) {
    if (restart) {
      console.log(`Stopping existing server (PID ${existingPid})...`);
      try { process.kill(existingPid, "SIGTERM"); } catch { /* already gone */ }
      removePidFile(docsRoot);
      // Give it a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
    } else {
      console.log(`Docs already served at http://localhost:${requestedPort} (PID ${existingPid}).`);
      console.log("Use --restart to restart, or usm docs stop to stop.");
      return;
    }
  } else if (existingPid) {
    // Stale PID file — clean it up
    removePidFile(docsRoot);
  }

  // ── Port check ───────────────────────────────────────────────────────────
  let port = requestedPort;
  const portFree = await isPortFree(port);

  if (!portFree) {
    if (autoPort) {
      const nextPort = await findFreePort(port);
      if (nextPort === null) {
        console.error(`No free port found between ${port} and ${port + 99}.`);
        process.exit(1);
      }
      const processInfo = getPortProcess(port);
      const processStr = processInfo ? ` by ${processInfo}` : "";
      console.log(`Port ${port} is in use${processStr}, using port ${nextPort} instead.`);
      port = nextPort;
    } else {
      const processInfo = getPortProcess(port);
      const processStr = processInfo ? ` by ${processInfo}` : "";
      console.error(`Port ${port} is in use${processStr}.`);
      console.error(`Use --port N to pick a different port, --auto-port to auto-select, or --restart to restart an existing server.`);
      process.exit(1);
    }
  }

  // ── Prepare docs ─────────────────────────────────────────────────────────
  if (audience === "developer") {
    const copied = consolidateFeatureDocs(root);
    if (copied > 0) {
      console.log(`Consolidated ${copied} feature doc(s) into .usm-workspace/docs/features/`);
    }
    const escaped = escapeAllMarkdown(docsRoot);
    if (escaped > 0) {
      console.log(`Escaped angle brackets in ${escaped} file(s) for VitePress`);
    }
    ensureIndexPage(docsRoot);
  }

  if (audience === "help") {
    ensureIndexPage(docsRoot);
    const escaped = escapeAllMarkdown(docsRoot);
    if (escaped > 0) {
      console.log(`Escaped angle brackets in ${escaped} help file(s) for VitePress`);
    }
  }

  // ── Generate VitePress config ─────────────────────────────────────────────
  const configDir = path.join(docsRoot, ".vitepress");
  fs.mkdirSync(configDir, { recursive: true });
  const configContent = generateVitePressConfig(root, docsRoot, audience);
  fs.writeFileSync(path.join(configDir, "config.mts"), configContent, "utf-8");
  console.log("Generated .vitepress/config.mts");

  // ── Start VitePress ──────────────────────────────────────────────────────
  console.log(`\nStarting dev server on port ${port}...`);
  const child = spawn("npx", ["vitepress", "dev", docsRoot, "--port", String(port)], {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
  });

  // Write PID file
  if (child.pid) {
    writePidFile(docsRoot, child.pid);
    writePortFile(docsRoot, port);
  }

  // ── Open browser ─────────────────────────────────────────────────────────
  if (open) {
    const url = `http://localhost:${port}`;
    // Small delay to let VitePress start
    setTimeout(() => {
      const platform = process.platform;
      try {
        if (platform === "darwin") {
          spawn("open", [url], { stdio: "ignore", detached: true });
        } else if (platform === "win32") {
          spawn("cmd", ["/c", "start", url], { stdio: "ignore", detached: true });
        } else {
          spawn("xdg-open", [url], { stdio: "ignore", detached: true });
        }
      } catch {
        // Browser open is best-effort
      }
    }, 1500);
  }

  // ── Watch mode ───────────────────────────────────────────────────────────
  let watchCleanup: (() => void) | undefined;
  if (watch) {
    watchCleanup = startWatchMode(root, docsRoot, audience);
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const cleanup = () => {
    if (watchCleanup) watchCleanup();
    if (child.pid && isProcessAlive(child.pid)) {
      try { process.kill(child.pid, "SIGTERM"); } catch { /* ignore */ }
    }
    removePidFile(docsRoot);
  };

  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // Keep the process alive
  await new Promise<void>((resolve) => {
    child.on("close", () => {
      removePidFile(docsRoot);
      resolve();
    });
  });
}

/**
 * Start watching .usm/ files and regenerate docs on changes.
 * Returns a cleanup function to stop watching.
 */
function startWatchMode(root: string, docsRoot: string, audience: Audience): () => void {
  const usmDir = path.join(root, ".usm");
  if (!fs.existsSync(usmDir)) {
    console.log("No .usm/ directory found — watch mode disabled.");
    return () => {};
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let changedCount = 0;

  const regenerate = async () => {
    if (changedCount === 0) return;
    const count = changedCount;
    changedCount = 0;

    try {
      // Run generate in-process via a subprocess call to the built CLI
      const { execSync } = await import("node:child_process");
      const cliPath = path.join(root, "dist", "cli", "index.js");
      const fallbackPath = path.join(root, "src", "cli", "index.ts");
      let cmd: string;
      if (fs.existsSync(cliPath)) {
        cmd = `node "${cliPath}" generate --only docs`;
      } else if (fs.existsSync(fallbackPath)) {
        cmd = `npx tsx "${fallbackPath}" generate --only docs`;
      } else {
        throw new Error("Could not find CLI entrypoint (dist or src)");
      }
      execSync(cmd, { cwd: root, stdio: "pipe", timeout: 30000 });
      console.log(`Regenerated docs (${count} file${count !== 1 ? "s" : ""} changed)`);
    } catch (err) {
      console.error("Watch regeneration failed:", (err as Error).message);
    }
  };

  // Watch .usm/ recursively — walk all subdirectories and watch each
  const watchedWatchers: fs.FSWatcher[] = [];

  const watchDir = (dir: string) => {
    try {
      const watcher = fs.watch(dir, { recursive: false }, (_event, filename) => {
        if (filename && filename.endsWith(".usm")) {
          changedCount++;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(regenerate, 500);
        }
      });
      watchedWatchers.push(watcher);
    } catch {
      // ignore — directory may have been removed
    }
  };

  // Watch the root .usm/ dir and all subdirectories recursively
  const walkAndWatch = (dir: string) => {
    watchDir(dir);
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walkAndWatch(path.join(dir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  };

  walkAndWatch(usmDir);
  console.log(`Watching .usm/ for changes (recursive, ${watchedWatchers.length} directories)...`);

  return () => {
    for (const w of watchedWatchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

/**
 * Check if a docs server is running and print its status.
 */
export function docsStatus(root: string, audience: Audience = "developer"): void {
  const docsRoot = audience === "help"
    ? path.join(root, ".usm-workspace", "help-docs")
    : path.join(root, ".usm-workspace", "docs");

  const pid = readPidFile(docsRoot);
  if (pid && isProcessAlive(pid)) {
    // Read the port from the PID file's companion file
    const port = readPortFile(docsRoot) || 5173;
    console.log(`Served at http://localhost:${port} (PID ${pid})`);
  } else {
    if (pid) removePidFile(docsRoot);
    console.log("Not running");
  }
}

/**
 * Stop a running docs server.
 */
export function docsStop(root: string, audience: Audience = "developer"): void {
  const docsRoot = audience === "help"
    ? path.join(root, ".usm-workspace", "help-docs")
    : path.join(root, ".usm-workspace", "docs");

  const pid = readPidFile(docsRoot);
  if (!pid) {
    console.log("No docs server is running.");
    return;
  }

  if (!isProcessAlive(pid)) {
    removePidFile(docsRoot);
    console.log("No docs server is running (stale PID file cleaned up).");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    removePidFile(docsRoot);
    console.log(`Stopped docs server (was PID ${pid}).`);
  } catch {
    removePidFile(docsRoot);
    console.log(`Failed to stop PID ${pid} (PID file cleaned up).`);
  }
}
