import { z } from "zod";
import { findUsmFiles, parseUsmFile } from "../index.js";
import { resolvePath, defaultUsmDir, findRefsInObj, type ReferenceHit } from "../mcp-utils.js";

export const referencesSchema = {
  target_id: z.string().describe("The $id to find references to (e.g. 'smith-gray/zitadel')"),
  directory: z.string().optional().describe("Directory to search (default: .usm)"),
};

export async function referencesTool(args: { target_id: string; directory?: string }) {
  const dir = args.directory ? resolvePath(args.directory) : defaultUsmDir();

  try {
    const files = findUsmFiles(dir);
    const hits: ReferenceHit[] = [];

    for (const filePath of files) {
      try {
        const parsed = parseUsmFile(filePath);
        const contexts = findRefsInObj(parsed, args.target_id);

        // Deduplicate contexts
        const uniqueContexts = [...new Set(contexts)];
        for (const context of uniqueContexts) {
          hits.push({
            path: filePath,
            id: parsed.$id,
            type: parsed.$type,
            context,
          });
        }
      } catch {
        // Skip unparseable files
      }
    }

    hits.sort((a, b) => a.path.localeCompare(b.path) || a.context.localeCompare(b.context));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ target_id: args.target_id, count: hits.length, references: hits }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Failed to find references: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
