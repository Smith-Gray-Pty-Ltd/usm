import { describe, it, expect } from "vitest";
import { generate } from "../src/generate.js";
import { parseUsmFile } from "../src/parse.js";
import path from "node:path";

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
    expect(result.outputs[0].content).toContain("## Identity");
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
    expect(result.outputs[0].content).toContain("## Intent");
    expect(result.outputs[0].content).toContain("## Flows");
    expect(result.outputs[0].content).toContain("## Contracts");
    expect(result.outputs[0].content).toContain("## Tests");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real system.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "system.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    const content = result.outputs[0].content;
    expect(content).toContain("Smith & Gray AI Platform");
    expect(content).toContain("## Services");
    expect(content).toContain("the-architect");
    expect(content).toContain("## Infrastructure");
    expect(content).toContain("AWS");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real the-architect.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "services/the-architect.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    const content = result.outputs[0].content;
    expect(content).toContain("Control Plane for Agentic Development");
    expect(content).toContain("## Decisions");
    expect(content).toContain("adr-001");
    expect(content).toContain("## Modules");
    expect(content).toContain("Agent Runtime");
  });

  it.skipIf(!HAS_USM_SCOPE)("generates markdown for the real login.usm", () => {
    const parsed = parseUsmFile(path.join(SPEC_DIR, "features/auth/login.usm"));
    const result = generate(parsed, ["markdown"], "/tmp/test-root");
    expect(result.outputs.length).toBe(1);
    const content = result.outputs[0].content;
    expect(content).toContain("## Intent");
    expect(content).toContain("## Flows");
    expect(content).toContain("happy-path");
    expect(content).toContain("## Contracts");
    expect(content).toContain("session-cookie");
    expect(content).toContain("no-email-enumeration");
    expect(content).toContain("## Tests");
  });

  it("throws on unknown generator", () => {
    const parsed = parseUsmFile(path.join(FIXTURES, "system.usm"));
    expect(() => generate(parsed, ["unknown" as any])).toThrow("Unknown generator");
  });
});
