// Shared helpers for scan operations

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import fg from "fast-glob";
import type { PackageJsonInfo, DetectedPrismaSchema, DetectedDockerService } from "./types.js";

/**
 * Read and parse a package.json file.
 */
export function readPackageJson(filePath: string): PackageJsonInfo | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const raw = JSON.parse(content) as Record<string, unknown>;

    return {
      name: (raw.name as string) || "",
      version: (raw.version as string) || undefined,
      scripts: (raw.scripts as Record<string, string>) || undefined,
      dependencies: (raw.dependencies as Record<string, string>) || undefined,
      devDependencies: (raw.devDependencies as Record<string, string>) || undefined,
      main: (raw.main as string) || undefined,
      types: (raw.types as string) || undefined,
      exports: (raw.exports as Record<string, string>) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Detect service kind from package.json and directory location.
 */
export function detectServiceKind(
  pkgJson: PackageJsonInfo,
  relativePath: string
): "web-app" | "api-server" | "mobile-app" | "desktop-app" | "database" | "other" {
  const deps = Object.keys(pkgJson.dependencies || {});
  const devDeps = Object.keys(pkgJson.devDependencies || {});

  // Framework detection
  if (deps.includes("next")) return "web-app";
  if (deps.includes("express") || deps.includes("fastify")) return "api-server";
  if (deps.includes("expo") || deps.includes("react-native")) return "mobile-app";
  if (devDeps.includes("@tauri-apps/cli") || deps.includes("@tauri-apps/api")) return "desktop-app";

  // Path-based heuristic
  if (relativePath.startsWith("apps/mobile")) return "mobile-app";
  if (relativePath.startsWith("apps/desktop")) return "desktop-app";
  if (relativePath.startsWith("apps/")) return "web-app";

  return "other";
}

/**
 * Detect runtime framework from package.json dependencies.
 */
export function detectRuntime(pkgJson: PackageJsonInfo): string {
  const deps = Object.keys(pkgJson.dependencies || {});

  if (deps.includes("next")) return "nextjs";
  if (deps.includes("express")) return "express";
  if (deps.includes("fastify")) return "fastify";
  if (deps.includes("expo") || deps.includes("react-native")) return "react-native";
  if (deps.includes("@tauri-apps/api")) return "tauri";

  return "unknown";
}

/**
 * Extract port number from package.json scripts or config.
 */
export function detectPort(pkgJson: PackageJsonInfo): number | undefined {
  const scripts = pkgJson.scripts || {};

  // Look for --port in dev/start scripts
  for (const scriptKey of ["dev", "start"]) {
    const scriptValue = scripts[scriptKey];
    if (!scriptValue) continue;

    const portMatch = scriptValue.match(/--port\s+(\d+)/);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }

    // Also check for -p <port>
    const pMatch = scriptValue.match(/-p\s+(\d+)/);
    if (pMatch) {
      return parseInt(pMatch[1], 10);
    }
  }

  return undefined;
}

/**
 * Extract @smith-gray/* dependencies from package.json.
 */
export function extractSmithGrayDependencies(pkgJson: PackageJsonInfo): string[] {
  const allDeps = [
    ...Object.keys(pkgJson.dependencies || {}),
    ...Object.keys(pkgJson.devDependencies || {}),
  ];

  return allDeps
    .filter((dep) => dep.startsWith("@smith-gray/"))
    .map((dep) => dep.replace("@smith-gray/", ""));
}

/**
 * Parse a Prisma schema file and extract model names.
 */
export function parsePrismaModels(schemaPath: string): DetectedPrismaSchema {
  const content = fs.readFileSync(schemaPath, "utf-8");
  const models: string[] = [];

  // Extract model names from lines like "model User {"
  // Only match lines that start with "model " followed by a valid identifier and "{"
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const modelMatch = trimmed.match(/^model\s+([A-Z][A-Za-z0-9_]+)\s*\{/);
    if (modelMatch) {
      models.push(modelMatch[1]);
    }
  }

  return {
    path: schemaPath,
    models,
  };
}

/**
 * Parse a docker-compose.yml and extract service definitions.
 * Only extracts top-level services (not those from includes).
 */
export function parseDockerCompose(filePath: string): DetectedDockerService[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object" || !parsed.services) {
      return [];
    }

    const services = parsed.services as Record<string, Record<string, unknown>>;
    const result: DetectedDockerService[] = [];

    for (const [name, config] of Object.entries(services)) {
      const ports: string[] = [];
      if (Array.isArray(config.ports)) {
        for (const p of config.ports as string[]) {
          // Extract host port from "host:container" format
          const hostPort = p.split(":")[0];
          ports.push(hostPort);
        }
      }

      result.push({
        name,
        image: (config.image as string) || undefined,
        ports,
        depends_on: Array.isArray(config.depends_on)
          ? (config.depends_on as string[])
          : undefined,
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Find directories matching a glob pattern.
 * Returns absolute paths to directories that contain a package.json.
 */
export function findWorkspaceDirs(
  root: string,
  includePatterns: string[],
  excludePatterns: string[]
): string[] {
  const dirs = fg.sync(includePatterns, {
    cwd: root,
    absolute: true,
    onlyDirectories: true,
    ignore: excludePatterns,
  });

  return dirs.filter((dir) => {
    return fs.existsSync(path.join(dir, "package.json"));
  });
}

/**
 * Find files matching a glob pattern.
 */
export function findFiles(
  root: string,
  patterns: string[],
  excludePatterns: string[]
): string[] {
  return fg.sync(patterns, {
    cwd: root,
    absolute: true,
    ignore: excludePatterns,
  });
}

/**
 * Stringify a .usm object to YAML with 2-space indent, block style.
 */
export function yamlStringify(obj: Record<string, unknown>): string {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: -1, // Don't wrap long lines
    noRefs: true,   // Don't use YAML references
    quotingType: "'", // Use single quotes for strings
    forceQuotes: false,
    sortKeys: false,  // Preserve key order
  });
}

/**
 * Get today's date in ISO 8601 format (YYYY-MM-DD).
 */
export function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Extract the short name from a workspace path (e.g. "apps/the-architect" → "the-architect").
 */
export function shortNameFromPath(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] || relativePath;
}

/**
 * Extract the short name from a package.json name (e.g. "@smith-gray/the-architect" → "the-architect").
 */
export function shortNameFromPackageJson(packageName: string): string {
  if (packageName.startsWith("@smith-gray/")) {
    return packageName.replace("@smith-gray/", "");
  }
  return packageName;
}

/**
 * Resolve a relative path from root, ensuring it's absolute.
 */
export function resolvePath(root: string, relativePath: string): string {
  return path.resolve(root, relativePath);
}
