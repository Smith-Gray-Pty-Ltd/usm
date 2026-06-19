import { z } from "zod";
import { parseUsmFile, isFeatureFile } from "../index.js";
import { resolvePath } from "../mcp-utils.js";

export const flowsSchema = {
  path: z.string().describe("Path to a feature .usm file"),
};

export async function flowsTool(args: { path: string }) {
  const filePath = resolvePath(args.path);
  try {
    const parsed = parseUsmFile(filePath);

    if (!isFeatureFile(parsed)) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `${args.path} is a ${parsed.$type} file, not a feature file. Flows only exist in feature files.` },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const flows = parsed.flows ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: parsed.$id,
              flowCount: flows.length,
              flows: flows.map((f) => ({
                id: f.id,
                name: f.name,
                description: f.description ?? "",
                stepCount: f.steps.length,
                steps: f.steps,
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
          text: JSON.stringify({ error: `Failed to get flows: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
