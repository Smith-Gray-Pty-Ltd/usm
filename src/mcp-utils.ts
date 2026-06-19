import path from "node:path";
import fs from "node:fs";
import { findAllUsmFiles, findAllUsmDirs } from "./parse.js";

/** Resolve a path relative to the monorepo root (process.cwd()). */
export function resolvePath(input: string): string {
  if (path.isAbsolute(input)) return input;
  return path.resolve(process.cwd(), input);
}

/** Default .usm directory relative to monorepo root. */
export function defaultUsmDir(): string {
  return path.resolve(process.cwd(), ".usm");
}

/**
 * Find all .usm files across all .usm/ directories in the monorepo.
 * This is the primary way MCP tools should discover .usm files.
 */
export function allUsmFilesInMonorepo(): string[] {
  const root = process.cwd();
  return findAllUsmFiles(root);
}

/**
 * Find all .usm/ directories across the monorepo.
 */
export function allUsmDirsInMonorepo(): string[] {
  const root = process.cwd();
  return findAllUsmDirs(root);
}

/** Read a file, returning null if it doesn't exist. */
export function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Format a reference found in a .usm file for the references tool. */
export interface ReferenceHit {
  path: string;
  id: string;
  type: string;
  context: string;
}

/** Check if a string value contains a reference to the target ID. */
export function stringContainsRef(value: string, targetId: string): boolean {
  return value.includes(targetId);
}

/** Recursively walk an object, finding fields that reference targetId. */
export function findRefsInObj(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  targetId: string,
  parentKey: string = "",
): string[] {
  const contexts: string[] = [];
  if (obj == null || typeof obj !== "object") {
    if (typeof obj === "string" && stringContainsRef(obj, targetId)) {
      contexts.push(parentKey);
    }
    return contexts;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      contexts.push(...findRefsInObj(obj[i], targetId, `${parentKey}[${i}]`));
    }
  } else {
    for (const key of Object.keys(obj)) {
      contexts.push(...findRefsInObj(obj[key], targetId, parentKey ? `${parentKey}.${key}` : key));
    }
  }
  return contexts;
}
