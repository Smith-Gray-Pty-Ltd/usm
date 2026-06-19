import { z } from "zod";
import { findUsmFiles, parseUsmFile } from "../index.js";
import { resolvePath, defaultUsmDir, allUsmFilesInMonorepo } from "../mcp-utils.js";

export const searchSchema = {
  query: z.string().describe("Search query string"),
  directory: z.string().optional().describe("Directory to search (default: all .usm dirs across monorepo)"),
  case_sensitive: z.boolean().optional().describe("Case-sensitive search (default: false)"),
};

interface SearchHit {
  path: string;
  id: string;
  type: string;
  excerpt: string;
  score: number;
}

export async function searchTool(args: { query: string; directory?: string; case_sensitive?: boolean }) {
  // If directory specified, search only that directory.
  // Otherwise, search all .usm/ directories across the monorepo.
  const files = args.directory
    ? findUsmFiles(resolvePath(args.directory))
    : allUsmFilesInMonorepo();

  const caseSensitive = args.case_sensitive ?? false;
  const query = caseSensitive ? args.query : args.query.toLowerCase();

  try {
    const hits: SearchHit[] = [];

    for (const filePath of files) {
      try {
        const parsed = parseUsmFile(filePath);
        const serialized = JSON.stringify(parsed);
        const haystack = caseSensitive ? serialized : serialized.toLowerCase();

        // Count occurrences
        let score = 0;
        let idx = 0;
        while ((idx = haystack.indexOf(query, idx)) !== -1) {
          score++;
          idx += query.length;
        }

        if (score === 0) continue;

        // Extract excerpt around first match in summary
        const summaryText = parsed.summary || "";
        const summaryHaystack = caseSensitive ? summaryText : summaryText.toLowerCase();
        const matchIdx = summaryHaystack.indexOf(query);

        let excerpt: string;
        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 40);
          const end = Math.min(summaryText.length, matchIdx + query.length + 40);
          excerpt = (start > 0 ? "..." : "") + summaryText.slice(start, end) + (end < summaryText.length ? "..." : "");
        } else {
          // Just use the start of the summary
          excerpt = summaryText.slice(0, 100) + (summaryText.length > 100 ? "..." : "");
        }

        hits.push({
          path: filePath,
          id: parsed.$id,
          type: parsed.$type,
          excerpt,
          score,
        });
      } catch {
        // Skip unparseable files
      }
    }

    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    const top10 = hits.slice(0, 10);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ query: args.query, count: top10.length, totalMatches: hits.length, results: top10 }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Search failed: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
