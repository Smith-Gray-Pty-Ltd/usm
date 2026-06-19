import { z } from "zod";
import { validateUsmFile, validateUsmString } from "../index.js";
import { resolvePath, readFileOrNull } from "../mcp-utils.js";

export const validateSchema = {
  path: z.string().optional().describe("Path to the .usm file to validate"),
  content: z.string().optional().describe("Inline YAML content to validate"),
};

export async function validateTool(args: { path?: string; content?: string }) {
  try {
    if (args.content) {
      const result = validateUsmString(args.content);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ source: "inline", ...result }, null, 2),
          },
        ],
      };
    }

    if (args.path) {
      const filePath = resolvePath(args.path);
      const fileContent = readFileOrNull(filePath);
      if (fileContent === null) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: false, errors: [{ path: "/", message: `File not found: ${args.path}` }] }, null, 2),
            },
          ],
          isError: true,
        };
      }
      const result = validateUsmFile(filePath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ source: args.path, ...result }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Provide either 'path' or 'content'" }, null, 2),
        },
      ],
      isError: true,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: `Validation failed: ${(err as Error).message}` }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
