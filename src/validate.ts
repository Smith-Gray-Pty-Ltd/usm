   
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ValidationResult, UsmFile } from "./types.js";

// Lazy-loaded schema — avoids fs at import time
let _ajv: Ajv | null = null;
let _schema: object | null = null;

function getAjv(): Ajv {
  if (!_ajv) {
    _ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(_ajv);
  }
  return _ajv;
}

function getSchema(): object {
  if (!_schema) {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const schemaPath = path.resolve(__dirname, "../schema/v1.json");
    const raw = fs.readFileSync(schemaPath, "utf-8");
    _schema = JSON.parse(raw);
  }
  return _schema!;
}

/**
 * Validate a parsed .usm object against the v1 JSON Schema.
 */
export function validateUsm(file: UsmFile): ValidationResult {
  const ajv = getAjv();
  const schema = getSchema();

  const validate = ajv.compile(schema);
  const valid = validate(file);

  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors || []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message || "Unknown validation error",
  }));

  return { valid: false, errors };
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
