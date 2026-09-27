import fs from "node:fs";
import path from "node:path";

import { getOutputPaths, type OutputPaths } from "./outputs.js";

/**
 * Resolve the configured output directory for an output type
 * (usmconfig.json → outputs section, defaults per src/outputs.ts).
 * Delegates to the single validated loader in outputs.ts — issue #43: all
 * config readers must validate; unknown/malformed keys are hard errors.
 */
export function outDir(root: string, outputType: keyof OutputPaths): string {
  return path.join(root, getOutputPaths(root)[outputType]);
}

/**
 * Resolve a file path inside a configured output directory.
 * `rest` may be a literal or a template string (already interpolated).
 */
export function outPath(root: string, outputType: keyof OutputPaths, rest: string): string {
  return path.join(outDir(root, outputType), rest);
}