# VS Code

GitHub Copilot agent mode — .vscode/mcp.json per workspace

## Prerequisites

```bash
npm install -g @smithgray/usm
```

## Configure MCP

**Restart required.** Save the config file and restart your editor for the MCP server to be picked up.

```json
// .vscode/mcp.json (per workspace)
{
  "servers": {
    "usm": {
      "command": "usm",
      "args": ["mcp", "serve"]
    }
  }
}
```


## Install the rules file

USM can install an always-on rules/skills file that enforces the spec-first workflow on every message. After configuring MCP above, run:

```bash
usm generate --only rules
```

This creates:

- **.github/copilot-instructions.md** — the detailed skill/workflow file
- **.github/instructions/usm-iron-rules.md** — the always-on file (.github/instructions/usm-iron-rules.md)

The always-on file carries short iron rules that re-anchor the workflow on every request — countering drift in long agent sessions.

## Verify it's working

After configuring, your editor should show the USM MCP server with 18 tools:

- **Read (9):** `usm_list`, `usm_read`, `usm_search`, `usm_validate`, `usm_summary`, `usm_references`, `usm_get_contracts`, `usm_get_flows`, `usm_query`
- **Write (9):** `usm_draft_feature`, `usm_write_feature`, `usm_update_feature`, `usm_update_feature_status`, `usm_report_feedback`, `usm_write_system`, `usm_write_service`, `usm_update_system`, `usm_update_service`

## Next steps

- [MCP setup index](./) — other editors
- [Agent setup guide](../agent-setup-guide) — how to prompt your agent
- [CLI reference](../cli-reference) — all USM commands
- [Getting started](../getting-started) — full USM workflow
