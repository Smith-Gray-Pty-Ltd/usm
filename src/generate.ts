import { generateMarkdown } from "./generators/markdown.js";
import type { UsmFile, GenerationResult } from "./types.js";

export type Generator = "markdown";

/**
 * Run generators on a parsed .usm file.
 * Returns an array of { path, content } pairs representing files to write.
 *
 * @param sourceFilePath — absolute path to the .usm source file (used to derive
 *   output folder hierarchy for features). If omitted, the slug is derived from
 *   the $id field instead (legacy flat behaviour).
 */
export function generate(
  file: UsmFile,
  generators: Generator[] = ["markdown"],
  monorepoRoot?: string,
  sourceFilePath?: string
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const gen of generators) {
    switch (gen) {
      case "markdown": {
        const result = generateMarkdown(file, monorepoRoot, sourceFilePath);
        outputs.push(...result.outputs);
        break;
      }
      default:
        throw new Error(`Unknown generator: ${gen}`);
    }
  }

  return { outputs };
}
