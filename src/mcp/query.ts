// usm_query — MCP read tool: predicate query over .usm data.
//
// Shares the parser/evaluator with the `usm query` CLI (src/query/index.ts).
// Read-only; results capped (default 50) for context safety.

import { z } from "zod";
import path from "node:path";
import { runQuery, QueryParseError } from "../query/index.js";
import { allUsmFilesInMonorepo } from "../mcp-utils.js";
import { parseUsmFile } from "../parse.js";

export const querySchema = {
  query: z.string().describe('Predicate query, e.g. "features where status = planned", "all where summary ~ auth", "services where has decisions". Selectors: features services systems apis data policies operations feedback all. Operators: = != > < >= <= ~ (contains), has <field>, and/or/not with parens.'),
  limit: z.number().optional().describe("Max results to return (default 50)"),
};

export async function queryTool(args: { query: string; limit?: number }) {
  try {
    const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 50;

    const filePaths = allUsmFilesInMonorepo();
    const hitsWithPaths = filePaths
      .map((filePath) => {
        try {
          return { file: parseUsmFile(filePath) as unknown as Record<string, unknown>, path: filePath };
        } catch {
          return null; // unparseable files aren't queryable
        }
      })
      .filter((x): x is { file: Record<string, unknown>; path: string } => x !== null);

    let hits;
    try {
      hits = runQuery(args.query, hitsWithPaths);
    } catch (err) {
      if (err instanceof QueryParseError) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Query error: ${err.message}` }, null, 2) }],
          isError: true,
        };
      }
      throw err;
    }

    const total = hits.length;
    const truncated = total > limit;
    const shown = truncated ? hits.slice(0, limit) : hits;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          query: args.query,
          total,
          returned: shown.length,
          truncated,
          results: shown.map(({ file, path: filePath }) => ({
            id: file.$id,
            type: file.$type,
            status: file.status ?? null,
            summary: String(file.summary ?? "").split("\n")[0].slice(0, 120),
            path: path.isAbsolute(filePath) ? filePath : path.resolve(filePath),
          })),
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Query failed: ${(err as Error).message}` }, null, 2) }],
      isError: true,
    };
  }
}
