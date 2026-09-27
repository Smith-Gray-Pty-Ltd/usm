/**
 * Upgrade alignment tests (issue #46).
 *
 * --apply used to exit 0 and change nothing when all capabilities were
 * already configured: recommendedMissing empty → applied empty →
 * bumpVersion skipped → usm_version absent forever → --check exits 1
 * "stale" immediately after. A repo that adopted capabilities before
 * usm_version existed had no path from "0.0.0 (stale)" to "aligned".
 * Contracts in usm/upgrade: version-bumped-on-completion.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { applyUpgrade, detectUpgrade, getInstalledVersion } from "../src/scan/upgrade.js";
import type { SystemUsm } from "../src/types.js";

let dir: string;
let systemPath: string;

function baseSystem(): Partial<SystemUsm> {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "t/system",
    $type: "system",
    $version: 1,
    identity: { name: "t", domain: "test" },
    summary: "t",
    index: [],
    services: [],
    // feedback configured — the "already aligned on capabilities" case
    feedback: { policy: "human-gate" },
  } as Partial<SystemUsm>;
}

function readSystem(): SystemUsm {
  return yaml.load(fs.readFileSync(systemPath, "utf-8")) as SystemUsm;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-upgrade-"));
  systemPath = path.join(dir, "system.usm");
  fs.writeFileSync(systemPath, yaml.dump(baseSystem(), { indent: 2, lineWidth: 100 }), "utf-8");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("applyUpgrade version bump (issue #46)", () => {
  it("stamps usm_version even when nothing is left to set up (already-aligned case)", async () => {
    const result = await applyUpgrade(systemPath, [], false);
    expect(result.failed).toEqual([]);
    expect(result.versionBumped).toBe(true);
    const sys = readSystem();
    expect(sys.usm_version).toBe(getInstalledVersion());
  });

  it("unknown explicit target is a failure — no silent success, no stamp", async () => {
    // Asking for a capability that doesn't exist (or is already configured)
    // is a usage error: report it as failed, leave usm_version untouched.
    const result = await applyUpgrade(systemPath, ["no-such-capability"], false);
    expect(result.applied).toEqual([]);
    expect(result.failed.some((f) => f.id === "no-such-capability")).toBe(true);
    expect(result.versionBumped).toBe(false);
    const sys = readSystem();
    expect(sys.usm_version).toBeUndefined();
  });

  it("reports the alignment in detectUpgrade after stamping", async () => {
    await applyUpgrade(systemPath, [], false);
    const report = detectUpgrade(readSystem());
    expect(report.stale).toBe(false);
    expect(report.projectVersion).toBe(getInstalledVersion());
  });
});

describe("detectUpgrade never-aligned semantics (issue #46, docs-facing)", () => {
  it("treats absent usm_version as 0.0.0 (stale)", () => {
    const report = detectUpgrade(readSystem());
    expect(report.projectVersion).toBe("0.0.0");
    expect(report.stale).toBe(true);
  });

  it("treats a stamped usm_version as aligned when it matches the install", () => {
    const sys = { ...baseSystem(), usm_version: getInstalledVersion() } as SystemUsm;
    const report = detectUpgrade(sys);
    expect(report.stale).toBe(false);
  });
});