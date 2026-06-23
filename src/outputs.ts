import fs from "node:fs";
import path from "node:path";

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
 *
 * @param root — project root directory
 * @returns object with all output paths (relative to root)
 */
export function getOutputPaths(root: string): OutputPaths {
  try {
    const configPath = path.join(root, "usmconfig.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const outputs = (config.outputs || {}) as Record<string, string>;
      return { ...DEFAULT_OUTPUTS, ...outputs };
    }
  } catch {
    // Fall back to defaults
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
