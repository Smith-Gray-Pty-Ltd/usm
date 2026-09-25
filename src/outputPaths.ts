import fs from "node:fs";
import path from "node:path";

import type { OutputPaths } from "./outputs.js";

/**
 * Resolve the configured output directory for an output type
 * (usmconfig.json → outputs section, defaults per src/outputs.ts).
 */
export function outDir(root: string, outputType: keyof OutputPaths): string {
  return path.join(root, getPaths(root)[outputType]);
}

/**
 * Resolve a file path inside a configured output directory.
 * `rest` may be a literal or a template string (already interpolated).
 */
export function outPath(root: string, outputType: keyof OutputPaths, rest: string): string {
  return path.join(outDir(root, outputType), rest);
}

function getPaths(root: string): OutputPaths {
  try {
    const configPath = path.join(root, "usmconfig.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const outputs = (config.outputs || {}) as Record<string, string>;
      return { ...DEFAULTS, ...outputs } as OutputPaths;
    }
  } catch {
    // fall back to defaults
  }
  return { ...DEFAULTS };
}

const DEFAULTS = {
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