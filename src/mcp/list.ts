import { z } from "zod";
import { findUsmFiles, parseUsmFile } from "../index.js";
import { resolvePath, defaultUsmDir, allUsmFilesInMonorepo } from "../mcp-utils.js";

export const listSchema = {
  directory: z.string().optional().describe("Directory to search (default: all .usm dirs across monorepo)"),
  type: z
    .enum(["system", "service", "feature", "api", "data", "policy", "operations"])
    .optional()
    .describe("Filter by $type"),
};

export async function listTool(args: { directory?: string; type?: string }) {
  // If directory specified, search only that directory.
  // Otherwise, search all .usm/ directories across the monorepo.
  const files = args.directory
    ? findUsmFiles(resolvePath(args.directory))
    : allUsmFilesInMonorepo();

  const dir = args.directory ? resolvePath(args.directory) : "monorepo (all .usm dirs)";

  try {
    const results: Array<{ path: string; id: string; type: string; version: number; summary: string }> = [];

    for (const filePath of files) {
      try {
        const parsed = parseUsmFile(filePath);
        if (args.type && parsed.$type !== args.type) continue;
        results.push({
          path: filePath,
          id: parsed.$id,
          type: parsed.$type,
          version: parsed.$version,
          summary: parsed.summary,
        });
      } catch {
        // Skip unparseable files
      }
    }

    results.sort((a, b) => a.path.localeCompare(b.path));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ directory: dir, count: results.length, files: results }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Failed to list: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
