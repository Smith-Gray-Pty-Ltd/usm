/**
 * Tree-view renderer for file lists using treeify.
 *
 * Renders the "Files written:" / "Files skipped:" lists as a nested tree
 * mirroring the .usm/ directory structure, instead of a flat list of paths.
 * Falls back to a flat list in non-TTY environments.
 */
import treeify from "treeify";
import { dim } from "./colors.js";

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

/** Build a nested object from an array of slash-path strings for treeify. */
function buildTree(paths: string[]): treeify.TreeObject {
  const root: treeify.TreeObject = {};
  for (const p of paths) {
    const segments = p.split("/");
    let node: treeify.TreeObject = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i === segments.length - 1) {
        // Leaf — mark with null so treeify renders it as a leaf node
        (node as Record<string, unknown>)[seg] = null;
      } else {
        if (typeof (node as Record<string, unknown>)[seg] !== "object" || (node as Record<string, unknown>)[seg] === null) {
          (node as Record<string, unknown>)[seg] = {};
        }
        node = (node as Record<string, unknown>)[seg] as treeify.TreeObject;
      }
    }
  }
  return root;
}

/**
 * Render an array of file paths as a tree (TTY) or flat list (non-TTY).
 * @param paths - array of paths (forward-slash separated, relative)
 * @param prefix - optional label before the tree (e.g. "Files written:")
 */
export function renderFileTree(paths: string[], prefix?: string): string {
  if (paths.length === 0) return "";

  if (!isTTY) {
    // Flat fallback for pipes/CI
    const lines = paths.map((p) => `  ${p}`);
    return prefix ? `${prefix}\n${lines.join("\n")}` : lines.join("\n");
  }

  const tree = buildTree(paths);
  // treeify.asTree outputs lines like "├─ file.usm" — dim the connectors/paths
  const rendered = treeify.asTree(tree, true, false);
  const dimmed = rendered
    .split("\n")
    .map((line: string) => dim(line))
    .join("\n");
  return prefix ? `${prefix}\n${dimmed}` : dimmed;
}