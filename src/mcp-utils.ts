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

/**
 * Derive the canonical docs URL shape for a feature .usm file.
 *
 * Docs routes mirror the `.usm/features/<area>/<slug>` source layout — the
 * `$system` namespace is dropped and the directory under `.usm/features/`
 * becomes the path. This is the rule agents need to "return the live docs
 * link" (issue #34).
 *
 * @param featurePath absolute path to the feature .usm file
 * @param root monorepo root (defaults to process.cwd())
 * @returns the docs path (e.g. `/features/platform/my-feature`), or null if
 *   the file isn't under a `.usm/features/` directory
 */
export function featureDocsPath(featurePath: string, _root: string = process.cwd()): string | null {
  const normalized = featurePath.split(path.sep).join("/");
  const marker = "/.usm/features/";
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) return null;

  const rel = normalized.slice(idx + marker.length).replace(/\.usm$/, "");
  if (!rel) return null;

  // Mirrors generateFeatureMarkdown: a slug with a sub-path is a leaf page
  // (`<area>/<slug>.md` → `/features/<area>/<slug>`); a flat slug is written
  // to `<slug>/index.md` (→ `/features/<slug>/`).
  return rel.includes("/") ? `/features/${rel}` : `/features/${rel}/`;
}

/**
 * Read the port of a running `usm docs serve` from the workspace port file.
 * Returns null when no server has recorded a port.
 */
export function readDocsServePort(root: string = process.cwd()): number | null {
  const portFile = path.join(root, ".usm-workspace", "docs", ".vitepress.port");
  try {
    const raw = fs.readFileSync(portFile, "utf-8").trim();
    const port = parseInt(raw, 10);
    return Number.isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

/**
 * Build a ready-to-share docs link for a feature file when a docs server is
 * running, or the path-only hint when it isn't. Agents should return this
 * verbatim instead of guessing scheme/port/path (issue #34).
 */
export function featureDocsUrl(
  featurePath: string,
  root: string = process.cwd(),
): { url: string | null; path: string | null; hint: string } {
  const docsPath = featureDocsPath(featurePath, root);
  const port = readDocsServePort(root);
  const url = docsPath && port ? `http://localhost:${port}${docsPath}` : null;
  const hint = url
    ? "Open this URL to review the rendered spec in the browser."
    : docsPath
      ? `Docs path is ${docsPath}. Start the docs server with \`usm docs serve --watch\` and the full URL will be http://localhost:<port>${docsPath}.`
      : "Could not derive a docs path — feature files must live under .usm/features/<area>/<slug>.usm.";
  return { url, path: docsPath, hint };
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
