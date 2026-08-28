import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildSourceMap,
  renderFileTreeBlocks,
  renderCoverageMatrixBlocks,
  renderOrphanReportBlocks,
} from "../src/generators/sourceMapping.js";
import type { ServiceUsm, FeatureUsm } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function mkdtemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "usm-source-map-test-"));
}

function writeFile(dir: string, relPath: string, content = ""): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

beforeEach(() => {
  tmpDir = mkdtemp();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeService(overrides: Partial<ServiceUsm> = {}): ServiceUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/cli",
    $type: "service",
    $version: 1,
    $system: "test/system",
    summary: "Test service",
    type: "api",
    runtime: "node",
    paths: ["src/cli"],
    modules: [
      { name: "commander", purpose: "CLI routing", paths: ["src/cli/index.ts"] },
      { name: "utils", purpose: "Shared utilities", paths: ["src/cli/utils"] },
    ],
    ...overrides,
  };
}

function makeFeature(overrides: Partial<FeatureUsm> = {}): FeatureUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/feat-one",
    $type: "feature",
    $version: 1,
    $system: "test/system",
    $service: "test/cli",
    summary: "A test feature",
    intent: "For testing",
    implementation: { primary: "src/cli/index.ts" },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("buildSourceMap", () => {
  it("maps files to services and modules", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/helpers.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);

    expect(map.files.length).toBe(2);
    expect(map.services.length).toBe(1);
    expect(map.services[0].id).toBe("test/cli");
  });

  it("maps files to features by implementation.primary", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature({
      implementation: { primary: "src/cli/index.ts" },
    })];
    const map = buildSourceMap(services, features, tmpDir);

    const file = map.files.find((f) => f.path === "src/cli/index.ts");
    expect(file?.feature).toBe("test/feat-one");
    expect(file?.featureSummary).toBe("A test feature");
  });

  it("identifies orphan files (no governing feature spec)", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/orphan.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature({
      implementation: { primary: "src/cli/index.ts" },
    })];
    const map = buildSourceMap(services, features, tmpDir);

    expect(map.files.length).toBe(2);
    expect(map.orphans.length).toBe(1);
    expect(map.orphans[0].path).toBe("src/cli/utils/orphan.ts");
  });

  it("excludes node_modules from the file walk", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "node_modules/some-pkg/index.js", "export {}");

    const services = [makeService()];
    const features: FeatureUsm[] = [];
    const map = buildSourceMap(services, features, tmpDir);

    expect(map.files.some((f) => f.path.includes("node_modules"))).toBe(false);
    expect(map.orphans.some((f) => f.path.includes("node_modules"))).toBe(false);
  });

  it("excludes dist, .git, .next, build, coverage from the file walk", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "dist/cli/index.js", "export {}");
    writeFile(tmpDir, ".git/config", "");
    writeFile(tmpDir, ".next/cache.json", "");
    writeFile(tmpDir, "build/output.js", "");
    writeFile(tmpDir, "coverage/report.json", "");

    const services = [makeService()];
    const features: FeatureUsm[] = [];
    const map = buildSourceMap(services, features, tmpDir);

    const paths = map.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("dist/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".git/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".next/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("build/"))).toBe(false);
    expect(paths.some((p) => p.startsWith("coverage/"))).toBe(false);
  });

  it("handles semicolon-separated implementation.primary", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/helpers.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature({
      implementation: { primary: "src/cli/index.ts; src/cli/utils/helpers.ts" },
    })];
    const map = buildSourceMap(services, features, tmpDir);

    expect(map.orphans.length).toBe(0);
    expect(map.files.every((f) => f.feature === "test/feat-one")).toBe(true);
  });

  it("matches routes by file_path", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "app/page.tsx", "export {}");

    const services = [makeService({ paths: ["src/cli", "app"] })];
    const features = [makeFeature({
      implementation: { primary: "src/cli/index.ts" },
      routes: [{ path: "/", type: "page" as const, file_path: "app/page.tsx" }],
    })];
    const map = buildSourceMap(services, features, tmpDir);

    const routeFile = map.files.find((f) => f.path === "app/page.tsx");
    expect(routeFile?.feature).toBe("test/feat-one");
    expect(routeFile?.isRoute).toBe(true);
  });
});

// ─── View renderer tests ────────────────────────────────────────────────────────

describe("renderFileTreeBlocks", () => {
  it("renders a directory tree grouped by service and module", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/helpers.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderFileTreeBlocks(map);

    // Should have headings for service and modules
    const headings = blocks.filter((b) => b.type === "heading");
    expect(headings.some((h) => h.text === "cli")).toBe(true);
    expect(headings.some((h) => h.text === "commander")).toBe(true);
    expect(headings.some((h) => h.text === "utils")).toBe(true);

    // Should have tables with file names and features
    const tables = blocks.filter((b) => b.type === "table");
    expect(tables.length).toBeGreaterThan(0);
    const allRows = tables.flatMap((t) => t.rows || []);
    expect(allRows.some((r) => r[0].includes("index.ts"))).toBe(true);
    expect(allRows.some((r) => r[0].includes("helpers.ts"))).toBe(true);
  });

  it("files with implementation.primary show their owning feature", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderFileTreeBlocks(map);

    const tables = blocks.filter((b) => b.type === "table");
    const allRows = tables.flatMap((t) => t.rows || []);
    expect(allRows.some((r) => r[1].includes("test/feat-one"))).toBe(true);
  });
});

describe("renderCoverageMatrixBlocks", () => {
  it("renders a table with file, module, owning feature, spec status columns", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/orphan.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderCoverageMatrixBlocks(map);

    const table = blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    expect(table?.headers).toEqual(["File", "Module", "Owning Feature", "Spec Status"]);

    const rows = table?.rows || [];
    expect(rows.some((r) => r[3] === "specced")).toBe(true);
    expect(rows.some((r) => r[3] === "orphan")).toBe(true);
  });

  it("includes a summary paragraph with counts", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderCoverageMatrixBlocks(map);

    const para = blocks.find((b) => b.type === "paragraph");
    expect(para?.text).toContain("files mapped");
    expect(para?.text).toContain("services");
  });
});

describe("renderOrphanReportBlocks", () => {
  it("lists only unspecced files, not specced ones", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");
    writeFile(tmpDir, "src/cli/utils/orphan.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderOrphanReportBlocks(map);

    const tables = blocks.filter((b) => b.type === "table");
    const allRows = tables.flatMap((t) => t.rows || []);
    expect(allRows.some((r) => r[0].includes("orphan.ts"))).toBe(true);
    expect(allRows.some((r) => r[0].includes("index.ts"))).toBe(false);
  });

  it("shows a tip callout when there are no orphans", () => {
    writeFile(tmpDir, "src/cli/index.ts", "export {}");

    const services = [makeService()];
    const features = [makeFeature()];
    const map = buildSourceMap(services, features, tmpDir);
    const blocks = renderOrphanReportBlocks(map);

    const callout = blocks.find((b) => b.type === "callout");
    expect(callout?.variant).toBe("tip");
    expect(callout?.text).toContain("No orphan files");
  });
});