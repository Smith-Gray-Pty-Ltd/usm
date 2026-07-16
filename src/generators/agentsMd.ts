import type { ServiceUsm, SystemUsm, GenerationResult } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import { generateFeedbackProtocol } from "./rulesFiles.js";

// ─── Smart Merge ────────────────────────────────────────────────────────────

/**
 * Smart-merge a generated AGENTS.md with an existing one.
 *
 * Strategies (in order):
 * 1. **Has USM markers** — Replace content between `<!-- USM:START -->` and
 *    `<!-- USM:END -->`, keep everything else (before + after).
 * 2. **No markers** — INSERT the generated USM section right after the first
 *    H1 heading, preserving **all** existing hand-written content below it.
 *    This ensures the first run on a hand-written AGENTS.md augments rather
 *    than replaces. Subsequent runs find the markers and use strategy 1.
 */
export function smartMerge(existing: string, generated: string): string {
  const startMarker = "<!-- USM:START -->";
  const endMarker = "<!-- USM:END -->";

  const startIdx = existing.indexOf(startMarker);
  const endIdx = existing.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    // Strategy 1: Merge mode — replace generated section, keep hand-written before + after
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + endMarker.length);
    return before + generated + after;
  }

  // Strategy 2: No markers — insert the USM section after the first H1,
  // preserving ALL existing hand-written content.
  const firstH1Match = existing.match(/^# .+$/m);
  if (firstH1Match && firstH1Match.index !== undefined) {
    const insertAt = firstH1Match.index + firstH1Match[0].length;
    const before = existing.slice(0, insertAt);
    const after = existing.slice(insertAt);
    return before + "\n\n" + generated + "\n" + after;
  }

  // No H1 at all — prepend USM section, then a separator, then existing content
  return generated + "\n\n---\n\n" + existing;
}

// ─── App AGENTS.md ──────────────────────────────────────────────────────────

/**
 * Generate AGENTS.md for an app service.
 *
 * @param service — the parsed ServiceUsm for the app
 * @param root — monorepo root
 * @param appName — app directory name (e.g., "the-architect")
 */
export function generateAppAgentsMd(
  service: ServiceUsm,
  root: string,
  appName: string
): GenerationResult {
  const outputPath = `${root}/apps/${appName}/AGENTS.md`;

  // Build generated content between markers
  const lines: string[] = [];
  const title = service.name || appName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  lines.push(`<!-- USM:START -->`);
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> Auto-generated from \`.usm/services/${appName}.usm\`. Hand-edit sections below; they'll be preserved on regeneration.`);
  lines.push("");

  // Project Overview
  lines.push("## Project Overview");
  lines.push("");
  lines.push(service.summary || "TODO: describe");
  lines.push("");

  // Tech Stack
  lines.push("## Tech Stack");
  lines.push("");
  lines.push("| Layer | Technology |");
  lines.push("|-------|-----------|");
  if (service.type) lines.push(`| Type | ${service.type} |`);
  if (service.runtime) lines.push(`| Framework | ${service.runtime} |`);
  if (service.port) lines.push(`| Port | ${service.port} |`);
  lines.push("");

  // Commands
  lines.push("## Commands");
  lines.push("");
  lines.push("```bash");
  if (service.dev?.command) lines.push(`# Development`);
  lines.push(`cd apps/${appName} && npm run dev`);
  lines.push(`cd apps/${appName} && npm run build`);
  lines.push(`cd apps/${appName} && npm start`);
  lines.push("# Validation");
  lines.push(`cd apps/${appName} && npm run lint`);
  lines.push(`cd apps/${appName} && npm run typecheck`);
  lines.push("```");
  lines.push("");

  // Directory Structure
  lines.push("## Directory Structure");
  lines.push("");
  if (service.paths && service.paths.length > 0) {
    for (const p of service.paths) {
      lines.push(`- \`${p}\` — source code`);
    }
  }
  lines.push(`- \`apps/${appName}/.usm/\` — USM source files`);
  lines.push("");

  // Key Rules
  lines.push("## Key Rules");
  lines.push("");
  if (service.decisions && service.decisions.length > 0) {
    for (const d of service.decisions) {
      lines.push(`- **${d.id}**: ${d.decision} (${d.status || "accepted"})`);
    }
  }
  if (service.security) {
    if (service.security.auth_method) {
      lines.push(`- **Auth**: ${service.security.auth_method}`);
    }
    if (service.security.secrets_ref) {
      lines.push(`- **Secrets**: ${service.security.secrets_ref}`);
    }
  }
  lines.push("- **Never commit without passing lint AND typecheck**");
  lines.push("- **Read this file and project docs before writing any code**");
  lines.push("");

  // Environment Variables
  if (service.dev?.env && Object.keys(service.dev.env).length > 0) {
    lines.push("## Environment Variables");
    lines.push("");
    lines.push("| Variable | Description | Required |");
    lines.push("|----------|-------------|----------|");
    for (const [key, val] of Object.entries(service.dev.env)) {
      lines.push(`| \`${key}\` | ${val} | Yes |`);
    }
    lines.push("");
  }

  // Architecture
  lines.push("## Architecture");
  lines.push("");
  lines.push("See [Architecture Overview](docs/architecture/overview.md) for system context.");
  lines.push("");

  // Conventions
  lines.push("## Conventions");
  lines.push("");
  lines.push("- Read this file and project docs before writing any code");
  lines.push("- Follow patterns in shared packages (`packages/`)");
  lines.push("- Use lint and typecheck commands before committing");
  lines.push("");
  lines.push(`<!-- USM:END -->`);
  lines.push("");

  const generatedContent = lines.join("\n");

  // Smart merge with existing
  let finalContent = generatedContent;
  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(outputPath, "utf-8");
    finalContent = smartMerge(existing, generatedContent);
  }

  return {
    outputs: [{ path: outputPath, content: finalContent }],
  };
}

// ─── Root AGENTS.md ──────────────────────────────────────────────────────────

/**
 * Generate root AGENTS.md from the system.usm and all services.
 *
 * @param system — the parsed SystemUsm
 * @param services — all parsed ServiceUsm files
 * @param root — monorepo root
 */
export function generateRootAgentsMd(
  system: SystemUsm,
  services: ServiceUsm[],
  root: string
): GenerationResult {
  const outputPath = `${root}/AGENTS.md`;

  const lines: string[] = [];

  lines.push(`<!-- USM:START -->`);
  lines.push(`# ${system.identity.name} — Agent Context`);
  lines.push("");
  lines.push(`> Auto-generated from \`.usm/system.usm\`. Hand-edit sections below; they'll be preserved on regeneration.`);
  lines.push("");
  lines.push(system.summary || "");
  lines.push("");

  // App Services — dynamically from parsed services
  const appServices = services.filter(s =>
    s.paths?.some(p => p.startsWith("apps/"))
  );

  if (appServices.length > 0) {
    const heading = appServices.length === 1 ? "App" : `The ${appServices.length} Apps`;
    lines.push(`## ${heading}`);
    lines.push("");
    lines.push("| App | Directory | Port | Role |");
    lines.push("|-----|-----------|------|------|");
    for (const svc of appServices) {
      const slug = svc.$id.split("/").pop() || "";
      const port = svc.port ? String(svc.port) : "—";
      const name = svc.name || slug;
      lines.push(`| ${name} | \`apps/${slug}\` | ${port} | ${svc.summary?.split(".")[0] || ""} |`);
    }
    lines.push("");
  }

  // Shared Packages — dynamically from parsed services
  const pkgServices = services.filter(s =>
    s.paths?.some(p => p.startsWith("packages/"))
  );

  if (pkgServices.length > 0) {
    lines.push("## Shared Packages");
    lines.push("");
    lines.push("| Package | Purpose |");
    lines.push("|---------|---------|");
    for (const pkg of pkgServices) {
      const slug = pkg.$id.split("/").pop() || "";
      const purpose = pkg.summary?.split("—")[1]?.trim() || pkg.summary || "";
      lines.push(`| \`${slug}\` | ${purpose} |`);
    }
    lines.push("");
  }

  // Key Cross-App Patterns — dynamically from system.usm
  if (system.principles && system.principles.length > 0) {
    lines.push("## Key Principles");
    lines.push("");
    for (const p of system.principles) {
      lines.push(`- **${p.name}**: ${p.statement}`);
    }
    lines.push("");
  }

  // Rules for Agents
  lines.push("## Rules for Agents");
  lines.push("");
  lines.push("1. **Read the relevant .usm files before modifying any code.** Use MCP tools (`usm_list`, `usm_read`, `usm_search`) to understand the system map.");
  lines.push("2. **Follow patterns established in shared packages.** Do not invent new auth patterns.");
  lines.push("3. **Conventional commits**: `feat(scope): description`, `fix(scope): description`.");
  lines.push("4. **Never stop a running dev server.**");
  lines.push("5. **Never commit without passing lint AND typecheck.**");
  lines.push("");

  // USM Spec-First Workflow — teaches agents how to use USM in this project
  lines.push("## USM Spec-First Workflow");
  lines.push("");
  lines.push("This project uses USM for structured system documentation. Follow this workflow:");
  lines.push("");
  lines.push("### Before Starting Work");
  lines.push("1. Use MCP tools to read the system map:");
  lines.push("   - `usm_list` — list all .usm files");
  lines.push("   - `usm_read` — read a specific feature or service");
  lines.push("   - `usm_search` — find features by keyword");
  lines.push("   - `usm_summary` — quick overview of a file");
  lines.push("");
  lines.push("### When Implementing a New Feature");
  lines.push("1. Discuss the feature with the human");
  lines.push("2. Call `usm_draft_feature` with structured fields (summary, intent, flows, contracts, tests)");
  lines.push("3. Show the human the generated markdown preview for review");
  lines.push("4. If approved, call `usm_write_feature` to persist the .usm file");
  lines.push("5. Implement the feature in code");
  lines.push("6. Call `usm_update_feature_status` to mark as built (with implementation path)");
  lines.push("");
  lines.push("### When Updating an Existing Feature");
  lines.push("1. Read the existing .usm spec first (`usm_read`)");
  lines.push("2. Make code changes");
  lines.push("3. Call `usm_update_feature` if the spec needs updating");
  lines.push("4. Call `usm_update_feature_status` if status changed");
  lines.push("");
  lines.push("### Generating and Reviewing Docs");
  lines.push("- `usm generate` — produce markdown, OpenAPI, Mermaid, test specs from .usm files");
  lines.push("- `usm docs serve` — serve docs locally with VitePress for review");
  lines.push("- `usm docs serve --audience help` — serve filtered public docs");
  lines.push("");
  lines.push("### Key Rules");
  lines.push("- **NEVER** create .usm files by hand — use the MCP write tools (they validate)");
  lines.push("- **ALWAYS** show the human the markdown before writing to disk");
  lines.push("- **ALWAYS** update feature status after implementation");
  lines.push("- The .usm file IS the documentation — if it's wrong, the docs are wrong");
  lines.push("");

  // Agent feedback protocol (policy-dynamic, sourced from system.feedback)
  lines.push(generateFeedbackProtocol(system));

  lines.push(`<!-- USM:END -->`);
  lines.push("");

  const generatedContent = lines.join("\n");

  // Smart merge with existing
  let finalContent = generatedContent;
  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(outputPath, "utf-8");
    finalContent = smartMerge(existing, generatedContent);
  }

  return {
    outputs: [{ path: outputPath, content: finalContent }],
  };
}

/**
 * Generate AGENTS.md for all app services and the root.
 */
export function generateAllAppAgentsMd(
  serviceFiles: ServiceUsm[],
  root: string
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  // Dynamically discover app services from paths (apps/* directories)
  const appServiceSlugs = new Set<string>();
  for (const svc of serviceFiles) {
    for (const p of svc.paths || []) {
      const match = p.match(/^apps\/([^/]+)/);
      if (match) appServiceSlugs.add(match[1]);
    }
  }

  for (const app of appServiceSlugs) {
    const svc = serviceFiles.find(s =>
      s.paths?.some(p => p.startsWith(`apps/${app}`))
    );
    if (svc) {
      const result = generateAppAgentsMd(svc, root, app);
      outputs.push(...result.outputs);
    }
  }

  // Also for shared services (packages)
  const pkgServices = serviceFiles.filter(s =>
    s.paths?.some(p => p.startsWith("packages/"))
  );
  for (const pkg of pkgServices) {
    const slug = pkg.$id.split("/").pop() || "";
    // Skip packages that don't have .usm-workspace directories
    // (they get a lighter docs shape)
    void slug; // no-op for now
  }

  return { outputs };
}
