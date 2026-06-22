import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseUsmFile } from "../parse.js";
import type { SystemUsm } from "../types.js";

interface SidebarItem {
  text: string;
  link: string;
}

interface SidebarGroup {
  text: string;
  collapsed?: boolean;
  items: SidebarItem[];
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
 * Generate a VitePress sidebar from the system.usm index and feature files.
 * Only includes links to files that actually exist in the docs directory.
 */
function generateSidebar(root: string, docsRoot: string): SidebarGroup[] {
  const systemPath = path.join(root, ".usm", "system.usm");
  const sidebar: SidebarGroup[] = [];

  // Helper: check if a doc file exists
  function docExists(relPath: string): boolean {
    return fs.existsSync(path.join(docsRoot, relPath + ".md"));
  }

  // System overview
  sidebar.push({
    text: "System",
    items: [{ text: "Overview", link: "/" }],
  });

  if (!fs.existsSync(systemPath)) return sidebar;

  const system = parseUsmFile(systemPath) as SystemUsm;

  // Services — check if overview.md exists for each
  const serviceItems: SidebarItem[] = [];
  if (system.services) {
    for (const svc of system.services) {
      const slug = svc.id;
      const relPath = `shared-services/${slug}/overview`;
      if (docExists(relPath)) {
        serviceItems.push({ text: svc.name || svc.id, link: `/${relPath}` });
      }
    }
  }
  if (serviceItems.length > 0) {
    sidebar.push({ text: "Services", items: serviceItems });
  }

  // Features grouped by area — derive slug from ref path to preserve case
  const featuresByArea = new Map<string, SidebarItem[]>();
  if (system.index) {
    for (const feat of system.index) {
      // Determine area and slug from the ref path
      // e.g., .usm/features/generators/agentsMd.usm → area="generators", slug="agentsMd"
      const refMatch = feat.ref.match(/\.usm\/features\/([^/]+)\/(.+?)\.usm$/);
      if (!refMatch) continue; // Skip entries that don't match feature ref pattern (e.g., data files)

      const area = refMatch[1];
      const slug = refMatch[2];
      const areaDisplay = area.charAt(0).toUpperCase() + area.slice(1);

      // Check if the feature doc exists
      const relPath = `features/${area}/${slug}`;
      if (!docExists(relPath)) continue;

      if (!featuresByArea.has(areaDisplay)) {
        featuresByArea.set(areaDisplay, []);
      }

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

  // Add feature groups to sidebar (sorted)
  for (const [area, items] of [...featuresByArea.entries()].sort()) {
    sidebar.push({
      text: area,
      collapsed: true,
      items,
    });
  }

  // Cross-cutting — only include links to files that exist
  const crossCutting: SidebarItem[] = [];
  if (docExists("architecture/architecture")) {
    crossCutting.push({ text: "Architecture", link: "/architecture/architecture" });
  }
  if (docExists("data/models")) {
    crossCutting.push({ text: "Data Models", link: "/data/models" });
  }
  if (docExists("risks")) {
    crossCutting.push({ text: "Risks", link: "/risks" });
  }
  if (docExists("roadmap")) {
    crossCutting.push({ text: "Roadmap", link: "/roadmap" });
  }
  if (crossCutting.length > 0) {
    sidebar.push({
      text: "Platform",
      collapsed: true,
      items: crossCutting,
    });
  }

  return sidebar;
}

/**
 * Generate the VitePress config file.
 */
function generateVitePressConfig(root: string, docsRoot: string): string {
  const systemPath = path.join(root, ".usm", "system.usm");
  let title = "USM";
  let description = "Universal System Map";

  if (fs.existsSync(systemPath)) {
    const system = parseUsmFile(systemPath) as SystemUsm;
    title = system.identity?.name || title;
    description = system.summary?.split("\n")[0]?.slice(0, 120) || description;
  }

  const sidebar = generateSidebar(root, docsRoot);

  // Generate the config as a string
  const sidebarJson = JSON.stringify(sidebar, null, 2);

  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
  cleanUrls: true,
  ignoreDeadLinks: true,
  outDir: '.vitepress/dist',
  head: [
    ['script', { src: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' }],
    ['script', {}, 'if (typeof mermaid !== "undefined") { mermaid.initialize({ startOnLoad: true, theme: "default" }); }']
  ],
  themeConfig: {
    sidebar: ${sidebarJson},
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Smith-Gray-Pty-Ltd/usm' }
    ],
    footer: {
      message: 'Generated by <a href="https://github.com/Smith-Gray-Pty-Ltd/usm">@~usm/core</a>'
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
export async function docsBuild(root: string): Promise<void> {
  requireVitePress();

  const docsRoot = path.join(root, ".usm-workspace", "docs");
  if (!fs.existsSync(docsRoot)) {
    console.error("No docs found. Run 'usm generate' first.");
    process.exit(1);
  }

  // Consolidate feature docs into a single directory
  const copied = consolidateFeatureDocs(root);
  if (copied > 0) {
    console.log(`Consolidated ${copied} feature doc(s) into .usm-workspace/docs/features/`);
  }

  // Escape angle brackets for VitePress/Vue compatibility
  const escaped = escapeAllMarkdown(docsRoot);
  if (escaped > 0) {
    console.log(`Escaped angle brackets in ${escaped} file(s) for VitePress`);
  }

  // VitePress needs index.md, not README.md
  ensureIndexPage(docsRoot);

  // Generate VitePress config
  const configDir = path.join(docsRoot, ".vitepress");
  fs.mkdirSync(configDir, { recursive: true });
  const configContent = generateVitePressConfig(root, docsRoot);
  fs.writeFileSync(path.join(configDir, "config.mts"), configContent, "utf-8");
  console.log("Generated .vitepress/config.mts");

  // Run vitepress build
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
export async function docsServe(root: string, port: number): Promise<void> {
  requireVitePress();

  const docsRoot = path.join(root, ".usm-workspace", "docs");
  if (!fs.existsSync(docsRoot)) {
    console.error("No docs found. Run 'usm generate' first.");
    process.exit(1);
  }

  // Consolidate feature docs into a single directory
  const copied = consolidateFeatureDocs(root);
  if (copied > 0) {
    console.log(`Consolidated ${copied} feature doc(s) into .usm-workspace/docs/features/`);
  }

  // Escape angle brackets for VitePress/Vue compatibility
  const escaped = escapeAllMarkdown(docsRoot);
  if (escaped > 0) {
    console.log(`Escaped angle brackets in ${escaped} file(s) for VitePress`);
  }

  // VitePress needs index.md, not README.md
  ensureIndexPage(docsRoot);

  // Generate VitePress config
  const configDir = path.join(docsRoot, ".vitepress");
  fs.mkdirSync(configDir, { recursive: true });
  const configContent = generateVitePressConfig(root, docsRoot);
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
