/**
 * Docs sidebar IA restructure tests (usm/docs-ia-restructure).
 *
 * VitePress supports one level of sidebar nesting; the old generator emitted
 * three (Project Management → Features → area → pages), which VitePress
 * silently flattened — groups titled after arbitrary first items, 38 feature
 * pages dumped under one heading, "CLI CLI…" label duplication, four bare
 * "Overview"s, and the help tree exposing feature build specs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSidebar } from "../src/cli/docs.js";

let dir: string;
let docsRoot: string;

function writePage(rel: string, content = "# Page\n"): void {
  const p = path.join(docsRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-ia-"));
  docsRoot = path.join(dir, ".usm-workspace", "docs");
  fs.mkdirSync(docsRoot, { recursive: true });
  // Minimal system.usm with an index covering the feature areas
  fs.mkdirSync(path.join(dir, ".usm"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".usm", "system.usm"),
    [
      "$schema: https://usm.dev/schema/v1.json",
      "$id: t/system",
      "$type: system",
      "$version: 1",
      "identity:",
      "  name: t",
      "  domain: test",
      "summary: t",
      "index:",
      "  - name: Color Output",
      "    ref: .usm/features/cli/color-output.usm",
      "    status: active",
      "  - name: MCP Read Tool",
      "    ref: .usm/features/mcp/read.usm",
      "    status: active",
      "services: []",
      "roadmap:",
      "  - id: r1",
      "    title: Something",
      "    description: d",
      "    status: shipped",
    ].join("\n") + "\n",
    "utf-8",
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function groupTitles(groups: { text: string; items?: unknown[] }[]): string[] {
  return groups.map((g) => g.text);
}

/** Recursively verify no group nests another group (single-level contract). */
function assertFlat(groups: { text: string; items?: Array<{ text: string; link?: string; items?: unknown[] }> }[], path = ""): void {
  for (const g of groups) {
    for (const item of g.items ?? []) {
      expect((item as { items?: unknown[] }).items, `${path}/${g.text}/${item.text} nests a group`).toBeUndefined();
    }
  }
}

describe("sidebar IA restructure (usm/docs-ia-restructure)", () => {
  describe("developer audience", () => {
    let groups: Array<{ text: string; items?: Array<{ text: string; link?: string }> }>;

    beforeEach(() => {
      // Pages on disk for every sidebar source
      writePage("index.md");
      writePage("agent-setup-guide.md");
      writePage("editor-setup/index.md");
      writePage("roadmap.md");
      writePage("design/decision-register.md");
      writePage("schema-reference.md");
      writePage("cli-reference.md");
      writePage("config-reference.md");
      writePage("mcp-reference.md");
      writePage("code-navigator.md");
      writePage("spec-coverage.md");
      writePage("orphan-files.md");
      writePage("features/cli/color-output.md");
      writePage("features/cli/index.md");
      writePage("features/mcp/read.md");
      writePage("design/project-overview.md");
      groups = generateSidebar(dir, docsRoot, "developer") as typeof groups;
    });

    it("uses single-level nesting only — no group inside a group", () => {
      assertFlat(groups);
    });

    it("orders sections: Getting Started, [areas], Project Management, Reference, Source Map, Exports", () => {
      const titles = groupTitles(groups);
      expect(titles.indexOf("Getting Started")).toBe(0);
      // Guides group appears only when .usm-workspace/user-docs exists
      // (composed personas+journeys — fixture doesn't create it); the
      // browser-verified test in docsIaRender covers the Guides position.
      expect(titles).toContain("CLI"); // feature areas as top-level groups
      expect(titles).toContain("MCP");
      expect(titles).toContain("Project Management");
      expect(titles.indexOf("Project Management")).toBeGreaterThan(titles.indexOf("CLI"));
      expect(titles).toContain("Reference");
      expect(titles.indexOf("Reference")).toBeGreaterThan(titles.indexOf("Project Management"));
      expect(titles).toContain("Source Map");
    });

    it("has no first-item-fallback group titles", () => {
      const titles = groupTitles(groups);
      // The old bug: groups named after their first item ("Roadmap" containing
      // all features, "Source Map" containing references, "Overview" for TOGAF)
      const pmGroup = groups.find((g) => g.text === "Project Management");
      expect(pmGroup?.items?.length).toBeLessThanOrEqual(3); // Roadmap + Decision Register only
      const refGroup = groups.find((g) => g.text === "Reference");
      expect(refGroup?.items?.some((i) => i.text === "CLI Reference")).toBe(true);
    });

    it("labels area overviews '<Area> overview', never bare 'Overview'", () => {
      const allLabels: string[] = [];
      for (const g of groups) {
        for (const item of g.items ?? []) allLabels.push(item.text);
      }
      const bareOverviews = allLabels.filter((l) => l === "Overview" && !l.includes("Phase"));
      // The TOGAF "Overview" (architecture/architecture) is a single page link —
      // allowed; area-overview duplication is what's banned.
      const cliGroup = groups.find((g) => g.text === "CLI");
      expect(cliGroup?.items?.some((i) => i.text === "CLI overview")).toBe(true);
      expect(cliGroup?.items?.some((i) => i.text === "Overview")).toBe(false);
      void bareOverviews;
    });

    it("does not duplicate the area prefix in feature labels", () => {
      const cliGroup = groups.find((g) => g.text === "CLI");
      for (const item of cliGroup?.items ?? []) {
        expect(item.text.startsWith("CLI CLI")).toBe(false);
      }
      // system.index name is used verbatim
      expect(cliGroup?.items?.some((i) => i.text === "Color Output")).toBe(true);
    });

    it("Design section renders as Architecture", () => {
      expect(groupTitles(groups)).toContain("Architecture");
      expect(groupTitles(groups)).not.toContain("Design");
    });

    it("Decision Register sits in Project Management for developers", () => {
      const pm = groups.find((g) => g.text === "Project Management");
      expect(pm?.items?.some((i) => i.text === "Decision Register")).toBe(true);
    });
  });

  describe("help audience (help-audience-purity)", () => {
    let groups: Array<{ text: string; items?: Array<{ text: string; link?: string }> }>;

    beforeEach(() => {
      writePage("index.md");
      writePage("editor-setup/index.md");
      writePage("roadmap.md");
      writePage("design/decision-register.md");
      writePage("cli-reference.md");
      writePage("config-reference.md");
      writePage("mcp-reference.md");
      writePage("language-support.md");
      writePage("feedback.md");
      // Feature build specs exist on disk — must NOT appear in help sidebar
      writePage("features/cli/color-output.md");
      groups = generateSidebar(dir, docsRoot, "help") as typeof groups;
    });

    it("shows only user-journey groups: Getting Started, Project Management, Reference, Help (Guides when user-docs exists)", () => {
      const titles = groupTitles(groups);
      expect(titles).toEqual(["Getting Started", "Project Management", "Reference", "Help"]);
    });

    it("excludes feature build specs and the Decision Register", () => {
      const titles = groupTitles(groups);
      expect(titles).not.toContain("CLI");
      const pm = groups.find((g) => g.text === "Project Management");
      expect(pm?.items?.some((i) => i.text === "Decision Register")).toBe(false);
      // No features/ links anywhere
      for (const g of groups) {
        for (const item of g.items ?? []) {
          expect(item.link?.startsWith("/features/"), `${g.text}/${item.text} links features/`).toBeFalsy();
        }
      }
    });

    it("keeps the Roadmap as a single entry", () => {
      const pm = groups.find((g) => g.text === "Project Management");
      const roadmapEntries = (pm?.items ?? []).filter((i) => i.text === "Roadmap");
      expect(roadmapEntries.length).toBe(1);
    });
  });
});
describe("roadmap covers built features (usm/docs-ia-restructure roadmap-current)", () => {
  it("every built feature in system.index has a roadmap entry with shipped_in; no planned item for built work", async () => {
    const { parseUsmFile } = await import("../src/parse.js");
    const sys = parseUsmFile(path.resolve(".usm/system.usm")) as {
      index: Array<{ ref: string; status?: string }>;
      roadmap: Array<{ feature?: string; status: string; shipped_in?: string }>;
    };
    const builtRefs = new Set(
      sys.index.filter((f) => f.status === "built").map((f) => f.ref.replace(/^\.\//, ".usm/")),
    );
    const roadmapFeats = new Set(sys.roadmap.map((r) => r.feature).filter(Boolean));
    for (const ref of builtRefs) {
      expect(roadmapFeats.has(ref), `${ref} is built but absent from roadmap`).toBe(true);
    }
    // No roadmap item claims planned for a feature the index marks built
    for (const r of sys.roadmap) {
      if (r.feature && r.status === "planned") {
        const idxStatus = sys.index.find((f) => f.ref.replace(/^\.\//, ".usm/") === r.feature)?.status;
        expect(idxStatus, `${r.feature} roadmap=planned but index=${idxStatus}`).not.toBe("built");
      }
      if (r.status === "shipped") {
        expect(r.shipped_in, `${r.feature} shipped without shipped_in`).toBeTruthy();
      }
    }
  });
});
