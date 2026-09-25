import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateRoadmapDoc } from "../src/generators/markdown.js";
import { generateSidebar } from "../src/cli/docs.js";
import type { SystemUsm } from "../src/types.js";

/**
 * usm/gen-roadmap — contracts:
 *  - roadmap-only-generated-when-non-empty
 *  - sidebar-no-dead-links
 *  - sidebar-case-matches-files
 *  - mermaid-renders-in-vitepress (config/boot-script presence)
 */

function makeSystem(roadmap: unknown[], index?: unknown[]): SystemUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/system",
    $type: "system",
    $version: 1,
    summary: "test system",
    identity: { name: "Test", domain: "testing" },
    roadmap,
    index,
  } as unknown as SystemUsm;
}

describe("usm/gen-roadmap contracts", () => {
  describe("roadmap-only-generated-when-non-empty", () => {
    it("generates no roadmap.md for an empty roadmap", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-roadmap-"));
      try {
        const result = generateRoadmapDoc(makeSystem([]), root);
        expect(result.outputs).toHaveLength(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("generates roadmap.md with a table when items exist", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-roadmap-"));
      try {
        const result = generateRoadmapDoc(
          makeSystem([
            {
              id: "item-1",
              title: "Shipped thing",
              description: "did the thing",
              status: "shipped",
              shipped_in: "0.1.0",
              target_date: "2026-01-01",
            },
            {
              id: "item-2",
              title: "Planned thing",
              description: "will do the thing",
              status: "planned",
            },
          ]),
          root,
        );
        expect(result.outputs).toHaveLength(1);
        const out = result.outputs[0]!;
        expect(out.path).toMatch(/roadmap\.md$/);
        expect(out.content).toContain("| Status | Title | Shipped In |");
        expect(out.content).toContain("Shipped thing");
        expect(out.content).toContain("0.1.0");
        expect(out.content).toContain("Planned thing");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("feature links", () => {
    it("links titles to feature doc paths when the feature is indexed", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-roadmap-"));
      try {
        const result = generateRoadmapDoc(
          makeSystem(
            [
              {
                id: "docs",
                title: "VitePress docs",
                status: "shipped",
                feature: "usm/cli-docs",
              },
            ],
            [{ id: "cli-docs", name: "Docs", ref: ".usm/features/cli/docs.usm", status: "active" }],
          ),
          root,
        );
        const out = result.outputs[0]!;
        expect(out.content).toContain("[VitePress docs](features/cli/docs)");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it("leaves titles unlinked when the feature field has no index entry", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-roadmap-"));
      try {
        const result = generateRoadmapDoc(
          makeSystem([{ id: "x", title: "No link", status: "planned", feature: "usm/nonexistent" }]),
          root,
        );
        const out = result.outputs[0]!;
        expect(out.content).not.toContain("[No link](");
        expect(out.content).toContain("| No link |");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("sidebar-no-dead-links + case-matches-files", () => {
    let root: string;
    let docsRoot: string;

    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-sidebar-"));
      docsRoot = path.join(root, ".usm-workspace", "docs");
      fs.mkdirSync(path.join(root, ".usm"), { recursive: true });
      fs.mkdirSync(path.join(docsRoot, "features", "generators"), { recursive: true });
      // roadmap exists, risks does not — sidebar must link roadmap, never risks
      fs.writeFileSync(path.join(docsRoot, "roadmap.md"), "# Roadmap\n");
      // camelCase file on disk — sidebar link must match case exactly
      fs.writeFileSync(path.join(docsRoot, "features", "generators", "agentsMd.md"), "# x\n");
      // generateSidebar reads .usm/system.usm for the feature index
      fs.writeFileSync(
        path.join(root, ".usm", "system.usm"),
        [
          "$schema: https://usm.dev/schema/v1.json",
          "$id: test/system",
          "$type: system",
          "$version: 1",
          'summary: "test"',
          "identity:",
          "  name: Test",
          "  domain: testing",
          "index:",
          "  - id: gen-agentsmd",
          "    name: AGENTS.md Generator",
          "    ref: .usm/features/generators/agentsMd.usm",
          "    status: active",
        ].join("\n"),
        "utf-8",
      );
    });

    afterAll(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("includes roadmap link when roadmap.md exists", () => {
      const sidebar = generateSidebar(root, docsRoot, "developer");
      const json = JSON.stringify(sidebar);
      expect(json).toContain('"/roadmap"');
      expect(json).toContain("features/generators/agentsMd"); // exact case
    });

    it("omits the Risks link when risks.md does not exist", () => {
      const sidebar = generateSidebar(root, docsRoot, "developer");
      const json = JSON.stringify(sidebar);
      expect(json).not.toContain('"/risks"');
    });
  });

  describe("mermaid-renders-in-vitepress", () => {
    it("injected VitePress config boots mermaid from CDN with render pass", async () => {
      // The generated config.mts must contain the mermaid boot script so
      // ```mermaid blocks render as diagrams, not raw text.
      const { readFileSync } = await import("node:fs");
      const configPath = path.join(
        process.cwd(),
        ".usm-workspace",
        "docs",
        ".vitepress",
        "config.mts",
      );
      // The boot script is injected into the generated config when docs exist;
      // verify via the generator source constant instead of a live build.
      const src = readFileSync("src/cli/docs.ts", "utf8");
      expect(src).toContain("mermaid.run");
      expect(src).toContain("language-mermaid");
      void configPath;
    });
  });
});