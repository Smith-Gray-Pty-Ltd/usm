---
"@smithgray/usm": minor
---

Anti-drift docs tooling — hand-written surfaces stop rotting. New `usm generate --only readme-facts` target smart-merges a `USM:FACTS` block into README.md (version, CLI commands, MCP tool count) derived from package.json and feature-spec `command` fields. The MCP reference now documents all 14 tools (comma-bundled `command` fields split per tool, `usm_query` and `usm_report_feedback` specs added), the CLI reference documents `query`, `import`, and `feedback` via new usage/options spec blocks (with a filter so usm_-prefixed tool specs never appear as CLI commands), and the agent setup guide lists the full two-tier rules-file output per tool. Marketing site (usm.dev) version badge and tool counts now derive from package.json; stale Alpha v0.1.0/12-tool/Codex-only claims corrected everywhere.
