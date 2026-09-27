/**
 * Config validation tests (issue #43).
 *
 * usmconfig.json is validated at load time against the packaged
 * usmconfig-v1.json schema. Previously the loaders spread `outputs` with no
 * key checking and silent catch fallbacks: invented keys (agent_context,
 * api_docs, design_docs, diagrams — real safekeys config) silently landed
 * output in .usm-workspace/ defaults. Contracts in usm/config-validation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateConfigObject,
  validateConfigFile,
  formatConfigErrors,
} from "../src/validateConfig.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-config-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(content: string | object): string {
  const p = path.join(tmpDir, "usmconfig.json");
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  return p;
}

describe("validateConfigObject (issue #43)", () => {
  it("accepts a fully valid config", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      outputs: { docs: "docs/", tests: "tests/auto-generated/" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects unknown outputs keys with key name + hint", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "safekeys",
      outputs: {
        usm_source: ".usm/",
        agent_context: ".usm-workspace/",
        api_docs: "docs/api/",
        design_docs: "docs/design/",
        diagrams: "docs/diagrams/",
      },
    });
    expect(result.valid).toBe(false);
    const badKeys = result.errors.map((e) => e.path);
    expect(badKeys).toContain("outputs.agent_context");
    expect(badKeys).toContain("outputs.api_docs");
    expect(badKeys).toContain("outputs.design_docs");
    expect(badKeys).toContain("outputs.diagrams");
    // Collects ALL violations, not just the first
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("suggests the rename for api_docs → openapi", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      outputs: { api_docs: "docs/api/" },
    });
    const hint = result.errors.find((e) => e.path === "outputs.api_docs")?.hint;
    expect(hint).toContain("openapi");
  });

  it("explains the namespace confusion for agent_context (spec-schema field, not config key)", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      outputs: { agent_context: ".usm-workspace/" },
    });
    const hint = result.errors.find((e) => e.path === "outputs.agent_context")?.hint;
    expect(hint).toContain("system.usm");
  });

  it("rejects unknown keys at the top level with the same shape", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      bogus_top_level: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("bogus_top_level"))).toBe(true);
  });

  it("rejects wrong-typed values (full-schema validation, not just unknown keys)", () => {
    const result = validateConfigObject({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      outputs: { tests: 42 },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a missing required $schema/version/name", () => {
    const result = validateConfigObject({ name: "t" });
    expect(result.valid).toBe(false);
  });
});

describe("validateConfigFile (usm validate --config)", () => {
  it("returns parseError verbatim for malformed JSON", () => {
    const p = writeConfig('{"outputs":');
    const result = validateConfigFile(p);
    expect(result.valid).toBe(false);
    expect(result.parseError).toBeTruthy();
  });

  it("reports file-not-found", () => {
    const result = validateConfigFile(path.join(tmpDir, "nope.json"));
    expect(result.valid).toBe(false);
    expect(result.parseError).toContain("file not found");
  });

  it("passes a valid file with no parse error", () => {
    const p = writeConfig({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
    });
    const result = validateConfigFile(p);
    expect(result.valid).toBe(true);
    expect(result.parseError).toBeUndefined();
  });
});

describe("formatConfigErrors", () => {
  it("names the config path, each bad key, and the supported key set", () => {
    const { validateConfigObject: v } = { validateConfigObject };
    const result = v({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "t",
      outputs: { agent_context: "x" },
    });
    const lines = formatConfigErrors("/repo/usmconfig.json", result.errors);
    const joined = lines.join("\n");
    expect(joined).toContain("/repo/usmconfig.json");
    expect(joined).toContain("outputs.agent_context");
    expect(joined).toContain("workspace, docs, help_docs, archimate, togaf, openapi, tests, usm_source, agents_md");
  });
});