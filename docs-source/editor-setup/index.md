# Editor Setup

Find your editor, copy the config, start the spec-first workflow. Works with every MCP-ready AI agent.

## Setup guides for every supported editor

35 guides — click any card to see the exact MCP config and rules file for that editor.

### Anthropic

- [**Claude Code**](./claude-code) — `claude mcp add` one-liner + CLAUDE.md always-on rules
- [**Claude Desktop**](./claude-desktop) — Custom Connectors UI, paste one URL, no restart

### OpenAI

- [**Codex**](./openai-codex) — TOML at `~/.codex/config.toml` + AGENTS.md rules
- [**ChatGPT**](./chatgpt) — Developer Mode apps (Pro, Plus, Team, Enterprise, Edu)

### Cursor

- [**Cursor**](./cursor) — `~/.cursor/mcp.json` + `.cursor/rules/usm-always.mdc` always-on rules

### VS Code family

- [**VS Code**](./vs-code) — `.vscode/mcp.json` per workspace + `.github/copilot-instructions.md`
- [**Visual Studio**](./visual-studio) — `.mcp.json` per solution (VS 2022 17.12+)
- [**Copilot Coding Agent**](./copilot-coding-agent) — Per-repo MCP configuration
- [**Copilot CLI**](./copilot-cli) — `~/.copilot/mcp-config.json` with tools
- [**Cline**](./cline) — VS Code extension, streamableHttp camelCase schema
- [**Roo Code**](./roo-code) — Cline fork with `${env:VAR}` interpolation
- [**Continue**](./continue) — VS Code extension, config in `config.json`
- [**Augment Code**](./augment-code) — VS Code extension, `mcpServers` array schema

### Windsurf

- [**Windsurf**](./windsurf) — Cascade marketplace + `${env:VAR}` interpolation

### JetBrains

- [**JetBrains**](./jetbrains) — AI Assistant across IntelliJ, WebStorm, PyCharm, Rider

### opencode

- [**opencode**](./opencode) — `opencode.json` local server + `.opencode/skills/usm-workflow/SKILL.md` always-on skill

### Google

- [**Gemini CLI**](./gemini-cli) — httpUrl + SSE Accept header (use mcp-remote bridge)
- [**Antigravity**](./antigravity) — MCP Store + raw `mcp_config.json`

### Other editors

- [**Zed**](./zed) — `context_servers` + mcp-remote bridge
- [**Trae**](./trae) — ByteDance IDE, Cursor-compatible config schema
- [**Kiro**](./kiro) — AWS IDE, hot-reload on save, autoApprove per tool
- [**Kilo Code**](./kilo-code) — `.kilocode/mcp.json` with streamable-http transport

### Other CLIs / terminals

- [**Warp**](./warp) — AI terminal, STDIO-only + mcp-remote bridge
- [**Amp**](./amp) — Sourcegraph CLI, `amp mcp add` one-liner
- [**Amazon Q**](./amazon-q) — AWS Developer CLI, `/tools` + `/mcp` slash commands
- [**Qwen Code**](./qwen-code) — Alibaba CLI, Gemini-compatible httpUrl schema
- [**Crush**](./crush) — Charmbracelet TUI, top-level `mcp` object
- [**Factory**](./factory) — droid CLI, `droid mcp add` one-liner

### Desktop apps

- [**LM Studio**](./lm-studio) — Local-LLM desktop, STDIO bridge via mcp-remote
- [**BoltAI**](./boltai) — macOS AI chat, Settings → Plugins, STDIO bridge
- [**Perplexity**](./perplexity) — Desktop Connectors (Pro, Max, Enterprise only)

### Other

- [**Hermes**](./hermes) — Nous Research, YAML config at `~/.hermes/config.yaml`
- [**Rovo Dev**](./rovo-dev) — Atlassian Rovo CLI, `acli rovodev mcp`
- [**Zencoder**](./zencoder) — Agent tools menu, flat config
- [**Qodo Gen**](./qodo-gen) — Qodo agent, VS Code + IntelliJ, agentic mode
- [**Smithery**](./smithery) — Cross-client MCP installer, one command

---

## How it works

1. **Install USM** — `npm install -g @smithgray/usm`
2. **Configure your editor** — follow the guide for your editor above
3. **Install rules files** — `usm generate --only rules` (for editors that support always-on hooks)
4. **Prompt as usual** — your AI agent auto-discovers all 18 MCP tools

## What you get

- 18 MCP tools (9 read + 9 write) for spec-first development
- Always-on rules file enforces the spec-first workflow on every message (supported editors)
- Structured context uses 10-20x fewer tokens than raw codebase context

## Not listed?

If your editor speaks MCP, it'll work — feed the `usm mcp serve` command into whatever config file the client reads. For HTTP-only clients, use the `mcp-remote` npm adapter as a local bridge.