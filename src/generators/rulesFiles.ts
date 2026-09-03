import fs from "node:fs";
import path from "node:path";
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
   - \`usm_query\` to run predicate queries ("features where status = planned and contracts = 0")
   - \`usm_summary\` for a quick overview

### When Implementing a New Feature
1. Discuss the feature with the human
2. Call \`usm_draft_feature\` with structured fields (summary, intent, flows, contracts, tests)
3. Show the human the generated markdown preview for review
4. If approved, call \`usm_write_feature\` to persist the .usm file
5. Implement the feature in code
6. Call \`usm_update_feature_status\` to mark as built (with implementation path)

### When Updating an Existing Feature
1. Read the existing .usm spec first (\`usm_read\`)
2. Make code changes
3. Call \`usm_update_feature\` if the spec needs updating (id-bearing arrays merge by id)
4. Call \`usm_update_feature_status\` if status changed

### When Bootstrapping or Updating System/Service Specs
1. Use \`usm_write_system\` to create or replace system.usm
2. Use \`usm_update_system\` to add services, roles, or auth_schemes (merges by id)
3. Use \`usm_write_service\` to create a service file (e.g. .usm/apps/my-app/service.usm)
4. Use \`usm_update_service\` to update service fields (data_models, routes merge by id)

### Key Rules
- NEVER create .usm files by hand — use the MCP write tools (they validate)
- ALWAYS show the human the markdown before writing to disk
- ALWAYS update feature status after implementation
- The .usm file IS the documentation — if it's wrong, the docs are wrong
- Use \`usm_query\` for impact analysis ("what depends on this service?")
`;

/**
 * Canonical upstream tracker for bugs in the USM tool itself. Shared by the
 * rules-file protocol, the docs feedback page, and the MCP tool text so all
 * surfaces stay consistent (one-source contract).
 */
export const USM_UPSTREAM_TRACKER = "https://github.com/Smith-Gray-Pty-Ltd/usm/issues";

/**
 * Generate the Agent Feedback Protocol block.
 *
 * Renders policy-specific instructions driven by `system.feedback`, plus a hard
 * rule against ad-hoc tracking files. Emitted into every rules file so all
 * agents (Cursor, Claude, Codex, Copilot, opencode) behave consistently instead of
 * improvising (e.g. creating their own bugs.md).
 *
 * Scope-aware: agents must first classify WHERE the bug lives — in this project,
 * or in the USM tool itself. Tool bugs route upstream to the USM repo, never to
 * the consuming project's tracker.
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
  const upstream = fb?.upstream_tracker ?? USM_UPSTREAM_TRACKER;
  const upstreamRepo = upstream.replace(/\/issues\/?$/, "");
  // Self-referential case: this project's tracker IS the USM upstream tracker
  // (i.e. we're generating inside the USM repo itself). The two-scope table
  // would name the same URL twice with contradictory "file here"/"never file
  // here" instructions — collapse to coherent single-tracker text instead.
  const normUrl = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const selfReferential = tracker !== undefined && normUrl(tracker) === normUrl(upstream);

  const lines: string[] = [];
  lines.push("## Agent Feedback Protocol");
  lines.push("");
  lines.push("> **If you are an AI agent, read this.** When you discover a bug, inconsistency, or improvement, first classify WHERE it lives (below), then follow this project's configured policy — do NOT improvise or invent your own tracking files.");
  lines.push("");

  // ── Scope classification: project vs USM tool itself ──────────────────────
  lines.push("### Step 1 — Where does the bug live?");
  lines.push("");

  if (selfReferential) {
    // This repo IS the USM project — one tracker serves both scopes.
    lines.push(`This project **is** the USM project: its tracker and the USM upstream tracker are the same place (<${tracker}>). File bugs in this codebase **and** bugs in the USM tool itself (CLI, MCP tools, generators, schema) there.`);
    lines.push("");
    lines.push(`For bugs in the tool itself, include the \`@smithgray/usm\` version (\`npm ls @smithgray/usm\`), the command or MCP tool invoked, reproduction steps, and expected vs actual. Structured non-bug feedback still goes in \`${feedbackDir}/\` per the policy below.`);
  } else {
    lines.push("| Scope | Covers | Where it goes |");
    lines.push("|-------|--------|---------------|");
    lines.push(`| **This project** | App code, infra, this repo's own \`.usm\` specs | Step 2 below — this project's policy |`);
    lines.push(`| **The USM tool itself** | \`@smithgray/usm\` CLI commands, MCP tool behaviour, generator output, schema validation | Upstream: <${upstream}> |`);
    lines.push("");
    lines.push(`USM tool bugs are NOT this project's bugs. Include the \`@smithgray/usm\` version (\`npm ls @smithgray/usm\`), the command or MCP tool invoked, reproduction steps, and expected vs actual.`);
    if (policy === "human-gate") {
      lines.push(`For a USM tool bug: describe it to the human and **ask** whether to file it upstream (they may prefer to file it themselves).`);
    } else if (policy === "direct-to-github") {
      lines.push(`For a USM tool bug: file it with \`gh issue create -R ${upstreamRepo} --title "bug: ..." --body "<repro + version>"\`.`);
    } else {
      lines.push(`For a USM tool bug: surface it to the human with the upstream URL (<${upstream}>) — do not bury it in this project's feedback entries.`);
    }
    lines.push(`**Never** file USM tool bugs in this project's tracker${tracker ? ` (<${tracker}>)` : ""} or in \`${feedbackDir}/\` — they will not be seen by anyone who can fix them.`);
  }
  lines.push("");

  // ── Step 2: project-scope policy (unchanged behaviour) ─────────────────────
  lines.push("### Step 2 — This project's policy (for project-scope issues)");
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
  lines.push(`- The **only** canonical location for structured project feedback is \`${feedbackDir}/\`.`);
  if (selfReferential) {
    lines.push(`- Real bugs — in this codebase or in the USM tool itself — live in the issue tracker: <${tracker}>.`);
  } else {
    if (tracker) {
      lines.push(`- Real bugs in this project live in the issue tracker: <${tracker}>.`);
    }
    lines.push(`- Real bugs in the **USM tool itself** live upstream: <${upstream}> — never in this repo.`);
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
  lines.push("- `usm_query` — predicate query over all .usm files (e.g. \"features where status = planned and contracts = 0\")");
  lines.push("- `usm_validate` — validate a .usm file against schema");
  lines.push("- `usm_summary` — quick summary of a .usm file");
  lines.push("- `usm_references` — find references to a feature $id");
  lines.push("- `usm_get_contracts` — get contracts from a feature");
  lines.push("- `usm_get_flows` — get flows from a feature");
  lines.push("");
  lines.push("**Write tools** (author and update .usm files):");
  lines.push("- `usm_draft_feature` — draft a feature spec (returns YAML + markdown preview)");
  lines.push("- `usm_write_feature` — write a feature .usm file to disk (validates first)");
  lines.push("- `usm_update_feature` — update fields on an existing feature (id-bearing arrays merge by id)");
  lines.push("- `usm_update_feature_status` — update feature status (planned→built)");
  lines.push("- `usm_write_system` — create or replace system.usm (validates $type: system)");
  lines.push("- `usm_write_service` — create or replace a service .usm file");
  lines.push("- `usm_update_system` — update fields on system.usm (services/index/roles merge by id)");
  lines.push("- `usm_update_service` — update fields on a service file (data_models/routes merge by id)");
  lines.push("- `usm_report_feedback` — report a bug/improvement (scope-aware: project vs USM tool upstream)");
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
 * Generate .opencode/skills/usm-workflow/SKILL.md — the drift countermeasure.
 *
 * opencode lists every skill's frontmatter description in the system prompt on
 * EVERY message. The description therefore IS the nudge — it must carry the
 * workflow trigger by itself. The body (full checklist) loads on invoke.
 *
 * USM-owned file: fully regenerated on each `usm generate`.
 */
function generateOpencodeSkill(): string {
  return `---
name: usm-workflow
description: Enforces the USM spec-first workflow — read .usm specs before code changes, draft a spec before building any new feature, update feature status after implementation, and route feedback by scope (this project vs the USM tool itself). Invoke before starting any feature, refactor, or bug fix; when unsure whether a change needs a .usm spec; when touching files listed in a feature's implementation paths; and to re-anchor a long session that has drifted off the workflow.
---

# USM Workflow Enforcement

You are working in a USM-managed project. The .usm/ directory is the source of
truth — code and specs must not drift. Work through this checklist.

## Pre-flight (before ANY code change)

1. Identify the feature/module the change belongs to.
2. Find its spec:
   - \`usm_search "<feature keywords>"\` or \`usm_list\` to locate the .usm file
   - \`usm_read\` the spec — read its contracts and flows before editing
3. If touching a file listed in a spec's \`implementation:\` paths, the spec
   governs the behaviour you are about to change. Check its contracts first.

## New feature work — draft BEFORE building

1. Discuss the feature with the human.
2. \`usm_draft_feature\` with structured fields (summary, intent, flows,
   contracts, tests).
3. Show the human the generated markdown preview — ALWAYS the markdown, not
   the YAML. Do not write to disk without approval.
4. On approval: \`usm_write_feature\`, then implement.
5. After implementing: \`usm_update_feature_status\` → built, with the
   implementation paths.

## Updating existing behaviour

1. Read the spec first (\`usm_read\`) — its contracts are acceptance criteria.
2. Make the code change.
3. \`usm_update_feature\` if behaviour changed (id-bearing arrays merge by id —
   pass only new/changed items).
4. \`usm_update_feature_status\` if the status changed.

## Hard rules

- NEVER hand-write .usm files — use the MCP write tools (they validate).
- NEVER write a spec to disk without showing the human the markdown preview.
- NEVER let code and spec drift — if you changed behaviour, update the spec in
  the same session.
- The .usm file IS the documentation — if it's wrong, the docs are wrong.

## Feedback — classify scope FIRST

- Bug in THIS project (app code, infra, this repo's .usm specs) → follow the
  Agent Feedback Protocol in AGENTS.md.
- Bug in the USM tool itself (CLI, MCP tools, generators, schema) → upstream:
  ${USM_UPSTREAM_TRACKER} — never this repo's tracker.
- NEVER create ad-hoc tracking files (bugs.md, ISSUES.md, TODO-agent.md).

## Re-anchoring a drifted session

If you notice you have been editing code without consulting specs, or the
conversation has wandered from the agreed feature: STOP. List what has changed
so far, \`usm_read\` the governing spec(s), reconcile any drift (code or spec),
then continue. Drift compounds — correcting early is cheap.
`;
}

/**
 * The iron rules body — tool-agnostic, shared by every always-on tier:
 * opencode instructions file, Cursor alwaysApply rule, Copilot instructions.
 *
 * Deliberately short: each tool already injects its main rules file every
 * message — the drift problem is dilution by length. These per-message
 * self-checks stay salient where the full file does not.
 */
function ironRulesBody(): string {
  return `1. Before ANY code change: does a .usm spec govern this? Find it (\`usm_search\`/\`usm_read\`/\`usm_query\`) and read its contracts BEFORE editing. No spec for new work → draft one (\`usm_draft_feature\`), show the human the markdown, get approval (\`usm_write_feature\`) — BEFORE writing code.
2. NEVER hand-write .usm files — use the MCP write tools (they validate). Use \`usm_write_system\`/\`usm_write_service\` for system and service files, not just feature tools. NEVER write a spec without showing the human the markdown preview first.
3. After implementing: update the spec (\`usm_update_feature\` / \`usm_update_feature_status\`) in the same session. Code and spec must not drift.
4. Found a bug? Classify scope first: this project → feedback policy in AGENTS.md; the USM tool itself (CLI/MCP/generators/schema) → ${USM_UPSTREAM_TRACKER} — never this repo's tracker. NEVER create ad-hoc tracking files (bugs.md, ISSUES.md).
5. Drifted? If you've been editing code without consulting specs: STOP, read the governing spec, reconcile, continue.`;
}

/**
 * Generate .opencode/usm-instructions.md — the iron rules injected into every
 * request's system prompt via opencode.json `instructions`.
 *
 * USM-owned file, fully regenerated.
 */
function generateIronRules(): string {
  return `<!-- Generated by \`usm generate\` — injected into every opencode request via opencode.json "instructions". Edits will be overwritten. -->

# USM Iron Rules (self-check every message)

${ironRulesBody()}

Full checklist: invoke the \`usm-workflow\` skill.
`;
}

/**
 * Generate .cursor/rules/usm-always.mdc — the iron rules as an ALWAYS-APPLIED
 * Cursor rule (injected into every request). Complements the detailed
 * glob-scoped usm.mdc which activates on .usm/ paths.
 */
function generateCursorAlwaysRule(): string {
  return `---
description: USM iron rules — spec-first workflow self-checks applied to every request
alwaysApply: true
---

# USM Iron Rules (self-check every message)

${ironRulesBody()}
`;
}

/**
 * Generate .github/instructions/usm-iron-rules.md — the iron rules as a
 * GitHub Copilot instructions file with a broad applyTo glob (injected into
 * every applicable request). Complements .github/copilot-instructions.md.
 */
function generateCopilotIronRules(): string {
  return `---
applyTo: "**"
---

# USM Iron Rules (self-check every message)

${ironRulesBody()}
`;
}

/**
 * The instructions entry USM owns inside opencode.json.
 */
const USM_INSTRUCTIONS_PATH = ".opencode/usm-instructions.md";

/**
 * Merge the USM instructions entry into the project's opencode.json.
 *
 * opencode.json is user-authored config: the ONLY field we touch is the
 * \`instructions\` array (append our entry if absent). Everything else is
 * preserved byte-for-byte in intent — we re-serialize the parsed JSON, which
 * keeps existing key order (JSON.stringify preserves insertion order).
 *
 * Resolution order (matching opencode's own config discovery):
 *   1. <root>/opencode.json          — read, merge, return
 *   2. <root>/.opencode/opencode.json — read, merge, return
 *   3. <root>/opencode.jsonc exists   — JSONC cannot be safely re-serialized;
 *                                       return null (skill + instructions
 *                                       files still generated; the human adds
 *                                       the instructions entry manually)
 *   4. nothing exists                 — create minimal <root>/opencode.json
 */
function mergeOpencodeConfig(root: string): { path: string; content: string } | null {
  const rootConfig = path.join(root, "opencode.json");
  const dirConfig = path.join(root, ".opencode", "opencode.json");
  const jsoncConfig = path.join(root, "opencode.jsonc");

  let configPath: string;
  let config: Record<string, unknown>;

  if (fs.existsSync(rootConfig)) {
    configPath = rootConfig;
  } else if (fs.existsSync(dirConfig)) {
    configPath = dirConfig;
  } else if (fs.existsSync(jsoncConfig)) {
    // JSONC may contain comments — merging programmatically is unsafe.
    return null;
  } else {
    configPath = rootConfig;
    config = {
      $schema: "https://opencode.ai/config.json",
    };
    config.instructions = [USM_INSTRUCTIONS_PATH];
    return { path: configPath, content: JSON.stringify(config, null, 2) + "\n" };
  }

  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    // Unparseable config — never destroy it; leave wiring to the human.
    return null;
  }

  if (!Array.isArray(config.instructions)) {
    config.instructions = [USM_INSTRUCTIONS_PATH];
  } else if (!config.instructions.includes(USM_INSTRUCTIONS_PATH)) {
    // Append at the end — never remove or reorder existing entries.
    config.instructions = [...(config.instructions as unknown[]), USM_INSTRUCTIONS_PATH];
  }

  return { path: configPath, content: JSON.stringify(config, null, 2) + "\n" };
}

/**
 * Generate all rules files for supported AI coding tools.
 *
 * Two tiers per tool where the mechanism allows:
 *   - Detailed workflow (loaded on session start or path scope)
 *   - Always-on iron rules (injected into every request — the drift countermeasure)
 *
 * Produces:
 * - .cursor/rules/usm.mdc (Cursor, glob-scoped detail) + usm-always.mdc (alwaysApply iron rules)
 * - CLAUDE.md (Claude Code, smart-merged) + .claude/skills/usm-workflow/SKILL.md (description every message)
 * - AGENTS.md (enhanced with workflow, smart-merged — Codex has no per-message mechanism)
 * - .github/copilot-instructions.md + .github/instructions/usm-iron-rules.md (broad applyTo)
 * - .opencode/skills/usm-workflow/SKILL.md + .opencode/usm-instructions.md + opencode.json wiring
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

  // 4. .opencode/skills/usm-workflow/SKILL.md — description visible every message
  outputs.push({
    path: path.join(root, ".opencode", "skills", "usm-workflow", "SKILL.md"),
    content: generateOpencodeSkill(),
  });

  // 4b. .claude/skills/usm-workflow/SKILL.md — Claude Code uses the same
  // SKILL.md convention (description visible every message, body on invoke)
  outputs.push({
    path: path.join(root, ".claude", "skills", "usm-workflow", "SKILL.md"),
    content: generateOpencodeSkill(),
  });

  // 5. .opencode/usm-instructions.md — injected into every request via opencode.json
  outputs.push({
    path: path.join(root, USM_INSTRUCTIONS_PATH),
    content: generateIronRules(),
  });

  // 5b. .cursor/rules/usm-always.mdc — alwaysApply iron rules (every request);
  //     complements the glob-scoped usm.mdc
  outputs.push({
    path: path.join(root, ".cursor", "rules", "usm-always.mdc"),
    content: generateCursorAlwaysRule(),
  });

  // 5c. .github/instructions/usm-iron-rules.md — broad applyTo iron rules;
  //     complements .github/copilot-instructions.md
  outputs.push({
    path: path.join(root, ".github", "instructions", "usm-iron-rules.md"),
    content: generateCopilotIronRules(),
  });

  // 6. opencode.json — append our instructions entry (only field we own)
  const opencodeConfig = mergeOpencodeConfig(root);
  if (opencodeConfig) {
    outputs.push(opencodeConfig);
  }

  return { outputs };
}
