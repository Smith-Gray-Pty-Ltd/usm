# Claude Desktop

Custom Connectors UI — paste one command, no restart

## Prerequisites

```bash
npm install -g @smithgray/usm
```

## Configure MCP

**No restart required.** This editor picks up MCP config changes live.

```json
{
  "mcpServers": {
    "usm": {
      "command": "usm",
      "args": ["mcp", "serve"]
    }
  }
}
```


## Rules file

This editor does not support always-on rules/skills files. The spec-first workflow is enforced via the MCP tool descriptions and your prompts. See the [agent setup guide](../agent-setup-guide) for prompt templates.

## Verify it's working

After configuring, your editor should show the USM MCP server with 18 tools:

- **Read (9):** `usm_list`, `usm_read`, `usm_search`, `usm_validate`, `usm_summary`, `usm_references`, `usm_get_contracts`, `usm_get_flows`, `usm_query`
- **Write (9):** `usm_draft_feature`, `usm_write_feature`, `usm_update_feature`, `usm_update_feature_status`, `usm_report_feedback`, `usm_write_system`, `usm_write_service`, `usm_update_system`, `usm_update_service`

## Next steps

- [MCP setup index](./) — other editors
- [Agent setup guide](../agent-setup-guide) — how to prompt your agent
- [CLI reference](../cli-reference) — all USM commands
- [Getting started](../getting-started) — full USM workflow
