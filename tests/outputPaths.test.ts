import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { outDir, outPath } from "../src/outputPaths.js";
import { generateRoadmapDoc } from "../src/generators/markdown.js";
import type { SystemUsm } from "../src/types.js";

/**
 * usm/cli-config-outputs — contract outputs-configurable:
 * output paths come from usmconfig.json (outputs section), defaults apply
 * when config is missing or the section is absent.
 */

function makeSystem(): SystemUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/system",
    $type: "system",
    $version: 1,
    summary: "test system",
    identity: { name: "Test", domain: "testing" },
    roadmap: [{ id: "r1", title: "Item", status: "planned" }],
  } as unknown as SystemUsm;
}

describe("usm/cli-config-outputs", () => {
  describe("default paths (no config)", () => {
    let root: string;
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-outputs-default-"));
    });
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it("docs resolve to .usm-workspace/docs", () => {
      expect(outDir(root, "docs")).toBe(path.join(root, ".usm-workspace", "docs"));
 expect(outDir(root, "togaf")).toBe(path.join(root, ".usm-workspace", "togaf"));
      expect(outDir(root, "help_docs")).toBe(path.join(root, ".usm-workspace", "help-docs"));
      expect(outDir(root, "tests")).toBe(path.join(root, ".usm-workspace", "tests"));
    });

    it("generator writes to default docs path", () => {
      const result = generateRoadmapDoc(makeSystem(), root);
      expect(result.outputs[0]!.path).toBe(path.join(root, ".usm-workspace", "docs", "roadmap.md"));
    });
  });

  describe("custom paths via usmconfig.json", () => {
    let root: string;
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-outputs-custom-"));
      fs.writeFileSync(
        path.join(root, "usmconfig.json"),
        JSON.stringify({ outputs: { docs: "generated/site", tests: "generated/specs" } }),
        "utf-8",
      );
    });
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it("docs resolve to the configured path", () => {
      expect(outDir(root, "docs")).toBe(path.join(root, "generated", "site"));
      expect(outPath(root, "docs", "roadmap.md")).toBe(path.join(root, "generated", "site", "roadmap.md"));
      expect(outDir(root, "tests")).toBe(path.join(root, "generated", "specs"));
    });

    it("unconfigured types keep defaults", () => {
      expect(outDir(root, "togaf")).toBe(path.join(root, ".usm-workspace", "togaf"));
    });

    it("generator honours the configured docs path", () => {
      const result = generateRoadmapDoc(makeSystem(), root);
      expect(result.outputs[0]!.path).toBe(path.join(root, "generated", "site", "roadmap.md"));
    });
  });

  describe("malformed config falls back to defaults", () => {
    let root: string;
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-outputs-bad-"));
      fs.writeFileSync(path.join(root, "usmconfig.json"), "{ not json", "utf-8");
    });
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it("docs still resolve to default", () => {
      expect(outDir(root, "docs")).toBe(path.join(root, ".usm-workspace", "docs"));
    });
  });
});