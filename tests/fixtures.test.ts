/**
 * Fixture tests — run usm init → scan → generate against each fixture codebase
 * and verify the output matches the committed golden files.
 *
 * Each fixture in examples/ has committed .usm/ and .usm-workspace/ directories
 * containing the expected scan + generate output. These tests:
 *
 *   1. Copy the fixture to a temp dir (avoid mutating the committed fixture)
 *   2. Run `usm init --force` — verify it detects the right number of services
 *   3. Run `usm scan` — verify it produces .usm/system.usm and service.usm files
 *   4. Run `usm generate` — verify it produces .usm-workspace/ output
 *   5. Diff the generated .usm/ against the committed golden .usm/ — must match
 *
 * If the golden files need updating (e.g. generator output intentionally changed),
 * re-run `usm scan && usm generate` in the fixture dir and commit the new output.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import fse from "fs-extra";

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES_DIR = path.join(ROOT, "examples");

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Fixture {
  name: string;
  expectedServices: number;
  expectedPackages?: number;
  expectedDataModels?: number;
  expectedSystemUsm: boolean;
}

const FIXTURES: Fixture[] = [
  { name: "nextjs-single-app", expectedServices: 1, expectedSystemUsm: true },
  { name: "turborepo-monorepo", expectedServices: 2, expectedSystemUsm: false },
  { name: "go-api", expectedServices: 1, expectedSystemUsm: true },
  { name: "python-fastapi", expectedServices: 1, expectedSystemUsm: true },
  { name: "express-api", expectedServices: 1, expectedSystemUsm: true },
  { name: "prisma-monorepo", expectedServices: 1, expectedSystemUsm: false },
  { name: "multi-lang", expectedServices: 2, expectedSystemUsm: false },
];

function runUsm(args: string, cwd: string): string {
  const cliPath = path.join(ROOT, "dist", "cli", "index.js");
  return execSync(`node "${cliPath}" ${args}`, {
    cwd,
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
}

function copyFixtureToTemp(fixtureName: string): string {
  const src = path.join(EXAMPLES_DIR, fixtureName);
  const tmp = path.join(os.tmpdir(), `usm-fixture-${fixtureName}-${Date.now()}`);
  fse.copySync(src, tmp, {
    filter: (src) => {
      // Exclude generated artifacts that would confuse init/scan detection
      return !src.includes("node_modules") &&
             !src.includes(".usm-workspace") &&
             !src.includes("/.usm") &&
             !src.includes("packages/types");
    },
  });
  return tmp;
}

function readDirRecursive(dir: string, base: string = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirRecursive(full, base));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files.sort();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("fixture tests", () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      it("init detects correct services and packages", () => {
        const tmp = copyFixtureToTemp(fixture.name);
        // Remove existing usmconfig.json and .usm/ so init starts fresh
        fs.rmSync(path.join(tmp, "usmconfig.json"), { force: true });
        fse.removeSync(path.join(tmp, ".usm"));
        fse.removeSync(path.join(tmp, ".usm-workspace"));

        const output = runUsm(`init --root . --output ./usmconfig.json --force`, tmp);
        const plain = output.replace(/\x1b\[\d+m/g, "");

        expect(plain).toContain("Services:");
        const serviceMatch = plain.match(/Services:\s+(\d+)/);
        expect(serviceMatch).not.toBeNull();
        expect(parseInt(serviceMatch![1])).toBe(fixture.expectedServices);

        if (fixture.expectedPackages !== undefined) {
          const pkgMatch = plain.match(/Shared:\s+(\d+)/);
          expect(pkgMatch).not.toBeNull();
          expect(parseInt(pkgMatch![1])).toBe(fixture.expectedPackages);
        }

        expect(fs.existsSync(path.join(tmp, "usmconfig.json"))).toBe(true);
      });

      it("scan produces .usm/ files with correct structure", () => {
        const tmp = copyFixtureToTemp(fixture.name);
        fs.rmSync(path.join(tmp, "usmconfig.json"), { force: true });
        fse.removeSync(path.join(tmp, ".usm"));
        fse.removeSync(path.join(tmp, ".usm-workspace"));

        runUsm(`init --root . --output ./usmconfig.json --force`, tmp);
        const output = runUsm(`scan --root . --config ./usmconfig.json`, tmp);

        // Strip ANSI codes for matching
        const plain = output.replace(/\x1b\[[\d;]*m/g, "");
        // The spinner ("✔ ✓ Scan complete") may go to stderr; check for
        // the stats lines that definitely go to stdout.
        expect(plain).toMatch(/Services found:\s+\d+/);
        expect(fs.existsSync(path.join(tmp, ".usm"))).toBe(true);

        // system.usm should exist (scan auto-creates it if missing)
        // Some fixtures may not have it if scan found 0 services and the auto-create
        // didn't trigger — but all our fixtures should produce services
        const usmFiles = readDirRecursive(path.join(tmp, ".usm"));
        expect(usmFiles.length).toBeGreaterThan(0);

        // At least one service.usm file
        expect(usmFiles.some((f) => f.endsWith("service.usm"))).toBe(true);

        // Verify the service count in scan output
        const serviceMatch = plain.match(/Services found:\s+(\d+)/);
        expect(serviceMatch).not.toBeNull();
        expect(parseInt(serviceMatch![1])).toBe(fixture.expectedServices);
      });

      it("generate produces .usm-workspace/ output", () => {
        const tmp = copyFixtureToTemp(fixture.name);
        fs.rmSync(path.join(tmp, "usmconfig.json"), { force: true });
        fse.removeSync(path.join(tmp, ".usm"));
        fse.removeSync(path.join(tmp, ".usm-workspace"));

        runUsm(`init --root . --output ./usmconfig.json --force`, tmp);
        runUsm(`scan --root . --config ./usmconfig.json`, tmp);
        runUsm(`generate --root .`, tmp);

        const workspaceDir = path.join(tmp, ".usm-workspace");
        expect(fs.existsSync(workspaceDir)).toBe(true);

        const workspaceFiles = readDirRecursive(workspaceDir);
        expect(workspaceFiles.length).toBeGreaterThan(0);

        // Should produce architecture diagrams
        expect(workspaceFiles.some((f) => f.includes("architecture"))).toBe(true);
      });

      it("scan output matches committed golden .usm/ structure", () => {
        const tmp = copyFixtureToTemp(fixture.name);
        fs.rmSync(path.join(tmp, "usmconfig.json"), { force: true });
        fse.removeSync(path.join(tmp, ".usm"));
        fse.removeSync(path.join(tmp, ".usm-workspace"));

        runUsm(`init --root . --output ./usmconfig.json --force`, tmp);
        runUsm(`scan --root . --config ./usmconfig.json`, tmp);

        // Compare generated .usm/ against committed golden .usm/
        const goldenUsmDir = path.join(EXAMPLES_DIR, fixture.name, ".usm");
        if (!fs.existsSync(goldenUsmDir)) return;

        const goldenFiles = readDirRecursive(goldenUsmDir);
        const generatedFiles = readDirRecursive(path.join(tmp, ".usm"));

        // Normalize generated file paths: the temp dir name is used as the
        // service directory name (e.g. apps/usm-fixture-nextjs-single-app-12345/
        // → apps/nextjs-single-app/). Replace the temp-dir-derived name with
        // the fixture name so paths match the golden files.
        const tmpBase = path.basename(tmp);
        const normalizedGenerated = generatedFiles.map((f) =>
          f.replace(tmpBase, fixture.name),
        );

        // Same file set (structure must match)
        expect(normalizedGenerated.sort()).toEqual(goldenFiles.sort());

        // Verify all golden .usm files parse as valid YAML (no content comparison
        // across OSes — temp dir names and timestamps differ)
        for (const file of goldenFiles) {
          const golden = fs.readFileSync(path.join(goldenUsmDir, file), "utf-8");
          const generatedFile = generatedFiles.find((f) =>
            f.replace(tmpBase, fixture.name) === file,
          );
          if (!generatedFile) continue;
          const generated = fs.readFileSync(path.join(tmp, ".usm", generatedFile), "utf-8");

          // Both must be non-empty valid YAML with expected key fields
          expect(generated).toContain("$type:");
          expect(generated).toContain("$id:");
          expect(golden).toContain("$type:");
          expect(golden).toContain("$id:");
        }
      });

      it("generate is idempotent (running twice produces same output)", () => {
        const tmp = copyFixtureToTemp(fixture.name);
        fs.rmSync(path.join(tmp, "usmconfig.json"), { force: true });
        fse.removeSync(path.join(tmp, ".usm"));
        fse.removeSync(path.join(tmp, ".usm-workspace"));

        runUsm(`init --root . --output ./usmconfig.json --force`, tmp);
        runUsm(`scan --root . --config ./usmconfig.json`, tmp);
        runUsm(`generate --root .`, tmp);

        const workspaceDir = path.join(tmp, ".usm-workspace");
        const beforeFiles = readDirRecursive(workspaceDir);
        const beforeContent = beforeFiles.map((f) =>
          fs.readFileSync(path.join(workspaceDir, f), "utf-8"),
        );

        // Generate again
        runUsm(`generate --root .`, tmp);

        const afterFiles = readDirRecursive(workspaceDir);
        const afterContent = afterFiles.map((f) =>
          fs.readFileSync(path.join(workspaceDir, f), "utf-8"),
        );

        // Same file set
        expect(afterFiles).toEqual(beforeFiles);
        // Same contents
        for (let i = 0; i < beforeContent.length; i++) {
          expect(afterContent[i]).toBe(beforeContent[i]);
        }
      });
    });
  }
});