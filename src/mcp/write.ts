import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseUsmFile, isFeatureFile, findAllUsmFiles } from "../parse.js";
import { validateUsm, validateUsmString } from "../validate.js";
import { generateMarkdown } from "../generators/markdown.js";
import { resolvePath, readFileOrNull, allUsmFilesInMonorepo } from "../mcp-utils.js";
import type { FeatureUsm } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find a .usm file by its $id across the monorepo.
 */
function findFeatureById(id: string): string | null {
  const files = allUsmFilesInMonorepo();
  for (const filePath of files) {
    try {
      const parsed = parseUsmFile(filePath);
      if (parsed.$id === id && isFeatureFile(parsed)) {
        return filePath;
      }
    } catch {
      // Skip unparseable files
    }
  }
  return null;
}

/**
 * Write a file atomically (write to temp, then rename).
 */
function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Feature fields whose values are arrays of objects keyed by `id`.
 * These merge by id on update (upsert) instead of being replaced wholesale —
 * a partial array passed with add-intent must never silently drop the
 * entries that weren't mentioned (issue #14).
 */
const ID_BEARING_ARRAY_FIELDS = ["contracts", "flows", "tests", "decisions"];

interface MergeStats {
  mode: "upsert-by-id" | "replaced" | "set";
  added: number;
  updated: number;
  preserved: number;
}

/**
 * Merge an incoming array into an existing one by `id`.
 * - Items whose `id` matches an existing entry replace that entry (update).
 * - Items without a matching `id` (or without an `id`) are appended.
 * - Existing entries not mentioned in the incoming array are preserved.
 */
function upsertById(existing: unknown[], incoming: unknown[]): { merged: unknown[]; stats: MergeStats } {
  const merged = [...existing];
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const itemId = item && typeof item === "object" && "id" in item ? (item as { id: unknown }).id : undefined;
    const idx =
      itemId !== undefined
        ? merged.findIndex(
            (e) => e && typeof e === "object" && "id" in e && (e as { id: unknown }).id === itemId,
          )
        : -1;
    if (idx >= 0) {
      merged[idx] = item;
      updated++;
    } else {
      merged.push(item);
      added++;
    }
  }
  return { merged, stats: { mode: "upsert-by-id", added, updated, preserved: existing.length - updated } };
}

/**
 * Validate status transitions.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  "planned": ["in-progress"],
  "in-progress": ["built"],
  "built": ["deprecated"],
  "deprecated": [],
};

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Serialize a feature object to YAML.
 */
function featureToYaml(feature: FeatureUsm): string {
  const today = new Date().toISOString().split("T")[0];
  if (!feature.$last_updated) {
    feature.$last_updated = today;
  }
  return yaml.dump(feature, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
  });
}

// ─── Tool 1: usm_draft_feature ──────────────────────────────────────────────

export const draftFeatureSchema = {
  id: z.string().describe("Feature $id (e.g. 'my-org/auth-login')"),
  system: z.string().describe("System $id this feature belongs to"),
  service: z.string().describe("Service $id this feature belongs to"),
  summary: z.string().describe("1-3 sentence summary of the feature"),
  intent: z.string().describe("Why this feature exists — 1-3 sentences"),
  status: z.enum(["planned", "in-progress", "built", "deprecated"]).optional().describe("Initial status (default: planned)"),
  flows: z.string().optional().describe("JSON array of flow objects (id, name, steps)"),
  contracts: z.string().optional().describe("JSON array of contract objects (id, description, must_have)"),
  tests: z.string().optional().describe("JSON array of test objects (id, setup, expect)"),
  decisions: z.string().optional().describe("JSON array of decision objects (id, decision, rationale)"),
};

export async function draftFeatureTool(args: {
  id: string;
  system: string;
  service: string;
  summary: string;
  intent: string;
  status?: string;
  flows?: string;
  contracts?: string;
  tests?: string;
  decisions?: string;
}) {
  try {
    // Parse optional JSON arrays
    const flows = args.flows ? JSON.parse(args.flows) : [];
    const contracts = args.contracts ? JSON.parse(args.contracts) : [];
    const tests = args.tests ? JSON.parse(args.tests) : [];
    const decisions = args.decisions ? JSON.parse(args.decisions) : [];

    // Construct the feature object
    const feature: FeatureUsm = {
      $schema: "https://usm.dev/schema/v1.json",
      $id: args.id,
      $type: "feature",
      $version: 1,
      $last_updated: new Date().toISOString().split("T")[0],
      summary: args.summary,
      $system: args.system,
      $service: args.service,
      intent: args.intent,
      status: (args.status as "planned" | "in-progress" | "built" | "deprecated") || "planned",
      flows,
      contracts,
      tests,
      decisions,
      implementation: {
        primary: "",
        test_code: "",
        test_code_status: "none",
      },
      see_also: [],
    };

    // Validate against schema
    const validation = validateUsm(feature);

    if (!validation.valid) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            validation_status: "invalid",
            errors: validation.errors,
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Generate YAML
    const yamlContent = featureToYaml(feature);

    // Generate markdown preview
    const mdResult = generateMarkdown(feature, process.cwd());
    const markdown = mdResult.outputs.length > 0 ? mdResult.outputs[0].content : "";

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          validation_status: "valid",
          yaml: yamlContent,
          markdown: markdown,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: `Draft failed: ${(err as Error).message}` }, null, 2),
      }],
      isError: true,
    };
  }
}

// ─── Tool 2: usm_write_feature ──────────────────────────────────────────────

export const writeFeatureSchema = {
  yaml: z.string().describe("YAML content of the feature .usm file"),
  path: z.string().describe("Target file path (relative to monorepo root or absolute)"),
};

export async function writeFeatureTool(args: { yaml: string; path: string }) {
  try {
    // Validate the YAML content first
    const validation = validateUsmString(args.yaml);

    if (!validation.valid) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            written: false,
            errors: validation.errors,
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Write atomically
    const filePath = resolvePath(args.path);
    atomicWrite(filePath, args.yaml);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          written: true,
          path: filePath,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: `Write failed: ${(err as Error).message}` }, null, 2),
      }],
      isError: true,
    };
  }
}

// ─── Tool 3: usm_update_feature ─────────────────────────────────────────────

export const updateFeatureSchema = {
  id: z.string().optional().describe("Feature $id to find (e.g. 'usm/mcp-write')"),
  path: z.string().optional().describe("Direct file path (alternative to id)"),
  fields: z.string().describe('JSON object of fields to update (e.g. {"summary": "new summary", "status": "built"}). Id-bearing arrays (contracts, flows, tests, decisions) are MERGED by id — pass just the new/changed items and existing ones are preserved. Use the replace param to remove items.'),
  replace: z.string().optional().describe('Optional JSON array of field names whose arrays should be REPLACED wholesale instead of merged by id (e.g. ["contracts"]). Required to remove array items — replacement is destructive and drops unmentioned entries.'),
};

export async function updateFeatureTool(args: { id?: string; path?: string; fields: string; replace?: string }) {
  try {
    // Find the feature file
    let filePath: string | null = null;
    if (args.path) {
      filePath = resolvePath(args.path);
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `File not found: ${args.path}` }, null, 2) }],
          isError: true,
        };
      }
    } else if (args.id) {
      filePath = findFeatureById(args.id);
      if (!filePath) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Feature not found: ${args.id}` }, null, 2) }],
          isError: true,
        };
      }
    } else {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide either 'id' or 'path'" }, null, 2) }],
        isError: true,
      };
    }

    // Parse the existing feature
    const feature = parseUsmFile(filePath) as FeatureUsm;
    if (!isFeatureFile(feature)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "File is not a feature .usm file" }, null, 2) }],
        isError: true,
      };
    }

    // Parse the update fields
    const updates = JSON.parse(args.fields) as Record<string, unknown>;

    // Parse the optional replace list (fields whose arrays are replaced
    // wholesale instead of merged by id — required to remove array items)
    let replaceFields: string[] = [];
    if (args.replace !== undefined && args.replace !== "") {
      const parsed = JSON.parse(args.replace) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "'replace' must be a JSON array of field names, e.g. [\"contracts\"]" }, null, 2) }],
          isError: true,
        };
      }
      replaceFields = parsed;
      // Only id-bearing fields are eligible for merge, so only they need replace
      const unknown = replaceFields.filter((f) => !ID_BEARING_ARRAY_FIELDS.includes(f));
      if (unknown.length > 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `'replace' only applies to id-bearing array fields (${ID_BEARING_ARRAY_FIELDS.join(", ")}) — unknown: ${unknown.join(", ")}` }, null, 2) }],
          isError: true,
        };
      }
    }
    const replaceSet = new Set(replaceFields);

    // Immutable fields — cannot be changed via update
    const IMMUTABLE = ["$id", "$type", "$schema"];
    for (const key of IMMUTABLE) {
      if (key in updates) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Field '${key}' is immutable — cannot be changed via update` }, null, 2) }],
          isError: true,
        };
      }
    }

    // Apply updates.
    // Scalars (and non-id-bearing arrays like see_also) are set directly.
    // Id-bearing arrays (contracts, flows, tests, decisions) are MERGED by id
    // by default — items with a matching id update, new items append, and
    // unmentioned entries are preserved. Wholesale replacement (which drops
    // unmentioned entries) requires the explicit `replace` param.
    const fieldsUpdated: string[] = [];
    const mergeDetails: Record<string, MergeStats> = {};
    const target = feature as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (ID_BEARING_ARRAY_FIELDS.includes(key) && Array.isArray(value) && !replaceSet.has(key)) {
        const existing = Array.isArray(target[key]) ? (target[key] as unknown[]) : [];
        const { merged, stats } = upsertById(existing, value);
        target[key] = merged;
        mergeDetails[key] = stats;
      } else {
        if (ID_BEARING_ARRAY_FIELDS.includes(key)) {
          mergeDetails[key] = { mode: "replaced", added: Array.isArray(value) ? value.length : 0, updated: 0, preserved: 0 };
        }
        target[key] = value;
      }
      fieldsUpdated.push(key);
    }

    // Bump $last_updated
    feature.$last_updated = new Date().toISOString().split("T")[0];

    // Validate
    const validation = validateUsm(feature);
    if (!validation.valid) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            updated: false,
            errors: validation.errors,
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Write atomically
    const yamlContent = featureToYaml(feature);
    atomicWrite(filePath, yamlContent);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          updated: true,
          path: filePath,
          fields_updated: fieldsUpdated,
          ...(Object.keys(mergeDetails).length > 0 ? { merge_details: mergeDetails } : {}),
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: `Update failed: ${(err as Error).message}` }, null, 2),
      }],
      isError: true,
    };
  }
}

// ─── Tool 4: usm_update_feature_status ──────────────────────────────────────

export const updateFeatureStatusSchema = {
  id: z.string().optional().describe("Feature $id to find (e.g. 'usm/mcp-write')"),
  path: z.string().optional().describe("Direct file path (alternative to id)"),
  status: z.enum(["planned", "in-progress", "built", "deprecated"]).describe("New status"),
  implementation_path: z.string().optional().describe("Primary implementation file path (e.g. 'src/mcp/write.ts')"),
  test_code: z.string().optional().describe("Test code file path"),
};

export async function updateFeatureStatusTool(args: {
  id?: string;
  path?: string;
  status: "planned" | "in-progress" | "built" | "deprecated";
  implementation_path?: string;
  test_code?: string;
}) {
  try {
    // Find the feature file
    let filePath: string | null = null;
    if (args.path) {
      filePath = resolvePath(args.path);
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `File not found: ${args.path}` }, null, 2) }],
          isError: true,
        };
      }
    } else if (args.id) {
      filePath = findFeatureById(args.id);
      if (!filePath) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Feature not found: ${args.id}` }, null, 2) }],
          isError: true,
        };
      }
    } else {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide either 'id' or 'path'" }, null, 2) }],
        isError: true,
      };
    }

    // Parse the existing feature
    const feature = parseUsmFile(filePath) as FeatureUsm;
    if (!isFeatureFile(feature)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "File is not a feature .usm file" }, null, 2) }],
        isError: true,
      };
    }

    const oldStatus = feature.status || "planned";

    // Check status transition
    if (!isValidTransition(oldStatus, args.status)) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: `Invalid status transition: ${oldStatus} → ${args.status}. Valid transitions: ${oldStatus} → ${(VALID_TRANSITIONS[oldStatus] || []).join(", ") || "none"}`,
            original_file_unchanged: true,
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Apply status update
    feature.status = args.status;

    // Update implementation fields if provided
    if (args.implementation_path) {
      if (!feature.implementation) {
        feature.implementation = { primary: "", test_code: "", test_code_status: "none" };
      }
      feature.implementation.primary = args.implementation_path;
    }
    if (args.test_code) {
      if (!feature.implementation) {
        feature.implementation = { primary: "", test_code: "", test_code_status: "none" };
      }
      feature.implementation.test_code = args.test_code;
      feature.implementation.test_code_status = "manual";
    }

    // Bump $last_updated
    feature.$last_updated = new Date().toISOString().split("T")[0];

    // Validate
    const validation = validateUsm(feature);
    if (!validation.valid) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            updated: false,
            errors: validation.errors,
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Write atomically
    const yamlContent = featureToYaml(feature);
    atomicWrite(filePath, yamlContent);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          updated: true,
          path: filePath,
          old_status: oldStatus,
          new_status: args.status,
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: `Status update failed: ${(err as Error).message}` }, null, 2),
      }],
      isError: true,
    };
  }
}
