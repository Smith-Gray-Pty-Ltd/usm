import { z } from "zod";
import { parseUsmFile, isFeatureFile } from "../index.js";
import { resolvePath } from "../mcp-utils.js";

export const contractsSchema = {
  path: z.string().describe("Path to a feature .usm file"),
};

export async function contractsTool(args: { path: string }) {
  const filePath = resolvePath(args.path);
  try {
    const parsed = parseUsmFile(filePath);

    if (!isFeatureFile(parsed)) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `${args.path} is a ${parsed.$type} file, not a feature file. Contracts only exist in feature files.` },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const contracts = parsed.contracts ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: parsed.$id,
              contractCount: contracts.length,
              contracts: contracts.map((c) => ({
                id: c.id,
                description: c.description,
                applies_after: c.applies_after ?? [],
                must_have: c.must_have ?? [],
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Failed to get contracts: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
