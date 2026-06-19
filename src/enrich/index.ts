// Main enricher — Fill in TODO: describe placeholders in .usm files using an LLM
//
// Flow:
//   1. Read .usm file → parse YAML
//   2. Identify TODO vs populated fields
//   3. Build context from source code references
//   4. Call LLM to generate enriched YAML
//   5. Validate against schema
//   6. Smart-merge with original (preserves hand-written content)
//   7. Write back (or show result in dry-run mode)
//   8. Return EnrichmentResult

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { EnrichmentConfig, EnrichmentResult, EnrichOptions } from "./types.js";
import { createLlmClient } from "./llm.js";
import { buildEnrichmentContext } from "./context.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompts.js";
import { validateUsm } from "../validate.js";
import { isDefaultContent } from "../scan/merge.js";
import { smartMerge } from "../scan/merge.js";
import { yamlStringify } from "../scan/utils.js";
import { findUsmFiles } from "../parse.js";

const TODO_PATTERN = "TODO: describe";
const TODO_INTENT = "TODO: describe why this feature exists";

/**
 * Enrich a single .usm file — fill in TODO: describe placeholders using an LLM.
 */
export async function enrichFile(
  filePath: string,
  config: EnrichmentConfig,
  options?: EnrichOptions
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const absolutePath = path.resolve(filePath);

  // 1. Read and parse the .usm file
  if (!fs.existsSync(absolutePath)) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: [],
      fields_skipped: [],
      duration_ms: Date.now() - startTime,
      error: `File not found: ${absolutePath}`,
    };
  }

  const originalYaml = fs.readFileSync(absolutePath, "utf-8");
  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.load(originalYaml) as Record<string, unknown>;
  } catch (err) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: [],
      fields_skipped: [],
      duration_ms: Date.now() - startTime,
      error: `Failed to parse YAML: ${(err as Error).message}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: [],
      fields_skipped: [],
      duration_ms: Date.now() - startTime,
      error: "File is not a valid YAML object",
    };
  }

  // 2. Identify TODO vs populated fields
  const targetFields = options?.fields || config.fields;
  const todoFields: string[] = [];
  const populatedFields: string[] = [];
  const skippedFields: string[] = [];

  for (const key of Object.keys(parsed)) {
    if (!targetFields.includes(key as "summary" | "intent" | "decisions" | "flows" | "contracts" | "tests")) {
      continue;
    }
    const value = parsed[key];
    if (typeof value === "string" && (value.startsWith(TODO_PATTERN) || value.startsWith(TODO_INTENT))) {
      todoFields.push(key);
    } else if (isDefaultContent(value)) {
      todoFields.push(key);
    } else {
      populatedFields.push(key);
    }
  }

  // No TODO fields to fill — return early
  if (todoFields.length === 0) {
    return {
      file: filePath,
      success: true,
      fields_filled: [],
      fields_preserved: populatedFields,
      fields_skipped: [],
      duration_ms: Date.now() - startTime,
    };
  }

  // 3. Build context
  const rootDir = path.dirname(absolutePath);
  const resolvedRootDir = findMonorepoRoot(rootDir);

  const context = await buildEnrichmentContext(absolutePath, resolvedRootDir, config);
  context.todoFields = todoFields;
  context.populatedFields = populatedFields;

  // 4. In dry-run mode, show prompt and don't write or call the LLM
  if (options?.dryRun) {
    const prompt = buildUserPrompt(context, targetFields as string[]);
    console.log("\n=== DRY RUN: Would enrich the following fields ===");
    console.log(`  File: ${filePath}`);
    console.log(`  TODO fields: ${todoFields.join(", ")}`);
    console.log(`  Populated fields: ${populatedFields.join(", ")}`);
    console.log(`  Source files: ${Object.keys(context.sourceFiles).length}`);
    console.log(`\n=== PROMPT (first 500 chars) ===`);
    console.log(prompt.substring(0, 500) + "...(truncated)");
    console.log(`\n=== Full prompt length: ${prompt.length} chars ===`);

    return {
      file: filePath,
      success: true,
      fields_filled: [],
      fields_preserved: populatedFields,
      fields_skipped: todoFields,
      duration_ms: Date.now() - startTime,
    };
  }

  // 5. Call the LLM
  const llmClient = createLlmClient(config);
  const prompt = buildUserPrompt(context, targetFields as string[]);

  let llmResponse;
  try {
    llmResponse = await llmClient.complete(prompt, {
      model: options?.model || config.model,
      temperature: config.temperature,
      maxTokens: config.max_tokens_per_file,
      systemPrompt: SYSTEM_PROMPT,
    });
  } catch (err) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: populatedFields,
      fields_skipped: todoFields,
      duration_ms: Date.now() - startTime,
      error: `LLM call failed: ${(err as Error).message}`,
    };
  }

  // 6. Parse and validate the LLM response
  let enriched: Record<string, unknown>;
  let responseText = llmResponse.content;

  // Strip any markdown fencing (```yaml ... ```)
  responseText = responseText
    .replace(/^```yaml\s*\n?/i, "")
    .replace(/^```\s*\n?/i, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  try {
    enriched = yaml.load(responseText) as Record<string, unknown>;
  } catch (err) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: populatedFields,
      fields_skipped: todoFields,
      duration_ms: Date.now() - startTime,
      tokens_used: llmResponse.tokensUsed,
      error: `Failed to parse LLM response as YAML: ${(err as Error).message}\n\nRaw response:\n${responseText.substring(0, 200)}`,
    };
  }

  if (!enriched || typeof enriched !== "object" || Array.isArray(enriched)) {
    return {
      file: filePath,
      success: false,
      fields_filled: [],
      fields_preserved: populatedFields,
      fields_skipped: todoFields,
      duration_ms: Date.now() - startTime,
      tokens_used: llmResponse.tokensUsed,
      error: "LLM response is not a valid YAML object",
    };
  }

  // 7. Validate against schema (warn but don't block)
  const validation = validateUsm(enriched as unknown as import("../types.js").UsmFile);
  if (!validation.valid) {
    console.warn(
      `⚠ Schema validation warning for enriched content: ${validation.errors?.map(e => `${e.path}: ${e.message}`).join("; ")}`
    );
  }

  // 8. Smart-merge with original (preserves hand-written content)
  const mergeResult = smartMerge(originalYaml, enriched);

  // 9. Write back
  const mergedYaml = yamlStringify(mergeResult.merged);
  fs.writeFileSync(absolutePath, mergedYaml, "utf-8");

  // Calculate which fields were actually filled
  const mergedObj = mergeResult.merged;
  const fieldsFilled: string[] = [];
  const fieldsPreserved: string[] = [];

  for (const key of todoFields) {
    const newValue = mergedObj[key];
    if (typeof newValue === "string" && !newValue.startsWith(TODO_PATTERN) && !newValue.startsWith(TODO_INTENT)) {
      fieldsFilled.push(key);
    } else if (Array.isArray(newValue) && newValue.length > 0) {
      // Was empty array (TODO), now has content
      fieldsFilled.push(key);
    } else if (typeof newValue === "string" && newValue.trim() !== "") {
      fieldsFilled.push(key);
    } else {
      // Still TODO or empty — LLM didn't fill it
      skippedFields.push(key);
    }
  }

  for (const key of populatedFields) {
    if (mergeResult.preservedKeys.includes(key)) {
      fieldsPreserved.push(key);
    }
  }

  return {
    file: filePath,
    success: true,
    fields_filled: fieldsFilled,
    fields_preserved: fieldsPreserved,
    fields_skipped: skippedFields,
    tokens_used: llmResponse.tokensUsed,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Enrich all .usm files in a directory that have TODO: describe placeholders.
 */
export async function enrichDirectory(
  dirPath: string,
  config: EnrichmentConfig,
  options?: EnrichOptions
): Promise<EnrichmentResult[]> {
  const absoluteDir = path.resolve(dirPath);
  const files = findUsmFiles(absoluteDir);
  const results: EnrichmentResult[] = [];

  for (const file of files) {
    // Check if file has TODOs before calling the LLM
    const content = fs.readFileSync(file, "utf-8");
    if (!content.includes(TODO_PATTERN) && !content.includes(TODO_INTENT)) {
      // No TODOs — skip this file
      continue;
    }

    const result = await enrichFile(file, config, options);
    results.push(result);
  }

  return results;
}

/**
 * Find the monorepo root by walking up from a .usm file to find usmconfig.json.
 */
function findMonorepoRoot(startDir: string): string {
  let current = startDir;
  // Walk up at most 5 levels
  for (let i = 0; i < 5; i++) {
    const configPath = path.join(current, "usmconfig.json");
    if (fs.existsSync(configPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  // Fallback: use the starting directory
  return startDir;
}
