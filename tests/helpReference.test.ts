import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  generateCliReference,
  generateMcpReference,
  generateConfigReference,
} from "../src/generators/markdown.js";

/**
 * usm/gen-help-reference — contract tests.
 * Reference pages are generated from .usm feature specs (usage/options
 * fields) and JSON schemas (usmconfig-v1.json, v1.json). Verified against
 * this repo's own specs (dogfooded), like validate.test.ts does.
 */

const ROOT = process.cwd();

describe("usm/gen-help-reference", () => {
  it("cli-reference covers every CLI feature with usage + options", () => {
    const result = generateCliReference(ROOT);
    expect(result.outputs.length).toBeGreaterThan(0);
    const md = result.outputs[0]!.content;

    // Every CLI feature with usage/options appears, sectioned by command name
    const cliDir = path.join(ROOT, ".usm", "features", "cli");
    const cliFeatures = fs
      .readdirSync(cliDir)
      .filter((f) => f.endsWith(".usm"))
      .map((f) => fs.readFileSync(path.join(cliDir, f), "utf-8"));
    let counted = 0;
    for (const feature of cliFeatures) {
      if (!/\nusage:/.test(feature)) continue;
      const cmdMatch = feature.match(/^command: (.+)$/m);
      const cmd = cmdMatch ? cmdMatch[1].trim() : null;
      if (!cmd || cmd.startsWith("usm_")) continue; // MCP tools go to MCP reference
      expect(md).toMatch(new RegExp(`^## ${cmd}$`, "m"));
      counted++;
    }
    expect(counted).toBeGreaterThan(5); // scan, generate, docs, enrich, init, ...

    // options tables render flag + default columns
    expect(md).toMatch(/--root/);
    expect(md).toMatch(/\| *Default/);
  });

  it("mcp-reference lists all MCP tools with summaries", () => {
    const result = generateMcpReference(ROOT);
    expect(result.outputs.length).toBeGreaterThan(0);
    const md = result.outputs[0]!.content;

    // Every MCP feature spec appears, sectioned by its command (tool name)
    const mcpDir = path.join(ROOT, ".usm", "features", "mcp");
    const mcpFeatures = fs
      .readdirSync(mcpDir)
      .filter((f) => f.endsWith(".usm"))
      .map((f) => fs.readFileSync(path.join(mcpDir, f), "utf-8"));
    for (const feature of mcpFeatures) {
      const cmdMatch = feature.match(/^command: (.+)$/m);
      if (!cmdMatch) continue;
      // a spec may declare multiple comma-separated tools (write.usm covers 4)
      for (const cmd of cmdMatch[1].split(",").map((c) => c.trim())) {
        expect(md).toMatch(new RegExp(`^## ${cmd}$`, "m"));
      }
    }
    // read + write tool families both present
    expect(md).toContain("usm_list");
    expect(md).toContain("usm_draft_feature");
  });

  it("config-reference is generated from usmconfig-v1.json descriptions", () => {
    const result = generateConfigReference(ROOT);
    expect(result.outputs.length).toBeGreaterThan(0);
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, "schema", "usmconfig-v1.json"), "utf-8"),
    );
    const md = result.outputs[0]!.content;
    const props = Object.keys(schema.properties || {});
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(md).toContain(prop);
    }
  });

  it("schema-reference covers all .usm types with required markers", () => {
    const md = fs.readFileSync(
      path.join(ROOT, ".usm-workspace", "docs", "schema-reference.md"),
      "utf-8",
    );
    for (const t of ["system", "service", "feature", "data"]) {
      expect(md.toLowerCase()).toMatch(new RegExp(`\\b${t}\\b`));
    }
    expect(md).toMatch(/[Rr]equired/);
    expect(md).toMatch(/[Oo]ptional/);
  });
});