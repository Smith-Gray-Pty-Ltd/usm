   
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ValidationResult, UsmFile } from "./types.js";

// Lazy-loaded schema — avoids fs at import time
let _ajv: Ajv | null = null;
let _schema: object | null = null;
// Cache key = schema file mtime+size. Long-running processes (MCP servers
// serve for days) must not validate against a schema snapshot from before
// an upgrade — previously _schema was cached forever, so tools kept
// rejecting new-schema fields until the server was manually restarted.
let _schemaCacheKey: string | null = null;

function getAjv(): Ajv {
  if (!_ajv) {
    _ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(_ajv);
  }
  return _ajv;
}

function getSchema(): object {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const schemaPath = path.resolve(__dirname, "../schema/v1.json");
  const stat = fs.statSync(schemaPath);
  const cacheKey = `${stat.mtimeMs}:${stat.size}`;
  if (!_schema || _schemaCacheKey !== cacheKey) {
    const raw = fs.readFileSync(schemaPath, "utf-8");
    _schema = JSON.parse(raw);
    _schemaCacheKey = cacheKey;
  }
  return _schema!;
}

/**
 * The current schema version that this version of USM supports.
 * .usm files with a different $version will get a warning.
 */
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Validate a parsed .usm object against the v1 JSON Schema.
 * Uses $type as a discriminator to select the correct oneOf branch —
 * without this, AJV tries ALL branches (system, service, feature, feedback)
 * and reports errors from the wrong schemas (e.g. "must have property
 * identity" when validating a feature). With the discriminator, only the
 * matching branch is validated.
 */
export function validateUsm(file: UsmFile): ValidationResult {
  const ajv = getAjv();
  const schema = getSchema();

  // Select the matching oneOf branch by $type — avoids cross-schema noise
  const defs = (schema as Record<string, unknown>).$defs as Record<string, Record<string, unknown>>;
  const typeToDef: Record<string, string> = {
    system: "systemFile",
    service: "serviceFile",
    feature: "featureFile",
    data: "dataFile",
    feedback: "feedbackFile",
  };
  const defName = typeToDef[file.$type];
  if (!defName) {
    return {
      valid: false,
      errors: [{ path: "/$type", message: `Unknown $type: '${file.$type}'. Must be one of: ${Object.keys(typeToDef).join(", ")}.` }],
    };
  }

  const branchSchema = defs[defName];
  if (!branchSchema) {
    return {
      valid: false,
      errors: [{ path: "/$type", message: `Internal error: schema branch '${defName}' not found.` }],
    };
  }

  // Inject the full $defs into the branch so $ref: "#/$defs/..." references
  // resolve correctly when ajv compiles the branch in isolation.
  const branchWithDefs = {
    ...branchSchema,
    $defs: defs,
  };

  const validate = ajv.compile(branchWithDefs);
  const valid = validate(file);

  if (!valid) {
    const errors = (validate.errors || []).map((err) => ({
      path: err.instancePath || "/",
      message: err.message || "Unknown validation error",
    }));
    return { valid: false, errors };
  }

  // Schema validation passed — check $version compatibility
  const warnings: Array<{ path: string; message: string }> = [];

  if (file.$version !== undefined && file.$version !== CURRENT_SCHEMA_VERSION) {
    warnings.push({
      path: "/$version",
      message: `File has $version ${file.$version} but this USM supports $version ${CURRENT_SCHEMA_VERSION}. The file may use features not yet supported, or may be missing new features.`,
    });
  }

  // ── Actor reference check (usm/gen-user-docs) ────────────────────────────
  // Flows live on feature files; personas are declared in system.usm. A
  // single-file validate cannot see across files, so the actor-vs-persona
  // check runs in the CLI generate pass (hard error on typo'd persona).
  // `usm validate` stays single-file; RESERVED_ACTORS is exported for that
  // cross-file walker (collectUnknownActors).
  void RESERVED_ACTORS;

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/** Reserved actor names that never reference a persona. */
export const RESERVED_ACTORS: ReadonlySet<string> = new Set(["system", "agent"]);

/**
 * Walk flows[] collecting actor values that resolve to neither a declared
 * persona nor a reserved word. Step-level actor overrides the flow-level
 * default; a flow with no actor at all is a pipeline (no checks needed).
 */
export function collectUnknownActors(
  file: Record<string, unknown>,
  personaIds: Set<string>,
  reserved: ReadonlySet<string>,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const flows = (file.flows as Array<Record<string, unknown>> | undefined) || [];
  for (const flow of flows) {
    const flowId = (flow.id as string) || "?";
    const flowActor = flow.actor as string | undefined;
    const steps = (flow.steps as Array<Record<string, unknown>> | undefined) || [];
    for (const step of steps) {
      const actor = (step.actor as string | undefined) ?? flowActor;
      if (!actor || personaIds.has(actor) || reserved.has(actor)) continue;
      errors.push({
        path: `/flows/${flowId}/steps/${(step.id as string) || "?"}/actor`,
        message: `actor '${actor}' is not a declared persona (declared: ${[...personaIds].join(", ") || "none"}) or reserved word (system, agent)`,
      });
    }
  }
  return errors;
}

/**
 * Validate a YAML string against the v1 JSON Schema.
 */
export function validateUsmString(content: string): ValidationResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseUsm } = require("./parse.js") as typeof import("./parse.js");
  try {
    const file = parseUsm(content);
    return validateUsm(file);
  } catch (err) {
    return {
      valid: false,
      errors: [{ path: "/", message: `Parse error: ${(err as Error).message}` }],
    };
  }
}

/**
 * Validate a .usm file from disk.
 */
export function validateUsmFile(filePath: string): ValidationResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const content = fs.readFileSync(filePath, "utf-8");
  return validateUsmString(content);
}
