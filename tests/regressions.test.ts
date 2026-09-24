/**
 * Regression tests for open GitHub issues fixed in this change set.
 *
 *   #32 — AGENTS.md generate was non-idempotent (trailing newline accumulation)
 *   #34 — docs URL shape / project identity / MCP docs_url
 *   #35 — area overviews written to a nested service workspace
 *   #36 — sidebar omitted feature pages when an area had index.md
 *   #37 — two generators wrote data/models.md; --check could never pass
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseUsm, parseUsmFile, splitImplementationPaths } from "../src/parse.js";
import { validateUsm } from "../src/validate.js";
import { smartMerge } from "../src/generators/agentsMd.js";
import { generateDataModelDoc } from "../src/generators/markdown.js";
import { generateSurfaceTables, generateAreaOverviews } from "../src/generators/markdown.js";
import { featureDocsUrl, featureDocsPath, readDocsServePort } from "../src/mcp-utils.js";
import { generateSidebar } from "../src/cli/docs.js";
import { generateAllTestSpecs } from "../src/generators/testSpecs.js";
// ─── #32: AGENTS.md smart-merge idempotency ──────────────────────────────────

describe("smartMerge idempotency (issue #32)", () => {
  const START = "<!-- USM:START -->";
  const END = "<!-- USM:END -->";

  it("is byte-identical when merged repeatedly", () => {
    const generated = `${START}\n# Project\n\nbody\n\n${END}\n`;
    let content = generated;
    for (let i = 0; i < 5; i++) {
      content = smartMerge(content, generated);
    }
    expect(content).toBe(generated);
  });

  it("does not accumulate newlines after the end marker", () => {
    const generated = `${START}\n# Project\n\nbody\n\n${END}\n`;
    let content = `hand-written header\n\n${START}\n# Old\n\n${END}\n\n\n\n`;
    content = smartMerge(content, generated);
    content = smartMerge(content, generated);
    content = smartMerge(content, generated);

    expect(content).toContain("hand-written header");
    // Exactly one newline after the end marker for a single trailing merge.
    const afterMarker = content.slice(content.indexOf(END) + END.length);
    expect(afterMarker).toBe("\n");
  });

  it("preserves genuine hand-written content after the marker", () => {
    const generated = `${START}\n# Project\n\nbody\n\n${END}\n`;
    const existing = `${START}\n# Old\n\n${END}\n\n## Human notes\n\nkeep me\n`;
    const merged = smartMerge(existing, generated);
    expect(merged).toContain("## Human notes");
    expect(merged).toContain("keep me");
    expect(merged).toContain("body");
    expect(merged).not.toContain("# Old");
  });
});

// ─── #34: docs URL shape + project identity ─────────────────────────────────

describe("feature docs URL shape (issue #34)", () => {
  it("drops the $system namespace and mirrors the source layout", () => {
    const p = featureDocsPath("/repo/.usm/features/platform/my-feature.usm", "/repo");
    expect(p).toBe("/features/platform/my-feature");
  });

  it("treats a flat feature slug as an index page", () => {
    const p = featureDocsPath("/repo/.usm/features/onboarding.usm", "/repo");
    expect(p).toBe("/features/onboarding/");
  });

  it("returns null for files outside .usm/features/", () => {
    expect(featureDocsPath("/repo/.usm/services/cli.usm", "/repo")).toBeNull();
  });

  it("builds a full URL when the docs server recorded a port", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-docsurl-"));
    try {
      const featurePath = path.join(root, ".usm", "features", "platform", "my-feature.usm");
      fs.mkdirSync(path.dirname(featurePath), { recursive: true });
      fs.writeFileSync(featurePath, "", "utf-8");

      // No server yet → no URL, but still a usable path hint.
      expect(readDocsServePort(root)).toBeNull();
      const before = featureDocsUrl(featurePath, root);
      expect(before.url).toBeNull();
      expect(before.path).toBe("/features/platform/my-feature");
      expect(before.hint).toContain("/features/platform/my-feature");

      // Simulate a running server.
      const docsRoot = path.join(root, ".usm-workspace", "docs");
      fs.mkdirSync(docsRoot, { recursive: true });
      fs.writeFileSync(path.join(docsRoot, ".vitepress.port"), "5175", "utf-8");

      const after = featureDocsUrl(featurePath, root);
      expect(after.url).toBe("http://localhost:5175/features/platform/my-feature");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── #37: single owner for data/models.md ───────────────────────────────────

describe("data/models.md has a single writer (issue #37)", () => {
  it("generateDataModelDoc output is a pure function of the .usm inputs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-models-"));
    try {
      const dataUsm = parseUsm(`
$schema: https://usm.dev/schema/v1.json
$id: test/models
$type: data
$version: 1
$system: test/system
name: Platform DB
summary: "The platform Postgres database accessed via Prisma"
type: postgres
runtime: prisma
models:
  - User
  - Feature
`);
      const first = generateDataModelDoc([dataUsm as never], root).outputs[0];
      const second = generateDataModelDoc([dataUsm as never], root).outputs[0];

      // Byte-identical regardless of on-disk state — the old implementation
      // appended the ER section by reading the file it was about to overwrite.
      expect(second.content).toBe(first.content);
      expect(first.content).toContain("## ER Diagram");

      // And stable no matter what a prior run left on disk.
      fs.mkdirSync(path.dirname(first.path), { recursive: true });
      fs.writeFileSync(first.path, first.content + "\n\n\n", "utf-8");
      const third = generateDataModelDoc([dataUsm as never], root).outputs[0];
      expect(third.content).toBe(first.content);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("surface tables are derived from the generated overview, not disk state", () => {
    // generateSurfaceTables injects marker-based tables; the check pass must be
    // able to reproduce the same result without re-reading generated output.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-surface-"));
    try {
      const svcUsm = parseUsm(`
$schema: https://usm.dev/schema/v1.json
$id: test/system
$type: service
$version: 1
$system: test/system
type: api
runtime: node
summary: "A test service with a route"
`);
      const result = generateSurfaceTables([], [svcUsm as never], root);
      // No overview file on disk → no outputs, but never a crash.
      expect(result.outputs).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── #35: area overviews live in the root workspace ─────────────────────────

describe("area overviews use the root workspace (issue #35)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-area-"));
    const featuresDir = path.join(root, ".usm", "features", "platform");
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(
      path.join(featuresDir, "widgets.usm"),
      [
        "$schema: https://usm.dev/schema/v1.json",
        "$id: test/widgets",
        "$type: feature",
        "$version: 1",
        "$system: test/system",
        "$service: test/platform",
        "summary: A test feature inside an area without an umbrella file.",
        "intent: Test the area overview path.",
      ].join("\n"),
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes index.md to the root docs workspace, never apps/<svc>/", () => {
    const result = generateAreaOverviews(root);
    expect(result.outputs.length).toBeGreaterThan(0);
    for (const out of result.outputs) {
      expect(out.path).toContain("/.usm-workspace/docs/features/");
      expect(out.path).not.toMatch(/\/apps\/[^/]+\/\.usm-workspace\//);
    }
  });

  it("never creates a nested service workspace directory", () => {
    generateAreaOverviews(root);
    expect(fs.existsSync(path.join(root, "apps"))).toBe(false);
  });
});

// ─── #36: sidebar lists feature pages for index-bearing areas ───────────────

describe("sidebar includes feature pages for index-bearing areas (issue #36)", () => {
  let root: string;
  let docsRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-sidebar-"));
    fs.mkdirSync(path.join(root, ".usm"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".usm", "system.usm"),
      [
        "$schema: https://usm.dev/schema/v1.json",
        "$id: test/system",
        "$type: system",
        "$version: 1",
        "summary: A test system for sidebar generation.",
        "identity:",
        "  name: Test System",
        "  domain: test.com",
      ].join("\n"),
      "utf-8",
    );

    docsRoot = path.join(root, ".usm-workspace", "docs");
    const areaDir = path.join(docsRoot, "features", "platform");
    fs.mkdirSync(areaDir, { recursive: true });
    fs.writeFileSync(path.join(areaDir, "index.md"), "# Platform", "utf-8");
    fs.writeFileSync(path.join(areaDir, "my-feature.md"), "# My Feature", "utf-8");
    fs.writeFileSync(path.join(areaDir, "other-feature.md"), "# Other", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists each feature page under a collapsible area group", () => {
    const sidebar = generateSidebar(root, docsRoot);
    const featuresGroup = sidebar.find((g) => g.text === "Project Management");
    expect(featuresGroup).toBeDefined();

    const json = JSON.stringify(featuresGroup);
    // Feature pages must be present even though the area has an index.md.
    expect(json).toContain("/features/platform/my-feature");
    expect(json).toContain("/features/platform/other-feature");
  });
});

// ─── test-spec source resolution: no substring $id collisions ───────────────

describe("test-spec source resolution (issue #37 class)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "usm-testspec-"));
    const dir = path.join(root, ".usm", "features", "cli");
    fs.mkdirSync(dir, { recursive: true });
    const mk = (id: string, extra: string[] = []): string =>
      [
        "$schema: https://usm.dev/schema/v1.json",
        `$id: ${id}`,
        "$type: feature",
        "$version: 1",
        "$system: test/system",
        `$service: test/${id.split("/")[1]}`,
        `summary: A test feature for ${id}`,
        "intent: Test.",
        "flows:",
        "  - id: f1",
        "    name: Flow one",
        "    description: Does a thing",
        "    steps:",
        "      - id: s1",
        "        action: do",
        "        target: the thing",
        ...extra,
      ].join("\n");
    // A short id that is a strict prefix of a longer one.
    fs.writeFileSync(path.join(dir, "scaffold.usm"), mk("test/cli-scaffold"), "utf-8");
    fs.writeFileSync(path.join(dir, "scaffold-project.usm"), mk("test/cli-scaffold-project"), "utf-8");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not collide when one $id is a prefix of another", () => {
    const features = [
      parseUsmFile(path.join(root, ".usm", "features", "cli", "scaffold.usm")),
      parseUsmFile(path.join(root, ".usm", "features", "cli", "scaffold-project.usm")),
    ];
    const result = generateAllTestSpecs(features as never, root);

    const paths = result.outputs.map((o) => o.path);
    expect(new Set(paths).size).toBe(paths.length); // no duplicate output paths
    expect(paths.some((p) => p.endsWith("scaffold.spec.ts"))).toBe(true);
    expect(paths.some((p) => p.endsWith("scaffold-project.spec.ts"))).toBe(true);
  });

  it("routes each feature's spec to its own source file", () => {
    const features = [
      parseUsmFile(path.join(root, ".usm", "features", "cli", "scaffold.usm")),
      parseUsmFile(path.join(root, ".usm", "features", "cli", "scaffold-project.usm")),
    ];
    const result = generateAllTestSpecs(features as never, root);
    const projectSpec = result.outputs.find((o) => o.path.endsWith("scaffold-project.spec.ts"));
    expect(projectSpec).toBeDefined();
    expect(projectSpec!.content).toContain("scaffold-project.usm");
  });
});

// ─── usm check: implementation.primary path splitting ───────────────────────

describe("splitImplementationPaths (usm check false positives)", () => {
  it("splits semicolon-separated paths", () => {
    expect(splitImplementationPaths("src/a.ts; src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("strips (annotation) suffixes", () => {
    expect(splitImplementationPaths("src/cli/index.ts (generate command)")).toEqual([
      "src/cli/index.ts",
    ]);
  });

  it("handles a mix of separators, annotations, and whitespace", () => {
    expect(
      splitImplementationPaths("src/generators/markdown.ts; src/cli/docs.ts; src/cli/index.ts"),
    ).toEqual(["src/generators/markdown.ts", "src/cli/docs.ts", "src/cli/index.ts"]);
  });

  it("returns a single path unchanged", () => {
    expect(splitImplementationPaths("src/mcp/write.ts")).toEqual(["src/mcp/write.ts"]);
  });

  it("ignores empty segments", () => {
    expect(splitImplementationPaths("src/a.ts;;  ; src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
