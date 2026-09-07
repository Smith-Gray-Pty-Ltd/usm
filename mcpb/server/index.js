#!/usr/bin/env node
/**
 * USM MCPB entry point.
 *
 * This is a thin wrapper that delegates to the USM CLI's MCP server mode.
 * The @smithgray/usm package is installed as a dependency of the MCPB bundle
 * and provides the full MCP server implementation (18 tools).
 *
 * When the host app (Claude Desktop, Smithery, etc.) starts this bundle,
 * it runs `node server/index.js` which spawns `usm mcp serve` with stdio
 * transport — the standard MCP local server pattern.
 */
const { spawn } = require("node:child_process");

const child = spawn("npx", ["@smithgray/usm", "mcp", "serve"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

child.on("error", (err) => {
  process.stderr.write(`USM MCP server failed to start: ${err.message}\n`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});