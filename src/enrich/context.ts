// Context builder for the usm enrich subcommand
// Reads a .usm file and its referenced source code to build the LLM context window

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { EnrichmentContext, EnrichmentConfig } from "./types.js";

/**
 * Check if a value looks like a TODO: describe placeholder.
 */
function isTodoDescribe(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().startsWith("TODO: describe");
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/**
 * Check if a value has real (non-placeholder) content.
 */
function hasRealContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && !trimmed.startsWith("TODO:");
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return false;
}

/**
 * Read a source file with a character limit.
 * Returns the file content, truncated to maxChars.
 */
function readSourceFile(filePath: string, maxChars: number): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (content.length > maxChars) {
      return content.slice(0, maxChars) + "\n... (truncated)";
    }
    return content;
  } catch {
    return `// Could not read file: ${filePath}`;
  }
}

/**
 * Extract source file paths from a parsed .usm file.
 * Looks at implementation.primary, implementation.test_code, interfaces[].page,
 * and routes[].file_path.
 */
function extractSourcePaths(usmFile: Record<string, unknown>): string[] {
  const paths: string[] = [];

  // implementation.primary — comma-separated paths
  const impl = usmFile.implementation as Record<string, unknown> | undefined;
  if (impl) {
    if (typeof impl.primary === "string" && impl.primary.trim()) {
      // Split on comma and trim
      for (const p of impl.primary.split(",")) {
        const trimmed = p.trim();
        if (trimmed) paths.push(trimmed);
      }
    }
    if (typeof impl.ui === "string" && impl.ui.trim()) {
      paths.push(impl.ui.trim());
    }
    if (typeof impl.test_code === "string" && impl.test_code.trim()) {
      paths.push(impl.test_code.trim());
    }
  }

  // interfaces[].page — these are URL paths, not file paths; skip them

  // routes[].file_path
  const routes = usmFile.routes as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(routes)) {
    for (const route of routes) {
      if (typeof route.file_path === "string" && route.file_path.trim()) {
        paths.push(route.file_path.trim());
      }
    }
  }

  // Deduplicate
  return [...new Set(paths)];
}

/**
 * Build the enrichment context for a .usm file.
 * Reads the file and its referenced source code.
 */
export async function buildEnrichmentContext(
  filePath: string,
  rootDir: string,
  config: EnrichmentConfig
): Promise<EnrichmentContext> {
  const absolutePath = path.resolve(filePath);
  const originalYaml = fs.readFileSync(absolutePath, "utf-8");
  const usmFile = yaml.load(originalYaml) as Record<string, unknown>;

  // Identify TODO vs populated fields
  const todoFields: string[] = [];
  const populatedFields: string[] = [];

  const enrichableFields = config.fields || ["summary", "intent", "decisions", "flows", "contracts", "tests"];

  for (const field of enrichableFields) {
    const value = usmFile[field];
    if (isTodoDescribe(value)) {
      todoFields.push(field);
    } else if (hasRealContent(value)) {
      populatedFields.push(field);
    } else {
      // Empty or undefined — treat as TODO
      todoFields.push(field);
    }
  }

  // Extract and read source files
  const sourcePaths = extractSourcePaths(usmFile);
  const sourceFiles: Record<string, string> = {};

  for (const relPath of sourcePaths) {
    const absPath = path.resolve(rootDir, relPath);
    if (fs.existsSync(absPath)) {
      sourceFiles[relPath] = readSourceFile(absPath, config.max_source_file_chars);
    }
  }

  // Extract routes
  const routes: Array<{ path: string; type: string; http_methods: string[] }> = [];
  const routeEntries = usmFile.routes as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(routeEntries)) {
    for (const route of routeEntries) {
      routes.push({
        path: String(route.path || ""),
        type: String(route.type || ""),
        http_methods: Array.isArray(route.http_methods)
          ? route.http_methods.map(String)
          : [],
      });
    }
  }

  return {
    usmFile,
    originalYaml,
    sourceFiles,
    todoFields,
    populatedFields,
    routes,
  };
}
