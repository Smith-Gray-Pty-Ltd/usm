import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateRulesFiles,
  generateFeedbackProtocol,
  USM_UPSTREAM_TRACKER,
} from "../src/generators/rulesFiles.js";
import { generateFeedbackPage } from "../src/generators/markdown.js";
import { validateUsm } from "../src/validate.js";
import { parseUsm } from "../src/parse.js";
import type { SystemUsm } from "../src/types.js";

const SYSTEM: SystemUsm = {
  $schema: "https://usm.dev/schema/v1.json",
  $id: "test-org/system",
  $type: "system",
  $version: 1,
  summary: "Test system for opencode + feedback routing generators",
  identity: { name: "TestOrg", domain: "example.com", repository: "https://github.com/test-org/repo" },
  feedback: { policy: "human-gate" },
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-opencode-test-"));
});

function runGenerate() {
  const result = generateRulesFiles(SYSTEM, [], root);
  for (const output of result.outputs) {
    fs.mkdirSync(path.dirname(output.path), { recursive: true });
    fs.writeFileSync(output.path, output.content, "utf-8");
  }
  return result;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("usm/opencode-integration", () => {
  it("generates the usm-workflow skill with a trigger description and checklist body", () => {
    runGenerate();
    const skill = read(".opencode/skills/usm-workflow/SKILL.md");
    // Frontmatter
    expect(skill.startsWith("---\n")).toBe(true);
    expect(skill).toMatch(/^name:\s*usm-workflow$/m);
    expect(skill).toMatch(/^description:\s*Enforces the USM spec-first workflow/m);
    // Description (visible every message) carries the triggers
    const description = skill.match(/^description:\s*(.+)$/m)![1];
    expect(description).toMatch(/\.usm/);
    expect(description).toMatch(/draft/i);
    expect(description).toMatch(/drifted/i);
    // Body checklist
    expect(skill).toMatch(/usm_draft_feature/);
    expect(skill).toMatch(/usm_update_feature_status/);
    expect(skill).toMatch(/markdown preview/i);
    expect(skill).toMatch(/Re-anchoring a drifted session/);
  });

  it("generates short iron rules wired into opencode.json instructions", () => {
    runGenerate();
    const iron = read(".opencode/usm-instructions.md");
    expect(iron.split("\n").length).toBeLessThanOrEqual(40);
    expect(iron).toMatch(/Before ANY code change/);
    expect(iron).toMatch(/usm_draft_feature/);
    expect(iron).toMatch(USM_UPSTREAM_TRACKER);

    const config = JSON.parse(read("opencode.json")) as { instructions?: string[]; $schema?: string };
    expect(config.$schema).toBe("https://opencode.ai/config.json");
    expect(config.instructions).toContain(".opencode/usm-instructions.md");
  });

  it("preserves existing opencode.json config and instruction order", () => {
    const existing = {
      $schema: "https://opencode.ai/config.json",
      model: "anthropic/claude-sonnet-4-6",
      instructions: ["AGENTS.md", "docs/style.md"],
      mcp: { playwright: { type: "local" as const, command: ["npx", "-y", "@playwright/mcp"] } },
      permission: { edit: "ask" },
    };
    fs.writeFileSync(path.join(root, "opencode.json"), JSON.stringify(existing, null, 2));

    runGenerate();

    const config = JSON.parse(read("opencode.json")) as typeof existing & { instructions: string[] };
    expect(config.instructions).toEqual(["AGENTS.md", "docs/style.md", ".opencode/usm-instructions.md"]);
    expect(config.model).toBe("anthropic/claude-sonnet-4-6");
    expect(config.mcp).toEqual(existing.mcp);
    expect(config.permission).toEqual(existing.permission);
  });

  it("does not touch opencode.json when only a .jsonc config exists", () => {
    fs.writeFileSync(path.join(root, "opencode.jsonc"), '{ "$schema": "https://opencode.ai/config.json" }');

    const result = runGenerate();

    expect(fs.existsSync(path.join(root, "opencode.json"))).toBe(false);
    const configOutputs = result.outputs.filter((o) => o.path.endsWith("opencode.json"));
    expect(configOutputs).toHaveLength(0);
    // Skill + instructions still generated
    expect(fs.existsSync(path.join(root, ".opencode/skills/usm-workflow/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".opencode/usm-instructions.md"))).toBe(true);
  });

  it("is idempotent — regenerating does not duplicate the instructions entry", () => {
    runGenerate();
    runGenerate();
    const config = JSON.parse(read("opencode.json")) as { instructions: string[] };
    expect(config.instructions.filter((e) => e === ".opencode/usm-instructions.md")).toHaveLength(1);
  });

  it("supports an existing .opencode/opencode.json config location", () => {
    fs.mkdirSync(path.join(root, ".opencode"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".opencode", "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", instructions: ["CUSTOM.md"] }),
    );

    runGenerate();

    expect(fs.existsSync(path.join(root, "opencode.json"))).toBe(false);
    const config = JSON.parse(read(".opencode/opencode.json")) as { instructions: string[] };
    expect(config.instructions).toEqual(["CUSTOM.md", ".opencode/usm-instructions.md"]);
  });

  it("emits the same skill for Claude Code (shared SKILL.md convention)", () => {
    runGenerate();
    const claudeSkill = read(".claude/skills/usm-workflow/SKILL.md");
    expect(claudeSkill).toMatch(/^name:\s*usm-workflow$/m);
    expect(claudeSkill).toMatch(/^description:\s*Enforces the USM spec-first workflow/m);
    expect(claudeSkill).toMatch(/usm_draft_feature/);
    // Identical content to the opencode skill — one source, two runtimes
    expect(claudeSkill).toBe(read(".opencode/skills/usm-workflow/SKILL.md"));
  });

  it("emits a Cursor alwaysApply iron-rules rule (every request)", () => {
    runGenerate();
    const rule = read(".cursor/rules/usm-always.mdc");
    expect(rule).toMatch(/^alwaysApply:\s*true$/m);
    expect(rule).toMatch(/Before ANY code change/);
    expect(rule).toContain(USM_UPSTREAM_TRACKER);
    // Detailed glob-scoped rule still generated alongside
    expect(fs.existsSync(path.join(root, ".cursor/rules/usm.mdc"))).toBe(true);
  });

  it("emits a Copilot instructions file with broad applyTo", () => {
    runGenerate();
    const instructions = read(".github/instructions/usm-iron-rules.md");
    expect(instructions).toMatch(/^applyTo:\s*"\*\*"$/m);
    expect(instructions).toMatch(/Before ANY code change/);
    expect(instructions).toContain(USM_UPSTREAM_TRACKER);
  });
});

describe("usm/feedback-upstream-routing", () => {
  it("renders the scope branch with the upstream URL in the protocol", () => {
    const protocol = generateFeedbackProtocol(SYSTEM);
    expect(protocol).toMatch(/Where does the bug live\?/);
    expect(protocol).toMatch(/This project/);
    expect(protocol).toMatch(/The USM tool itself/);
    expect(protocol).toContain(USM_UPSTREAM_TRACKER);
    expect(protocol).toMatch(/gh issue create -R Smith-Gray-Pty-Ltd\/usm|ask.*whether to file it upstream/);
    // Project-scope policy behaviour preserved
    expect(protocol).toMatch(/human-gate/);
    expect(protocol).toMatch(/\*\*NEVER\*\* create ad-hoc tracking files/);
    // Never misfile rule
    expect(protocol).toMatch(/never in this repo/i);
  });

  it("honours the feedback.upstream_tracker override", () => {
    const system: SystemUsm = {
      ...SYSTEM,
      feedback: { policy: "direct-to-github", upstream_tracker: "https://github.com/fork/usm/issues" },
    };
    const protocol = generateFeedbackProtocol(system);
    expect(protocol).toContain("https://github.com/fork/usm/issues");
    expect(protocol).toMatch(/gh issue create -R .*fork\/usm/);
  });

  it("renders the scope table on the docs feedback page", () => {
    const page = generateFeedbackPage(SYSTEM, root);
    const content = page.outputs[0].content;
    expect(content).toMatch(/Where does the bug live\?/);
    expect(content).toContain(USM_UPSTREAM_TRACKER);
    expect(content).toMatch(/are \*\*not\*\* this project's bugs/);
  });

  it("collapses the protocol coherently when the project tracker IS the upstream tracker (USM repo itself)", () => {
    const usmRepoSystem: SystemUsm = {
      ...SYSTEM,
      identity: { name: "USM", domain: "usm.dev", repository: "https://github.com/Smith-Gray-Pty-Ltd/usm" },
    };
    const protocol = generateFeedbackProtocol(usmRepoSystem);
    // Single-tracker statement present…
    expect(protocol).toMatch(/is\*\* the USM project.*same place/s);
    expect(protocol).toContain(USM_UPSTREAM_TRACKER);
    // …and the contradictory never-file-here guidance is gone
    expect(protocol).not.toMatch(/\*\*Never\*\* file USM tool bugs in this project's tracker/);
    expect(protocol).not.toMatch(/live upstream:.*never in this repo/);
    expect(protocol).toMatch(/in this codebase \*\*and\*\* bugs in the USM tool itself/);
  });

  it("collapses the docs feedback page the same way", () => {
    const usmRepoSystem: SystemUsm = {
      ...SYSTEM,
      identity: { name: "USM", domain: "usm.dev", repository: "https://github.com/Smith-Gray-Pty-Ltd/usm" },
    };
    const page = generateFeedbackPage(usmRepoSystem, root);
    const content = page.outputs[0].content;
    expect(content).toMatch(/is\*\* the USM project.*same place/s);
    expect(content).not.toMatch(/are \*\*not\*\* this project's bugs/);
    expect(content).not.toMatch(/Never file tool bugs in this project's tracker/);
  });

  it("keeps the full two-scope table when trackers differ (downstream repos)", () => {
    const protocol = generateFeedbackProtocol(SYSTEM); // repository: test-org/repo
    expect(protocol).toMatch(/\| \*\*This project\*\*.*\|/);
    expect(protocol).toMatch(/\| \*\*The USM tool itself\*\*.*\|/);
    expect(protocol).toMatch(/\*\*Never\*\* file USM tool bugs in this project's tracker/);
    expect(protocol).toMatch(/live upstream:.*never in this repo/);
  });

  it("schema accepts the optional upstream_tracker field (and its absence)", () => {
    const withOverride = parseUsm(`$schema: https://usm.dev/schema/v1.json
$id: test-org/system
$type: system
$version: 1
summary: Override system
identity:
  name: TestOrg
  domain: example.com
feedback:
  policy: human-gate
  upstream_tracker: https://github.com/fork/usm/issues
`);
    expect(validateUsm(withOverride).valid).toBe(true);
    const without = parseUsm(`$schema: https://usm.dev/schema/v1.json
$id: test-org/system
$type: system
$version: 1
summary: No override system
identity:
  name: TestOrg
  domain: example.com
feedback:
  policy: human-gate
`);
    expect(validateUsm(without).valid).toBe(true);
  });

  it("flows the scope distinction into every rules file via the shared block", () => {
    runGenerate();
    for (const rel of ["CLAUDE.md", ".github/copilot-instructions.md", ".cursor/rules/usm.mdc"]) {
      const content = read(rel);
      expect(content).toMatch(/Where does the bug live\?/, `${rel} missing scope branch`);
      expect(content).toContain(USM_UPSTREAM_TRACKER, `${rel} missing upstream URL`);
    }
  });
});
