// usm upgrade — detect stale projects and guide capability adoption.
//
// Compares the installed USM version against system.usm.version, walks the
// capability registry, and reports / applies missing capabilities. Bumps the
// project version on completion.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { SystemUsm } from "../types.js";
import { validateUsm } from "../validate.js";
import { CAPABILITIES, type Capability } from "./capabilities.js";

// ─── Version helpers ─────────────────────────────────────────────────────────

/**
 * Read the installed USM version from this package's package.json.
 * Resolved relative to the compiled module (dist/scan/upgrade.js → package.json).
 */
export function getInstalledVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Compare two semver-ish strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, 1 if a > b. Malformed parts are treated as 0.
 *
 * Kept dependency-free — USM versions are simple M.m.p.
 */
export function compareVersions(a: string, b: string): number {
  const pa = (a || "0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = (b || "0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * Read the project's USM-alignment version from system.usm.usm_version
 * (absent → "0.0.0"). This is NOT the project's own `version` field — that
 * tracks the consuming project's release and must not be overwritten by upgrade.
 */
export function getProjectVersion(system: SystemUsm | null): string {
  return system?.usm_version ?? "0.0.0";
}

// ─── Detection ───────────────────────────────────────────────────────────────

export interface CapabilityStatus {
  capability: Capability;
  configured: boolean;
  /** True if introduced after the project's current version (genuinely "new"). */
  isNew: boolean;
}

export interface UpgradeReport {
  installedVersion: string;
  projectVersion: string;
  stale: boolean;
  /** Capabilities not yet configured. */
  missing: CapabilityStatus[];
  /** Capabilities already configured. */
  configured: CapabilityStatus[];
  /** Missing capabilities that are recommended. */
  recommendedMissing: CapabilityStatus[];
}

/**
 * Build an upgrade report for a system: version status + per-capability state.
 */
export function detectUpgrade(system: SystemUsm | null): UpgradeReport {
  const installed = getInstalledVersion();
  const project = getProjectVersion(system);
  const stale = compareVersions(project, installed) < 0;

  const statuses: CapabilityStatus[] = CAPABILITIES.map((capability) => ({
    capability,
    configured: system ? capability.detect(system) : false,
    isNew: compareVersions(capability.introducedIn, project) > 0,
  }));

  const missing = statuses.filter((s) => !s.configured);
  const configured = statuses.filter((s) => s.configured);
  const recommendedMissing = missing.filter((s) => s.capability.recommended);

  return {
    installedVersion: installed,
    projectVersion: project,
    stale,
    missing,
    configured,
    recommendedMissing,
  };
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export interface UpgradeApplyResult {
  applied: Array<{ id: string; message: string }>;
  failed: Array<{ id: string; message: string }>;
  versionBumped: boolean;
  systemPath: string;
}

/**
 * Read a system.usm file, returning the parsed object or null.
 */
function readSystemUsm(systemPath: string): SystemUsm | null {
  if (!fs.existsSync(systemPath)) return null;
  try {
    return yaml.load(fs.readFileSync(systemPath, "utf-8")) as SystemUsm;
  } catch {
    return null;
  }
}

/**
 * Bump system.usm.usm_version to the installed version. Validates before writing.
 * Writes the USM-alignment field (NOT the project's own `version`).
 */
function bumpVersion(systemPath: string, installed: string): boolean {
  const system = readSystemUsm(systemPath);
  if (!system) return false;

  system.usm_version = installed;
  system.$last_updated = new Date().toISOString().split("T")[0];

  const validation = validateUsm(system);
  if (!validation.valid) return false;

  const yamlContent = yaml.dump(system, { indent: 2, lineWidth: 100, noRefs: true, quotingType: '"' });
  const tmp = systemPath + ".tmp";
  fs.writeFileSync(tmp, yamlContent, "utf-8");
  fs.renameSync(tmp, systemPath);
  return true;
}

/**
 * Apply a set of capabilities to a system.usm file.
 *
 * For each target capability that is not yet configured, calls its setup().
 * After successful setup, bumps system.usm.version to the installed version.
 *
 * @param systemPath    path to system.usm
 * @param targets       capability ids to set up (empty = all recommended missing)
 * @param interactive   whether setup may prompt (TTY); false for --apply
 */
export async function applyUpgrade(
  systemPath: string,
  targets: string[],
  interactive: boolean,
): Promise<UpgradeApplyResult> {
  const system = readSystemUsm(systemPath);
  const report = detectUpgrade(system);
  const installed = report.installedVersion;

  // Resolve which capabilities to set up
  let toApply: CapabilityStatus[];
  if (targets.length > 0) {
    toApply = report.missing.filter((s) => targets.includes(s.capability.id));
  } else {
    toApply = report.recommendedMissing;
  }

  const applied: Array<{ id: string; message: string }> = [];
  const failed: Array<{ id: string; message: string }> = [];

  for (const status of toApply) {
    const result = await status.capability.setup(systemPath, { interactive });
    if (result.applied) {
      applied.push({ id: status.capability.id, message: result.message });
    } else {
      failed.push({ id: status.capability.id, message: result.message });
    }
  }

  // Bump version if anything was applied
  let versionBumped = false;
  if (applied.length > 0) {
    versionBumped = bumpVersion(systemPath, installed);
  }

  return { applied, failed, versionBumped, systemPath };
}
