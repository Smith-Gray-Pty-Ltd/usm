/**
 * Config validation — usmconfig.json must validate against the packaged
 * usmconfig-v1.json schema (issue #43).
 *
 * Previously the output-path loader spread `outputs` with no key checking and
 * a silent catch fallback to defaults: a config could name invented keys
 * (agent_context, api_docs, design_docs, diagrams — all real-world cases from
 * the safekeys repo) and every artifact silently landed in .usm-workspace/
 * defaults. Namespace confusion with the .usm spec schema (agent_context IS a
 * spec-schema field) made this look right. Now: unknown/malformed keys are
 * hard errors with actionable messages, and `usm validate --config` exposes
 * the same rule set for CI.
 */
import fs from "node:fs";
import path from "node:path";

import Ajv from "ajv";
import addFormats from "ajv-formats";

/** Rename hints: key → modern config key, or null when no equivalent exists. */
const KNOWN_HINTS: Record<string, string | null> = {
  api_docs: "openapi",
  agent_context: null, // system.usm field, not a config key — no rename
  design_docs: null, // no equivalent output exists
  diagrams: null, // Mermaid diagrams are embedded in docs pages; no standalone output
};

/** The nine supported outputs.* keys, in schema order. */
const SUPPORTED_OUTPUT_KEYS = [
  "workspace",
  "docs",
  "help_docs",
  "archimate",
  "togaf",
  "openapi",
  "tests",
  "usm_source",
  "agents_md",
];

export interface ConfigValidationError {
  /** JSON-path-ish location, e.g. "outputs.api_docs". */
  path: string;
  message: string;
  /** Suggested fix, when one is known. */
  hint?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
}

let _ajv: Ajv | null = null;
let _compiled: ReturnType<Ajv["compile"]> | null = null;

function getAjv(): Ajv {
  if (!_ajv) {
    _ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(_ajv);
  }
  return _ajv;
}

function loadSchema(): object {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "schema", "usmconfig-v1.json"), "utf-8"),
  );
}

/**
 * Compiled validator, cached — compiling the same $id twice on one Ajv
 * instance throws "schema already exists" (bit the first multi-reader run).
 */
function getValidator(): ReturnType<Ajv["compile"]> {
  if (!_compiled) {
    _compiled = getAjv().compile(loadSchema());
  }
  return _compiled;
}

function hintFor(key: string): string | undefined {
  const h = KNOWN_HINTS[key];
  if (h === undefined) return undefined;
  if (h === null) {
    return (
      `'${key}' has no equivalent config output ` +
      `(note: agent_context IS a valid system.usm field — the spec schema is unrelated to config keys)`
    );
  }
  return `rename '${key}' to '${h}'`;
}

/**
 * Validate a parsed usmconfig.json object against the packaged schema.
 * Collects ALL violations; adds rename/closest-provision hints for known
 * invented keys.
 */
export function validateConfigObject(config: unknown): ConfigValidationResult {
  const validate = getValidator();
  const valid = validate(config) as boolean;
  if (valid) return { valid: true, errors: [] };

  const errors: ConfigValidationError[] = [];
  for (const err of validate.errors ?? []) {
    const badKey =
      err.keyword === "additionalProperties"
        ? String((err.params as { additionalProperty?: string }).additionalProperty ?? "")
        : undefined;

    if (err.keyword === "additionalProperties" && badKey) {
      const section = err.instancePath.replace(/^\//, "").replace(/\//g, ".") || "(root)";
      const base: ConfigValidationError = {
        path: `${section}.${badKey}`,
        message: `unknown key '${badKey}' — not part of usmconfig-v1`,
      };
      const hint = hintFor(badKey);
      if (hint !== undefined) base.hint = hint;
      errors.push(base);
    } else {
      const where = err.instancePath.replace(/^\//, "").replace(/\//g, ".") || "(root)";
      errors.push({ path: where, message: `${err.message ?? "schema violation"} (${err.keyword})` });
    }
  }
  return { valid: false, errors };
}

/** Render validation errors as the canonical console text (one block per run). */
export function formatConfigErrors(configPath: string, errors: ConfigValidationError[]): string[] {
  const lines: string[] = [`Invalid usmconfig.json: ${configPath}`];
  for (const e of errors) {
    lines.push(`  ${e.path}: ${e.message}`);
    if (e.hint) lines.push(`    → ${e.hint}`);
  }
  lines.push(`  supported outputs keys: ${SUPPORTED_OUTPUT_KEYS.join(", ")}`);
  return lines;
}

/**
 * Validate a usmconfig.json file on disk (used by `usm validate --config`).
 * Returns the parse error verbatim when the file is not valid JSON.
 */
export function validateConfigFile(
  configPath: string,
): ConfigValidationResult & { parseError?: string } {
  if (!fs.existsSync(configPath)) {
    return { valid: false, errors: [], parseError: `file not found: ${configPath}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    return { valid: false, errors: [], parseError: (err as Error).message };
  }
  return validateConfigObject(parsed);
}