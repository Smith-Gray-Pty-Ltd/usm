# Adding USM to Your Project

Install USM, scan your codebase, configure your AI agent, and start the spec-first workflow.

## Step 1: Install

```bash
npm install -g @smithgray/usm
```

## Step 2: Initialize and Scan

```bash
cd your-repo
usm init          # Creates usmconfig.json
usm scan          # Detects services, routes, data models
```

## Step 3: Generate Docs

```bash
usm generate      # Produces markdown, Mermaid, OpenAPI, test specs
usm docs serve    # Preview docs at localhost:5173
```

## Step 4: Start the MCP Server

The MCP server lets your AI agent read the .usm system map.

```bash
usm mcp serve
```

### Configure MCP in Your AI Tool

## Step 5: Generate Rules Files

```bash
usm generate --only rules
```

Creates per-tool rules files — teaching your agent the spec-first workflow automatically:

| Tool | Detail file | Always-on file (every request) |
| --- | --- | --- |
| opencode | .opencode/skills/usm-workflow/SKILL.md | .opencode/usm-instructions.md (wired into opencode.json) |
| Claude Code | CLAUDE.md | .claude/skills/usm-workflow/SKILL.md |
| Cursor | .cursor/rules/usm.mdc | .cursor/rules/usm-always.mdc (alwaysApply) |
| Copilot | .github/copilot-instructions.md | .github/instructions/usm-iron-rules.md |
| Codex | AGENTS.md | — (no per-message mechanism) |

The always-on files carry short iron rules that re-anchor the workflow on every request — countering drift in long agent sessions.

## Step 6: (Optional) Enrich with LLM

Scanned .usm files contain `TODO: describe` placeholders. Fill them with an LLM:

```bash
usm enrich --dry-run          # Preview changes
usm enrich                     # Fill TODOs (requires LLM config)
```

Supports OpenAI, Anthropic, Ollama, and LiteLLM (any OpenAI-compatible model).

---

## How to Prompt Your Agent

### First-time setup

::: tip
Install USM in this repo: run `npm install -g @smithgray/usm`, then `usm init`, `usm scan`, and `usm generate`. Start the MCP server with `usm mcp serve`. Read the generated .usm files to understand the project structure. Going forward, before implementing any feature, draft a .usm spec first using the MCP write tools, show me the markdown for review, then build from the approved spec.

:::

### New feature

::: tip
I want to add [feature description]. Use USM to draft a feature spec first — call `usm_draft_feature` with the summary, intent, flows, and contracts. Show me the generated markdown. Once I approve, write the .usm file and implement the feature. Update the feature status to `built` when done.

:::

### Quick agent context

::: tip
Read the .usm system map before starting work. Use `usm_list` to see all files, `usm_search` to find relevant features, and `usm_read` to get details.

:::

### Bug fix

::: tip
Fix [bug description]. First, search the .usm files with `usm_search` to find the relevant feature spec. Read it with `usm_read` to understand the contracts and tests. Fix the bug, then update the feature spec if the behavior changed.

:::

---

## Available MCP Tools (18)

**Read (9):** `usm_list`, `usm_read`, `usm_search`, `usm_validate`, `usm_summary`, `usm_references`, `usm_get_contracts`, `usm_get_flows`, `usm_query`

**Write (9):** `usm_draft_feature`, `usm_write_feature`, `usm_update_feature`, `usm_update_feature_status`, `usm_report_feedback`, `usm_write_system`, `usm_write_service`, `usm_update_system`, `usm_update_service`

## Verify It's Working

```bash
usm check                        # Validate all .usm files
usm info .usm/system.usm         # Show system summary
```

## Next Steps

- [CLI Reference](cli-reference.md) - [Configuration](config-reference.md) - [Schema Reference](schema-reference.md) - [MCP Tools](mcp-reference.md) - [Language Support](language-support.md)
