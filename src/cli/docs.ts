import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseUsmFile, isFeatureFile } from "../parse.js";
import type { SystemUsm, FeatureUsm } from "../types.js";

type Audience = "developer" | "help";

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
 * Print helpful error if VitePress is missing.
 */
function requireVitePress(): void {
  if (!isVitePressInstalled()) {
    console.error("VitePress is not installed. It's an optional dependency of USM.");
    console.error("\nInstall it with:");
    console.error("  pnpm add -D vitepress");
    console.error("  # or");
    console.error("  npm install -D vitepress");
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
 * Help audience uses the public-facing group order:
 *   Getting Started · Core Concepts · Workflows · Schema Reference ·
 *   Generated Outputs · Roadmap · Contributing
 * Developer audience keeps deeper technical groups (Architecture, Deployment).
 */
function generateSidebar(root: string, docsRoot: string, audience: Audience = "developer"): SidebarGroup[] {
  const systemPath = path.join(root, ".usm", "system.usm");
  const sidebar: SidebarGroup[] = [];

  function docExists(relPath: string): boolean {
    return fs.existsSync(path.join(docsRoot, relPath + ".md"));
  }

  function pushIfAny(text: string, items: SidebarItem[], collapsed = false): void {
    if (items.length === 0) return;
    sidebar.push(collapsed ? { text, collapsed: true, items } : { text, items });
  }

  // ── Getting Started ────────────────────────────────────────────────────────
  const gettingStarted: SidebarItem[] = [];
  gettingStarted.push({ text: "Home", link: "/" });
  if (docExists("getting-started")) {
    gettingStarted.push({ text: "Getting Started", link: "/getting-started" });
  }
  if (docExists("agent-setup-guide")) {
    gettingStarted.push({ text: "Agent Setup Guide", link: "/agent-setup-guide" });
  }
  pushIfAny("Getting Started", gettingStarted);

  if (!fs.existsSync(systemPath)) return sidebar;
  const system = parseUsmFile(systemPath) as SystemUsm;

  // ── Core Concepts ──────────────────────────────────────────────────────────
  const coreConcepts: SidebarItem[] = [];
  if (docExists("schema-reference")) {
    coreConcepts.push({ text: "Schema Reference", link: "/schema-reference" });
  }
  if (docExists("language-support")) {
    coreConcepts.push({ text: "Language Support", link: "/language-support" });
  }
  // Services (shared) as concept overviews
  if (system.services) {
    for (const svc of system.services) {
      const relPath = `shared-services/${svc.id}/overview`;
      if (docExists(relPath)) {
        coreConcepts.push({ text: svc.name || svc.id, link: `/${relPath}` });
      }
    }
  }
  pushIfAny("Core Concepts", coreConcepts, true);

  // ── Workflows ──────────────────────────────────────────────────────────────
  const workflows: SidebarItem[] = [];
  if (docExists("cli-reference")) {
    workflows.push({ text: "CLI Reference", link: "/cli-reference" });
  }
  if (docExists("mcp-reference")) {
    workflows.push({ text: "MCP Tools", link: "/mcp-reference" });
  }
  if (docExists("config-reference")) {
    workflows.push({ text: "Configuration", link: "/config-reference" });
  }
  pushIfAny("Workflows", workflows);

  // ── Schema Reference (promoted for help docs) ──────────────────────────────
  // Already linked under Core Concepts; for help audience also surface as its own group
  // when schema-reference is the primary destination.
  if (audience === "help" && docExists("schema-reference")) {
    // Keep a short dedicated entry group only if not already obvious — skip duplicate
  }

  // ── Generated Outputs (features by area) ───────────────────────────────────
  const featuresByArea = new Map<string, SidebarItem[]>();
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

      // Help docs already filter non-built features; still badge planned if present
      const statusBadge = feat.status === "planned" ? " [planned]"
        : feat.status === "deprecated" ? " [deprecated]"
        : feat.status === "in-progress" ? " [in-progress]"
        : "";
      featuresByArea.get(areaDisplay)!.push({
        text: `${feat.name}${statusBadge}`,
        link: `/${relPath}`,
      });
    }
  }

  if (featuresByArea.size > 0) {
    const featureSubGroups: SidebarGroup[] = [];
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
    sidebar.push({
      text: audience === "help" ? "Generated Outputs" : "Features",
      collapsed: true,
      items: featureSubGroups,
    });
  }

  // ── Developer-only: Architecture + Deployment ──────────────────────────────
  if (audience === "developer") {
    const archItems: SidebarItem[] = [];
    if (docExists("architecture/architecture")) {
      archItems.push({ text: "System Architecture", link: "/architecture/architecture" });
    }
    if (docExists("data/models")) {
      archItems.push({ text: "Data Models", link: "/data/models" });
    }
    pushIfAny("Architecture", archItems, true);

    const deployItems: SidebarItem[] = [];
    if (docExists("deployment")) {
      deployItems.push({ text: "Deployment", link: "/deployment" });
    }
    pushIfAny("Deployment", deployItems, true);
  }

  // ── Roadmap ────────────────────────────────────────────────────────────────
  const roadmapItems: SidebarItem[] = [];
  if (docExists("roadmap")) {
    roadmapItems.push({ text: "Roadmap", link: "/roadmap" });
  }
  if (audience === "developer" && docExists("risks")) {
    roadmapItems.push({ text: "Risks", link: "/risks" });
  }
  pushIfAny("Roadmap", roadmapItems);

  // ── Contributing ───────────────────────────────────────────────────────────
  const contributing: SidebarItem[] = [];
  if (docExists("agent-setup-guide")) {
    contributing.push({ text: "Agent Setup", link: "/agent-setup-guide" });
  }
  if (docExists("feedback")) {
    contributing.push({ text: "Report Issue", link: "/feedback" });
  }
  if (system.identity?.repository) {
    // External link style not supported as sidebar item link to external in all themes;
    // keep internal pages only. Repo link lives in socialLinks / homepage CTAs.
  }
  if (docExists("cli-reference")) {
    contributing.push({ text: "CLI for contributors", link: "/cli-reference" });
  }
  pushIfAny("Contributing", contributing, true);

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

  // Mermaid: dark-mode aware. Keep this as a single-quoted JS string with no
  // nested template literals so esbuild/VitePress can parse the inline script.
  const mermaidBoot =
    "(function(){" +
    "function theme(){return document.documentElement.classList.contains('dark')?'dark':'default';}" +
    "function run(){if(typeof mermaid==='undefined')return;" +
    "mermaid.initialize({startOnLoad:false,theme:theme(),securityLevel:'loose'});" +
    "var nodes=document.querySelectorAll('pre code.language-mermaid, .mermaid');" +
    "nodes.forEach(function(el){" +
    "if(!el.getAttribute('data-original')){el.setAttribute('data-original',el.textContent||'');}" +
    "if(el.getAttribute('data-processed')){el.removeAttribute('data-processed');el.textContent=el.getAttribute('data-original');}" +
    "});" +
    "mermaid.run({querySelector:'pre code.language-mermaid, .mermaid'}).catch(function(){});" +
    "}" +
    "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run);}else{run();}" +
    "try{new MutationObserver(run).observe(document.documentElement,{attributes:true,attributeFilter:['class']});}catch(e){}" +
    "})();";

  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
  cleanUrls: true,
  ignoreDeadLinks: true,
  outDir: '.vitepress/dist',
  lastUpdated: true,
  head: [
    ['script', { src: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' }],
    ['script', {}, ${JSON.stringify(mermaidBoot)}]
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
  requireVitePress();

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

/**
 * Write the VitePress config and run vitepress dev server.
 */
export async function docsServe(root: string, port: number, audience: Audience = "developer"): Promise<void> {
  requireVitePress();

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

  // Run vitepress dev
  console.log(`\nStarting dev server on port ${port}...`);
  const child = spawn("npx", ["vitepress", "dev", docsRoot, "--port", String(port)], {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
  });

  // Keep the process alive
  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}
