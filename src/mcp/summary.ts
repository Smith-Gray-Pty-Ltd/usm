import { z } from "zod";
import { parseUsmFile, isSystemFile, isServiceFile, isFeatureFile } from "../index.js";
import { resolvePath } from "../mcp-utils.js";

export const summarySchema = {
  path: z.string().describe("Path to the .usm file"),
};

export async function summaryTool(args: { path: string }) {
  const filePath = resolvePath(args.path);
  try {
    const parsed = parseUsmFile(filePath);

    const result: Record<string, unknown> = {
      id: parsed.$id,
      type: parsed.$type,
      version: parsed.$version,
      last_updated: parsed.$last_updated ?? null,
      summary: parsed.summary,
    };

    if (isSystemFile(parsed)) {
      result.identity = parsed.identity;
      result.featureCount = parsed.index?.length ?? 0;
      result.serviceCount = parsed.services?.length ?? 0;
    } else if (isServiceFile(parsed)) {
      result.runtime = parsed.runtime;
      result.port = parsed.port ?? null;
      result.depends_on = parsed.depends_on ?? [];
    } else if (isFeatureFile(parsed)) {
      result.flowCount = parsed.flows?.length ?? 0;
      result.contractCount = parsed.contracts?.length ?? 0;
      result.testCount = parsed.tests?.length ?? 0;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Failed to summarize ${args.path}: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
