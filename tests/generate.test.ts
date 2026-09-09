import { describe, it, expect } from "vitest";
import { generate } from "../src/generate.js";
import { parseUsmFile } from "../src/parse.js";
import path from "node:path";
import fs from "node:fs";

const FIXTURES = path.resolve(__dirname, "../examples");
const SPEC_DIR = path.resolve(__dirname, "../.usm");
import { existsSync } from "node:fs";
const HAS_USM_SCOPE = existsSync(SPEC_DIR);

describe("generate markdown", () => {
  it("generates markdown for a system file", () => {
    const parsed = parseUsmFile(path.join(FIXTURES, "system.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBeGreaterThanOrEqual(1);
    expect(result.outputs[0].content).toContain("Example System");
    expect(result.outputs[0].content).toContain("fully generated");
    expect(result.outputs[0].path).toMatch(/\.md$/);
  });

  it("generates markdown for a service file", () => {
    const parsed = parseUsmFile(path.join(FIXTURES, "service.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBeGreaterThanOrEqual(1);
    expect(result.outputs.some(o => o.content.includes("nextjs"))).toBe(true);
  });

  it("generates markdown for a feature file", () => {
    const parsed = parseUsmFile(path.join(FIXTURES, "feature.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].content).toContain("## Why this exists");
    expect(result.outputs[0].content).toContain("## How it works");
    expect(result.outputs[0].content).toContain("## Guarantees");
    expect(result.outputs[0].content).toContain("## Test specifications");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real system.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "system.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    const content = result.outputs[0].content;
    expect(content).toContain("Universal System Map");
    expect(content).toContain("fully generated");
    expect(content).toContain("Getting Started");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real cli.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "services/cli.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBeGreaterThanOrEqual(1);
    const content = result.outputs[0].content;
    expect(content).toContain("USM CLI");
    // Modules appear in the architecture/modules.md output, not the README
    const allContent = result.outputs.map(o => o.content).join("\n");
    expect(allContent).toContain("commander");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real init.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "features/cli/init.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    const content = result.outputs[0].content;
    expect(content).toContain("## Why this exists");
    expect(content).toContain("## How it works");
    expect(content).toContain("run-init");
    expect(content).toContain("## Guarantees");
    expect(content).toContain("init-creates-config");
    expect(content).toContain("## Test specifications");
  });

  it("throws on unknown generator", () => {
    const parsed = parseUsmFile(path.join(FIXTURES, "system.usm"));
    expect(() => generate(parsed, ["unknown" as any])).toThrow("Unknown generator");
  });

  // Regression tests for issues #24 and #25: feature markdown must be written to
  // the root .usm-workspace/docs/features/ workspace, NOT under apps/<service>/
  // (which produced a phantom apps/system/ dir for system-level features and
  // made feature docs invisible to the VitePress sidebar).
  describe("feature output path (issues #24 + #25)", () => {
    it("writes app-service feature docs to the root docs workspace, not apps/<service>/", () => {
      const parsed = parseUsmFile(path.join(FIXTURES, "feature.usm")) as any;
      const result = generate(parsed, ["markdown"], "/tmp/test-root");
      expect(result.outputs).toHaveLength(1);
      const out = result.outputs[0].path;
      // Must be in the root .usm-workspace/docs/features/ tree
      expect(out).toMatch(/\/tmp\/test-root\/\.usm-workspace\/docs\/features\//);
      // Must NOT route to apps/<service>/.usm-workspace/ (the old buggy behaviour)
      expect(out).not.toMatch(/\/apps\/[^/]+\/\.usm-workspace\//);
    });

    it("writes system-level feature docs to the root docs workspace (no phantom apps/system/)", () => {
      // A system-level feature: $service === $system. Previously this routed to
      // apps/system/.usm-workspace/... which doesn't exist as a directory.
      const yaml = [
        "$schema: https://usm.dev/schema/v1.json",
        "$id: example/infrastructure",
        "$type: feature",
        "$version: 1",
        "summary: System-level cross-cutting feature.",
        "$system: example/system",
        "$service: example/system",
        "intent: Cross-cutting infra concern.",
      ].join("\n");
      const tmpFile = path.join(__dirname, "fixtures-tmp-system-feature.usm");
      fs.writeFileSync(tmpFile, yaml, "utf-8");
      try {
        const parsed = parseUsmFile(tmpFile) as any;
        const result = generate(parsed, ["markdown"], "/tmp/test-root");
        expect(result.outputs).toHaveLength(1);
        const out = result.outputs[0].path;
        expect(out).toMatch(/\/tmp\/test-root\/\.usm-workspace\/docs\/features\//);
        expect(out).not.toMatch(/\/apps\/system\/\.usm-workspace\//);
        expect(out).not.toMatch(/\/apps\/[^/]+\/\.usm-workspace\//);
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    });
  });
});
