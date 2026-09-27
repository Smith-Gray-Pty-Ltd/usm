/**
 * generate --check untracked-skip tests (issue #42).
 *
 * --check used to treat every missing output as stale — on a fresh clone with
 * gitignored build output (.usm-workspace/) the gate could never pass
 * (142 outputs missing, CI red forever). Now: missing + untracked → skipped
 * (reported, not failed); missing + tracked → hard fail (real gap);
 * content drift on tracked files → fail. Contracts in usm/cli-generate:
 * generate-from-source-only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

let dir: string;
let usmCli: string;

function writeSystem(summary: string): void {
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
      `summary: ${summary}`,
      "index: []",
      "services: []",
    ].join("\n") + "\n",
    "utf-8",
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-check-"));
  usmCli = path.resolve("dist/cli/index.js");
  fs.mkdirSync(path.join(dir, ".usm"), { recursive: true });
  writeSystem("t");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".usm-workspace/\nnode_modules/\n");
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: dir });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function runCheck() {
  return spawnSync("node", [usmCli, "generate", "--check"], { cwd: dir, encoding: "utf8" });
}

describe("generate --check untracked-skip (issue #42)", () => {
  it("fresh clone (outputs gitignored, never generated) passes with skips reported", () => {
    // simulate fresh clone: no .usm-workspace on disk
    fs.rmSync(path.join(dir, ".usm-workspace"), { recursive: true, force: true });
    const r = runCheck();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("absent and untracked");
    expect(r.stdout).not.toContain("(missing)");
  });

  it("missing tracked output still fails (real gap)", () => {
    // Generate outputs, commit them (tracked), then delete from disk WITHOUT
    // staging the deletion — the file stays in HEAD/index, so git ls-files
    // still lists it: missing + tracked = hard fail.
    execSync(`node "${usmCli}" generate`, { cwd: dir, encoding: "utf8", stdio: "ignore" });
    const agentsMd = path.join(dir, "AGENTS.md");
    expect(fs.existsSync(agentsMd)).toBe(true);
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm outputs", { cwd: dir });
    fs.rmSync(agentsMd);
    const r = runCheck();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("(missing)");
  });

  it("content drift on a tracked output fails (the actual drift gate)", () => {
    execSync(`node "${usmCli}" generate`, { cwd: dir, encoding: "utf8", stdio: "ignore" });
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm outputs", { cwd: dir });
    // Edit a spec without regenerating → real drift
    writeSystem("t changed");
    const r = runCheck();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("(out of date)");
  });
});