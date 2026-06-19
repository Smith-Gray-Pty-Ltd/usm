import yaml from "js-yaml";
import fs from "node:fs";
import path from "node:path";
import type { UsmFile, SystemUsm, ServiceUsm, FeatureUsm } from "./types.js";

/**
 * Parse a .usm YAML file into a typed object.
 */
export function parseUsm(content: string): UsmFile {
  const raw = yaml.load(content);
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid .usm file: not a valid YAML object");
  }
  return raw as UsmFile;
}

/**
 * Parse a .usm file from disk.
 */
export function parseUsmFile(filePath: string): UsmFile {
  const absolute = path.resolve(filePath);
  const content = fs.readFileSync(absolute, "utf-8");
  return parseUsm(content);
}

/**
 * Type guard: is this a system file?
 */
export function isSystemFile(file: UsmFile): file is SystemUsm {
  return file.$type === "system";
}

/**
 * Type guard: is this a service file?
 */
export function isServiceFile(file: UsmFile): file is ServiceUsm {
  return file.$type === "service";
}

/**
 * Type guard: is this a feature file?
 */
export function isFeatureFile(file: UsmFile): file is FeatureUsm {
  return file.$type === "feature";
}

/**
 * Find all .usm files in a directory.
 */
export function findUsmFiles(dir: string): string[] {
    
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");
  return glob.sync("**/*.usm", {
    cwd: path.resolve(dir),
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
}

/**
 * Find all .usm files across all .usm/ directories in the monorepo.
 * Scans the root .usm/ plus any .usm/ directories under apps/, packages/,
 * and infrastructure/services/.
 *
 * @param root — monorepo root directory
 */
export function findAllUsmFiles(root: string): string[] {
  const resolvedRoot = path.resolve(root);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");

  // Find all directories named .usm (but not nested inside node_modules or .next)
  const usmDirs = glob.sync("**/.usm", {
    cwd: resolvedRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    onlyDirectories: true,
  });

  // The root .usm/ is already included in the glob results.
  // Now scan each .usm/ directory for .usm files.
  const allFiles: string[] = [];
  for (const dir of usmDirs) {
    const files = glob.sync("**/*.usm", {
      cwd: dir,
      absolute: true,
      ignore: ["**/node_modules/**"],
    });
    allFiles.push(...files);
  }

  return allFiles;
}

/**
 * Find all .usm/ directory paths in the monorepo.
 *
 * @param root — monorepo root directory
 */
export function findAllUsmDirs(root: string): string[] {
  const resolvedRoot = path.resolve(root);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glob = require("fast-glob");

  return glob.sync("**/.usm", {
    cwd: resolvedRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    onlyDirectories: true,
  });
}
