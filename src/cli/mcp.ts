#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readSchema, readTool } from "../mcp/read.js";
import { listSchema, listTool } from "../mcp/list.js";
import { validateSchema, validateTool } from "../mcp/validate.js";
import { summarySchema, summaryTool } from "../mcp/summary.js";
import { referencesSchema, referencesTool } from "../mcp/references.js";
import { searchSchema, searchTool } from "../mcp/search.js";
import { contractsSchema, contractsTool } from "../mcp/contracts.js";
import { flowsSchema, flowsTool } from "../mcp/flows.js";

const server = new McpServer({
  name: "usm-mcp",
  version: "0.1.0",
});

// Tool 1: usm_read
server.tool(
  "usm_read",
  "Read and parse a .usm file, returning the full object plus metadata (id, type, version, summary, and type-specific fields)",
  readSchema,
  readTool,
);

// Tool 2: usm_list
server.tool(
  "usm_list",
  "List all .usm files in a directory with id, type, version, and summary. Optionally filter by $type.",
  listSchema,
  listTool,
);

// Tool 3: usm_validate
server.tool(
  "usm_validate",
  "Validate a .usm file (by path) or inline YAML content against the v1 JSON Schema. Returns { valid, errors }.",
  validateSchema,
  validateTool,
);

// Tool 4: usm_summary
server.tool(
  "usm_summary",
  "Get a quick summary of a .usm file — id, type, version, summary, and type-specific counts (features, services, flows, contracts, tests).",
  summarySchema,
  summaryTool,
);

// Tool 5: usm_references
server.tool(
  "usm_references",
  "Find all .usm files that reference a target $id (e.g. 'smith-gray/zitadel'). Returns the file path, id, type, and the field where the reference was found. Useful for impact analysis.",
  referencesSchema,
  referencesTool,
);

// Tool 6: usm_search
server.tool(
  "usm_search",
  "Search all .usm files for a query string. Returns matching files with excerpts and relevance scores. Case-insensitive by default, top 10 results.",
  searchSchema,
  searchTool,
);

// Tool 7: usm_get_contracts
server.tool(
  "usm_get_contracts",
  "Get the contracts array from a feature .usm file. Each contract has id, description, applies_after, and must_have. For test planning and review.",
  contractsSchema,
  contractsTool,
);

// Tool 8: usm_get_flows
server.tool(
  "usm_get_flows",
  "Get the flows array from a feature .usm file. Each flow has id, name, description, and steps. For understanding user journeys.",
  flowsSchema,
  flowsTool,
);

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run main() if this file is executed directly (not imported as a module)
if (require.main === module) {
  startMcpServer().catch((err) => {
  console.error("Fatal error starting usm-mcp:", err);
    process.exit(1);
  });
}

