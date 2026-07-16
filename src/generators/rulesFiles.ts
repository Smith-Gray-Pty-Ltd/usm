import fs from "node:fs";
import path from "node:path";
import { parseUsmFile } from "../parse.js";
import { findAllUsmFiles } from "../parse.js";
import type { SystemUsm, ServiceUsm } from "../types.js";
import type { GenerationResult } from "../types.js";

/**
 * The spec-first workflow instructions shared across all rules files.
 * This is the behavioural core — tells agents WHEN and HOW to use USM.
 */
const WORKFLOW_INSTRUCTIONS = `## USM Spec-First Workflow

This project uses USM (Universal System Map) for structured system documentation.
Follow this workflow when implementing features:

### Before Starting Work
1. Use MCP tools to read the system map:
   - \`usm_list\` to see all .usm files
   - \`usm_read\` to read a specific feature or service
   - \`usm_search\` to find features by keyword
   - \`usm_summary\` for a quick overview

### When Implementing a New Feature
1. Discuss the feature with the human
2. Call \`usm_draft_feature\` with structured fields (summary, intent, flows, contracts, tests)
3. Show the human the generated markdown preview for review
4. If approved, call \`usm_write_feature\` to persist the .usm file
5. Implement the feature in code
6. Call \`usm_update_feature_status\` to mark as built (with implementation path)

### When Updating an Existing Feature
1. Read the existing .usm spec first
2. Make code changes
3. Call \`usm_update_feature\` if the spec needs updating
4. Call \`usm_update_feature_status\` if status changed

### Key Rules
- NEVER create .usm files by hand — use the MCP write tools (they validate)
- ALWAYS show the human the markdown before writing to disk
- ALWAYS update feature status after implementation
- The .usm file IS the documentation — if it's wrong, the docs are wrong
`;

/**
 * Generate the Agent Feedback Protocol block.
 *
 * Renders policy-specific instructions driven by `system.feedback`, plus a hard
 * rule against ad-hoc tracking files. Emitted into every rules file so all
 * agents (Cursor, Claude, Codex, Copilot) behave consistently instead of
 * improvising (e.g. creating their own bugs.md).
 *
 * Always emitted — even with no `feedback` block the default policy is
 * `human-gate` and the no-ad-hoc-files rule is universally valuable.
 */
export function generateFeedbackProtocol(system: SystemUsm): string {
  const fb = system.feedback;
  const policy = fb?.policy ?? "human-gate";
  const feedbackDir = fb?.feedback_dir ?? ".usm/feedback";
  const repo = system.identity?.repository?.replace(/\/$/, "");
  const tracker = fb?.tracker ?? (repo ? `${repo}/issues` : undefined);

  const lines: string[] = [];
  lines.push("## Agent Feedback Protocol");
  lines.push("");
  lines.push("> **If you are an AI agent, read this.** When you discover a bug, inconsistency, or improvement, follow this project's configured policy — do NOT improvise or invent your own tracking files.");
  lines.push("");
  lines.push(`**Active policy:** \`${policy}\``);
  lines.push("");

  if (policy === "human-gate") {
    lines.push("- Surface the issue to the human in conversation. Describe what you found and **ask** whether to record or file it.");
    lines.push("- Do **NOT** write any feedback file, create an issue, or commit a fix without explicit human approval.");
  } else if (policy === "direct-to-feedback") {
    lines.push(`- Record the issue directly as a structured entry in \`${feedbackDir}/\` — call the \`usm_report_feedback\` MCP tool if available, otherwise hand-write a \`$type: feedback\` file.`);
    lines.push("- Required fields: `kind` (bug|improvement|question), `severity`, `summary`, `status`, `reported_by`.");
    lines.push("- Skip trivial/cosmetic items — only record things a human would act on.");
  } else if (policy === "direct-to-github") {
    if (tracker) {
      lines.push(`- File real bugs as GitHub issues at <${tracker}> using \`gh issue create\` (prefer the bug report template).`);
    } else {
      lines.push("- File real bugs via `gh issue create` (tracker URL not configured — set `identity.repository` or `feedback.tracker`).");
    }
    lines.push(`- Use \`${feedbackDir}/\` entries for ideas/improvements that aren't real bugs.`);
    lines.push("- Include reproduction steps, expected vs actual, and environment info.");
  }

  lines.push("");
  lines.push("**Hard rules (all policies):**");
  lines.push("- **NEVER** create ad-hoc tracking files at the repo root (`bugs.md`, `ISSUES.md`, `TODO-agent.md`, etc.).");
  lines.push(`- The **only** canonical location for structured feedback is \`${feedbackDir}/\`.`);
  if (tracker) {
    lines.push(`- Real bugs live in the issue tracker: <${tracker}>.`);
  }
  lines.push("- If ever unsure, default to asking the human.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate the USM section content that goes between markers in smart-merged files.
 */
function generateUsmSection(system: SystemUsm, services: ServiceUsm[]): string {
  const lines: string[] = [];

  // Project identity
  lines.push(`## Project: ${system.identity.name}`);
  lines.push("");
  lines.push(system.summary);
  lines.push("");

  // Services
  if (services.length > 0) {
    lines.push("## Services");
    lines.push("");
    for (const svc of services) {
      lines.push(`- **${svc.name || svc.$id}** (${svc.type}, ${svc.runtime})`);
      if (svc.summary) {
        lines.push(`  ${svc.summary.split("\n")[0]}`);
      }
    }
    lines.push("");
  }

  // MCP tools reference
  lines.push("## Available MCP Tools");
  lines.push("");
  lines.push("**Read tools** (query existing .usm data):");
  lines.push("- `usm_list` — list all .usm files");
  lines.push("- `usm_read` — read a specific .usm file");
  lines.push("- `usm_search` — search .usm files by keyword");
  lines.push("- `usm_validate` — validate a .usm file against schema");
  lines.push("- `usm_summary` — quick summary of a .usm file");
  lines.push("- `usm_references` — find references to a feature $id");
  lines.push("- `usm_get_contracts` — get contracts from a feature");
  lines.push("- `usm_get_flows` — get flows from a feature");
  lines.push("");
  lines.push("**Write tools** (author and update .usm files):");
  lines.push("- `usm_draft_feature` — draft a feature spec (returns YAML + markdown preview)");
  lines.push("- `usm_write_feature` — write a .usm file to disk (validates first)");
  lines.push("- `usm_update_feature` — update fields on an existing feature");
  lines.push("- `usm_update_feature_status` — update feature status (planned→built)");
  lines.push("- `usm_report_feedback` — report a bug/improvement as a structured $type: feedback entry (respects feedback policy)");
  lines.push("");

  // Workflow
  lines.push(WORKFLOW_INSTRUCTIONS);

  // Agent feedback protocol (policy-dynamic)
  lines.push(generateFeedbackProtocol(system));

  return lines.join("\n");
}

/**
 * Smart-merge: replace content between USM:START/USM:END markers.
 * If no markers exist, insert after the first H1 heading.
 * Preserves all content outside the markers.
 */
function smartMerge(existingContent: string, usmSection: string): string {
  const startMarker = "<!-- USM:START -->";
  const endMarker = "<!-- USM:END -->";

  const startIndex = existingContent.indexOf(startMarker);
  const endIndex = existingContent.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1) {
    // Replace between markers
    const before = existingContent.substring(0, startIndex + startMarker.length);
    const after = existingContent.substring(endIndex);
    return `${before}\n${usmSection}\n${after}`;
  }

  // No markers — insert after first H1
  const lines = existingContent.split("\n");
  const h1Index = lines.findIndex((l) => /^#\s+/.test(l));

  if (h1Index !== -1) {
    // Insert after the H1 and any blank line after it
    let insertAt = h1Index + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === "") {
      insertAt++;
    }
    lines.splice(
      insertAt,
      0,
      "",
      startMarker,
      usmSection,
      endMarker,
      "",
    );
    return lines.join("\n");
  }

  // No H1 — prepend
  return `${startMarker}\n${usmSection}\n${endMarker}\n\n${existingContent}`;
}

/**
 * Generate .cursor/rules/usm.mdc for Cursor.
 * Uses .mdc format with YAML frontmatter for auto-activation.
 */
function generateCursorRule(system: SystemUsm, services: ServiceUsm[]): string {
  const usmSection = generateUsmSection(system, services);

  return `---
description: USM spec-first workflow — read .usm files before work, draft specs before building, update status after implementation
globs:
  - ".usm/**"
  - "*.usm"
  - ".usm-workspace/**"
alwaysApply: false
---

# USM — Universal System Map

${usmSection}
`;
}

/**
 * Generate CLAUDE.md for Claude Code.
 * Uses smart-merge to preserve human-written content.
 */
function generateClaudeMd(system: SystemUsm, services: ServiceUsm[], existing: string | null): string {
  const usmSection = generateUsmSection(system, services);
  const base = existing || "# Claude Code Instructions\n";
  return smartMerge(base, usmSection);
}

/**
 * Generate .github/copilot-instructions.md for GitHub Copilot.
 */
function generateCopilotInstructions(system: SystemUsm, services: ServiceUsm[]): string {
  const usmSection = generateUsmSection(system, services);

  return `# Copilot Instructions

${usmSection}
`;
}

/**
 * Generate all rules files for supported AI coding tools.
 *
 * Produces:
 * - .cursor/rules/usm.mdc (Cursor)
 * - CLAUDE.md (Claude Code, smart-merged)
 * - AGENTS.md (enhanced with workflow, smart-merged)
 * - .github/copilot-instructions.md (GitHub Copilot)
 */
export function generateRulesFiles(
  system: SystemUsm,
  services: ServiceUsm[],
  root: string,
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  // 1. .cursor/rules/usm.mdc
  const cursorContent = generateCursorRule(system, services);
  outputs.push({
    path: path.join(root, ".cursor", "rules", "usm.mdc"),
    content: cursorContent,
  });

  // 2. CLAUDE.md (smart-merge with existing)
  const claudePath = path.join(root, "CLAUDE.md");
  const existingClaude = fs.existsSync(claudePath)
    ? fs.readFileSync(claudePath, "utf-8")
    : null;
  const claudeContent = generateClaudeMd(system, services, existingClaude);
  outputs.push({
    path: claudePath,
    content: claudeContent,
  });

  // 3. .github/copilot-instructions.md
  const copilotContent = generateCopilotInstructions(system, services);
  outputs.push({
    path: path.join(root, ".github", "copilot-instructions.md"),
    content: copilotContent,
  });

  return { outputs };
}
