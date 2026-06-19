import { z } from "zod";
import { parseUsmFile, isSystemFile, isServiceFile, isFeatureFile } from "../index.js";
import { resolvePath } from "../mcp-utils.js";

export const readSchema = {
  path: z.string().describe("Path to the .usm file (relative to monorepo root or absolute)"),
};

export async function readTool(args: { path: string }) {
  const filePath = resolvePath(args.path);
  try {
    const parsed = parseUsmFile(filePath);

    const metadata: Record<string, unknown> = {
      id: parsed.$id,
      type: parsed.$type,
      version: parsed.$version,
      summary: parsed.summary,
    };

    if (isSystemFile(parsed)) {
      metadata.identity = parsed.identity;
      metadata.featureCount = parsed.index?.length ?? 0;
      metadata.serviceCount = parsed.services?.length ?? 0;
    } else if (isServiceFile(parsed)) {
      metadata.runtime = parsed.runtime;
      metadata.port = parsed.port;
      metadata.depends_on = parsed.depends_on;
    } else if (isFeatureFile(parsed)) {
      metadata.flowCount = parsed.flows?.length ?? 0;
      metadata.contractCount = parsed.contracts?.length ?? 0;
      metadata.testCount = parsed.tests?.length ?? 0;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ file: filePath, metadata, data: parsed }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Failed to read ${args.path}: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
