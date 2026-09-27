import fs from "node:fs";
import path from "node:path";

import { formatConfigErrors, validateConfigObject } from "./validateConfig.js";

/**
 * Default output paths (relative to project root).
 * Used when usmconfig.json is missing or outputs section is absent.
 */
const DEFAULT_OUTPUTS = {
  workspace: ".usm-workspace",
  docs: ".usm-workspace/docs",
  help_docs: ".usm-workspace/help-docs",
  archimate: ".usm-workspace/archimate",
  togaf: ".usm-workspace/togaf",
  openapi: ".usm-workspace/openapi",
  tests: ".usm-workspace/tests",
  usm_source: ".usm",
  agents_md: "AGENTS.md",
};

export type OutputPaths = typeof DEFAULT_OUTPUTS;

/**
 * Read output paths from usmconfig.json, merged with defaults.
 * Falls back to defaults if config is missing or outputs section is absent.
 * Throws on an INVALID config (unknown/malformed keys) — silent fallback is
 * exactly the failure mode this check exists to kill (issue #43): a config
 * can look like it directs output somewhere it does not.
 *
 * @param root — project root directory
 * @returns object with all output paths (relative to root)
 */
export function getOutputPaths(root: string): OutputPaths {
  const configPath = path.join(root, "usmconfig.json");
  if (fs.existsSync(configPath)) {
    // Parse errors surface verbatim (no silent catch)…
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `usmconfig.json is not valid JSON: ${configPath}\n  ${(err as Error).message}`,
        { cause: err },
      );
    }
    // …and the whole file must validate against the packaged schema.
    const { valid, errors } = validateConfigObject(config);
    if (!valid) {
      throw new Error(formatConfigErrors(configPath, errors).join("\n"));
    }
    const outputs = (config.outputs || {}) as Record<string, string>;
    return { ...DEFAULT_OUTPUTS, ...outputs };
  }
  return { ...DEFAULT_OUTPUTS };
}

/**
 * Resolve an output path to an absolute path.
 *
 * @param root — project root directory
 * @param outputType — key from OutputPaths (e.g. "docs", "togaf")
 * @returns absolute path
 */
export function resolveOutputPath(root: string, outputType: keyof OutputPaths): string {
  const paths = getOutputPaths(root);
  return path.resolve(root, paths[outputType]);
}
