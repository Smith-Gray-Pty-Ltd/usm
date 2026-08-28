import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DETECTORS,
  registerDetector,
  getDetectors,
  loadDetectorFiles,
  validateDetector,
  detectFramework,
  extractRoutesViaDetector,
  resolveDetectors,
  type Detector,
} from "../src/scan/detectors.js";
import { scanStructural } from "../src/scan/structural.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function mkdtemp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "usm-detector-test-"));
  return d;
}

function writeFixture(dir: string, relPath: string, content: string): void {
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

// ─── Registry tests ───────────────────────────────────────────────────────────

describe("detector registry", () => {
  it("registers and retrieves detectors", () => {
    registerDetector({
      $id: "test-zig",
      kind: "service",
      language: "zig",
      runtime: "zig",
      manifest: "**/build.zig.zon",
    });
    const d = getDetectors("service").find((x) => x.$id === "test-zig");
    expect(d).toBeDefined();
    expect(d?.language).toBe("zig");
  });

  it("overrides a detector with the same $id (override semantics)", () => {
    registerDetector({ $id: "override-me", kind: "service", language: "a", runtime: "a" });
    registerDetector({ $id: "override-me", kind: "service", language: "b", runtime: "b" });
    const d = getDetectors("service").find((x) => x.$id === "override-me");
    expect(d?.language).toBe("b");
  });
});

// ─── Validation tests (detector-file-format contract) ─────────────────────────

describe("validateDetector", () => {
  it("accepts a valid service detector", () => {
    const errors = validateDetector({
      $id: "zig",
      kind: "service",
      language: "zig",
      runtime: "zig",
      manifest: "**/build.zig.zon",
      frameworks: [{ name: "zap", detect: "zap" }],
    });
    expect(errors).toEqual([]);
  });

  it("rejects missing $id", () => {
    const errors = validateDetector({ kind: "service" });
    expect(errors.some((e) => e.includes("$id"))).toBe(true);
  });

  it("rejects missing kind", () => {
    const errors = validateDetector({ $id: "x" });
    expect(errors.some((e) => e.includes("kind"))).toBe(true);
  });

  it("rejects invalid kind", () => {
    const errors = validateDetector({ $id: "x", kind: "banana" });
    expect(errors.some((e) => e.includes("kind must be one of"))).toBe(true);
  });

  it("rejects routes with both patterns and script (mutually exclusive)", () => {
    const errors = validateDetector({
      $id: "x",
      kind: "routes",
      routes: {
        extensions: [".ts"],
        patterns: [{ regex: "x", pathGroup: 1 }],
        script: "./detectors/x.ts",
      },
    });
    expect(errors.some((e) => e.includes("mutually exclusive"))).toBe(true);
  });

  it("rejects routes with neither patterns nor script", () => {
    const errors = validateDetector({
      $id: "x",
      kind: "routes",
      routes: { extensions: [".ts"] },
    });
    expect(errors.some((e) => e.includes("either patterns or script"))).toBe(true);
  });

  it("rejects framework rule missing name", () => {
    const errors = validateDetector({
      $id: "x",
      kind: "service",
      frameworks: [{ detect: "foo" }],
    });
    expect(errors.some((e) => e.includes("frameworks[0].name"))).toBe(true);
  });
});

// ─── Loader tests ─────────────────────────────────────────────────────────────

describe("loadDetectorFiles", () => {
  it("loads a valid detector file from .usm/detectors/", () => {
    const usmDir = path.join(tmpDir, ".usm");
    writeFixture(usmDir, "detectors/zig.yaml", [
      "$id: zig",
      "kind: service",
      "language: zig",
      "runtime: zig",
      'manifest: "**/build.zig.zon"',
      "frameworks:",
      "  - name: zap",
      "    detect: zap",
    ].join("\n"));

    const result = loadDetectorFiles(usmDir);
    expect(result.loaded).toContain("zig");
    expect(result.failed).toEqual([]);
  });

  it("skips an invalid detector file with a warning, not an abort (invalid-detector-file-skipped test)", () => {
    const usmDir = path.join(tmpDir, ".usm");
    // Missing $id — invalid
    writeFixture(usmDir, "detectors/bad.yaml", "kind: service\nlanguage: x\n");
    // A valid one too — should still load
    writeFixture(usmDir, "detectors/good.yaml", [
      "$id: good",
      "kind: service",
      "language: go",
      "runtime: go",
    ].join("\n"));

    const result = loadDetectorFiles(usmDir);
    expect(result.loaded).toContain("good");
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].file).toBe("bad.yaml");
    expect(result.failed[0].errors.some((e) => e.includes("$id"))).toBe(true);
  });

  it("returns empty when .usm/detectors/ does not exist", () => {
    const result = loadDetectorFiles(path.join(tmpDir, ".usm"));
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});

// ─── detectFramework tests ───────────────────────────────────────────────────

describe("detectFramework", () => {
  it("returns the first matching framework", () => {
    const detector: Detector = {
      $id: "ts",
      kind: "service",
      frameworks: [
        { name: "express", detect: '"express"' },
        { name: "nextjs", detect: '"next"' },
      ],
    };
    expect(detectFramework('{"express": "1.0"}', detector)).toBe("express");
    expect(detectFramework('{"next": "14.0"}', detector)).toBe("nextjs");
  });

  it("returns null when no framework matches", () => {
    const detector: Detector = {
      $id: "ts",
      kind: "service",
      frameworks: [{ name: "express", detect: '"express"' }],
    };
    expect(detectFramework('{"lodash": "1.0"}', detector)).toBeNull();
  });

  it("returns null when detector has no frameworks[]", () => {
    const detector: Detector = { $id: "ts", kind: "service" };
    expect(detectFramework("anything", detector)).toBeNull();
  });
});

// ─── extractRoutesViaDetector tests (declarative + script) ───────────────────

describe("extractRoutesViaDetector", () => {
  it("extracts routes via declarative regex patterns", async () => {
    // Write an Express-like source file
    writeFixture(tmpDir, "src/app.ts", [
      "const app = express();",
      'app.get("/health", () => "ok");',
      'app.post("/users", createUser);',
    ].join("\n"));

    const detector: Detector = {
      $id: "express",
      kind: "service",
      routes: {
        extensions: [".ts"],
        patterns: [
          { regex: "app\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
        ],
      },
    };

    const routes = await extractRoutesViaDetector(path.join(tmpDir, "src"), detector);
    expect(routes.length).toBe(2);
    expect(routes.some((r) => r.method === "GET" && r.path === "/health")).toBe(true);
    expect(routes.some((r) => r.method === "POST" && r.path === "/users")).toBe(true);
  });

  it("deduplicates routes with the same method + path", async () => {
    writeFixture(tmpDir, "src/app.ts", [
      'app.get("/dup", a);',
      'app.get("/dup", b);',
    ].join("\n"));

    const detector: Detector = {
      $id: "x",
      kind: "service",
      routes: {
        extensions: [".ts"],
        patterns: [
          { regex: "app\\.(get)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
        ],
      },
    };

    const routes = await extractRoutesViaDetector(path.join(tmpDir, "src"), detector);
    expect(routes.length).toBe(1);
  });

  it("uses the script escape hatch when routes.script is set", async () => {
    // Write a script that exports extractRoutes
    writeFixture(tmpDir, "detectors/nextjs.ts", [
      "export function extractRoutes(sourceDir, framework) {",
      "  return [{ method: 'GET', path: '/from-script', file: 'fake.ts' }];",
      "}",
    ].join("\n"));

    const detector: Detector = {
      $id: "nextjs",
      kind: "service",
      routes: {
        script: "./detectors/nextjs.ts",
      },
    };

    const routes = await extractRoutesViaDetector(tmpDir, detector);
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/from-script");
  });

  it("returns [] when the detector has no routes config", async () => {
    const detector: Detector = { $id: "x", kind: "service" };
    const routes = await extractRoutesViaDetector(tmpDir, detector);
    expect(routes).toEqual([]);
  });
});

// ─── resolveDetectors (precedence) tests ──────────────────────────────────────

describe("resolveDetectors", () => {
  it("seeds built-in detectors when no files and no config detection exist", () => {
    const result = resolveDetectors(path.join(tmpDir, ".usm"));
    // Built-ins should be present
    const ids = DETECTORS.map((d) => d.$id);
    expect(ids).toContain("typescript");
    expect(ids).toContain("go");
    expect(ids).toContain("prisma");
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("usmconfig.json detection overrides a detector file by $id (config-overrides-detector-file test)", () => {
    // Write a detector file declaring go framework gin
    const usmDir = path.join(tmpDir, ".usm");
    writeFixture(usmDir, "detectors/go.yaml", [
      "$id: go",
      "kind: service",
      "language: go",
      "runtime: go",
      'manifest: "**/go.mod"',
      "frameworks:",
      "  - name: gin",
      "    detect: gin-gonic/gin",
    ].join("\n"));

    // Config detection overrides go to detect 'echo'
    resolveDetectors(usmDir, {
      manifests: [
        {
          id: "go",
          pattern: "**/go.mod",
          language: "go",
          runtime: "go",
          frameworks: [{ name: "echo", detect: "labstack/echo" }],
        },
      ],
    });

    const goDetector = DETECTORS.find((d) => d.$id === "go");
    expect(goDetector).toBeDefined();
    expect(goDetector?.frameworks?.[0].name).toBe("echo");
  });

  it("detector file overrides built-in by $id", () => {
    const usmDir = path.join(tmpDir, ".usm");
    writeFixture(usmDir, "detectors/go.yaml", [
      "$id: go",
      "kind: service",
      "language: go",
      "runtime: go",
      'manifest: "**/go.mod"',
      "frameworks:",
      "  - name: custom-go-fw",
      "    detect: custom-marker",
    ].join("\n"));

    resolveDetectors(usmDir);
    const goDetector = DETECTORS.find((d) => d.$id === "go");
    expect(goDetector?.frameworks?.[0].name).toBe("custom-go-fw");
  });
});

// ─── Backward compatibility ───────────────────────────────────────────────────

describe("backward compatibility (no detectors dir, no detection config)", () => {
  it("produces the same built-in detector set as a fresh resolve", () => {
    // Simulate a project with no .usm/detectors/ and no detection config
    resolveDetectors(path.join(tmpDir, ".usm"));
    const before = DETECTORS.map((d) => `${d.$id}:${d.kind}`).sort();

    // Resolve again (idempotent — should produce the same set)
    resolveDetectors(path.join(tmpDir, ".usm"));
    const after = DETECTORS.map((d) => `${d.$id}:${d.kind}`).sort();

    expect(after).toEqual(before);
  });

  it("built-in detectors cover the 12 languages from the original spec", () => {
    resolveDetectors(path.join(tmpDir, ".usm"));
    const serviceDetectors = getDetectors("service");
    const languages = new Set(serviceDetectors.map((d) => d.language).filter(Boolean));
    // The original multi-lang spec promised 12 languages; built-ins should
    // cover at least: typescript, python, go, rust, java, kotlin, csharp,
    // ruby, php, elixir, swift, scala, cpp
    for (const lang of ["typescript", "python", "go", "rust", "java", "kotlin", "csharp", "ruby", "php", "elixir", "swift", "scala", "cpp"]) {
      expect(languages.has(lang)).toBe(true);
    }
  });
});

// ─── Orchestrator-generalized contract (no-package-json-service-detected) ─────

describe("orchestrator-generalized — non-JS service detected without package.json", () => {
  it("detects a Go service with go.mod and no package.json (no warning)", async () => {
    // Build a minimal Go fixture repo
    writeFixture(tmpDir, "apps/go-api/go.mod", "module example.com/go-api\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.0\n");
    writeFixture(tmpDir, "usmconfig.json", JSON.stringify({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "test-project",
      sources: { root: ".", include: ["apps/*"], exclude: ["**/node_modules/**"] },
      services: [{ match: "apps/*", kind: "api-server" }],
    }));
    // .usm/ dir (no detectors/ subdir — uses built-ins only)
    fs.mkdirSync(path.join(tmpDir, ".usm"), { recursive: true });

    const result = await scanStructural({
      root: tmpDir,
      configPath: path.join(tmpDir, "usmconfig.json"),
      force: false,
      routesOnly: false,
      mergeStrategy: "overwrite",
    });

    // A service.usm should have been written for the Go app
    const servicePath = path.join(tmpDir, ".usm", "apps", "go-api", "service.usm");
    expect(result.files_written.some((f) => f.path === ".usm/apps/go-api/service.usm")).toBe(true);
    expect(fs.existsSync(servicePath)).toBe(true);

    // No "No package.json found" warning (the old hardcode behaviour)
    expect(result.warnings?.some((w) => w.includes("No package.json"))).toBe(false);

    // The generated service.usm should carry the Go runtime and gin framework
    const content = fs.readFileSync(servicePath, "utf-8");
    expect(content).toContain("runtime: go");
    expect(content).toContain("framework: gin");
    expect(content).toContain("language: go");
  });

  it("detects a Zig service via a .usm/detectors/zig.yaml file (no package.json)", async () => {
    // Write a Zig detector file
    const usmDir = path.join(tmpDir, ".usm");
    writeFixture(usmDir, "detectors/zig.yaml", [
      "$id: zig",
      "kind: service",
      "language: zig",
      "runtime: zig",
      'manifest: "**/build.zig.zon"',
      "frameworks:",
      "  - name: zap",
      "    detect: zap",
    ].join("\n"));

    // Build a minimal Zig fixture repo
    writeFixture(tmpDir, "apps/zig-api/build.zig.zon", ".\n. = { .name = \"zig-api\", .dependencies = .{ .zap = .{} } }\n");
    writeFixture(tmpDir, "usmconfig.json", JSON.stringify({
      $schema: "https://usm.dev/schema/usmconfig-v1.json",
      version: "1",
      name: "test-project",
      sources: { root: ".", include: ["apps/*"], exclude: ["**/node_modules/**"] },
      services: [{ match: "apps/*", kind: "api-server" }],
    }));

    const result = await scanStructural({
      root: tmpDir,
      configPath: path.join(tmpDir, "usmconfig.json"),
      force: false,
      routesOnly: false,
      mergeStrategy: "overwrite",
    });

    const servicePath = path.join(tmpDir, ".usm", "apps", "zig-api", "service.usm");
    expect(result.files_written.some((f) => f.path === ".usm/apps/zig-api/service.usm")).toBe(true);
    expect(fs.existsSync(servicePath)).toBe(true);

    const content = fs.readFileSync(servicePath, "utf-8");
    expect(content).toContain("runtime: zig");
    expect(content).toContain("framework: zap");
    expect(content).toContain("language: zig");
  });
});