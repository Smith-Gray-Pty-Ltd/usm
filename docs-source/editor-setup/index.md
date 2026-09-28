# Editor Setup

Find your editor, copy the config, start the spec-first workflow. Works with every MCP-ready AI agent.

## Setup guides for every supported editor

35 guides — click any card to see the exact MCP config and rules file for that editor.

### Anthropic

- [**Claude Code**](/editor-setup/claude-code) — `claude mcp add` one-liner + CLAUDE.md always-on rules
- [**Claude Desktop**](/editor-setup/claude-desktop) — Custom Connectors UI, paste one URL, no restart

### OpenAI

- [**Codex**](/editor-setup/openai-codex) — TOML at `~/.codex/config.toml` + AGENTS.md rules
- [**ChatGPT**](/editor-setup/chatgpt) — Developer Mode apps (Pro, Plus, Team, Enterprise, Edu)

### Cursor

- [**Cursor**](/editor-setup/cursor) — `~/.cursor/mcp.json` + `.cursor/rules/usm-always.mdc` always-on rules

### VS Code family

- [**VS Code**](/editor-setup/vs-code) — `.vscode/mcp.json` per workspace + `.github/copilot-instructions.md`
- [**Visual Studio**](/editor-setup/visual-studio) — `.mcp.json` per solution (VS 2022 17.12+)
- [**Copilot Coding Agent**](/editor-setup/copilot-coding-agent) — Per-repo MCP configuration
- [**Copilot CLI**](/editor-setup/copilot-cli) — `~/.copilot/mcp-config.json` with tools
- [**Cline**](/editor-setup/cline) — VS Code extension, streamableHttp camelCase schema
- [**Roo Code**](/editor-setup/roo-code) — Cline fork with `${env:VAR}` interpolation
- [**Continue**](/editor-setup/continue) — VS Code extension, config in `config.json`
- [**Augment Code**](/editor-setup/augment-code) — VS Code extension, `mcpServers` array schema

### Windsurf

- [**Windsurf**](/editor-setup/windsurf) — Cascade marketplace + `${env:VAR}` interpolation

### JetBrains

- [**JetBrains**](/editor-setup/jetbrains) — AI Assistant across IntelliJ, WebStorm, PyCharm, Rider

### opencode

- [**opencode**](/editor-setup/opencode) — `opencode.json` local server + `.opencode/skills/usm-workflow/SKILL.md` always-on skill

### Google

- [**Gemini CLI**](/editor-setup/gemini-cli) — httpUrl + SSE Accept header (use mcp-remote bridge)
- [**Antigravity**](/editor-setup/antigravity) — MCP Store + raw `mcp_config.json`

### Other editors

- [**Zed**](/editor-setup/zed) — `context_servers` + mcp-remote bridge
- [**Trae**](/editor-setup/trae) — ByteDance IDE, Cursor-compatible config schema
- [**Kiro**](/editor-setup/kiro) — AWS IDE, hot-reload on save, autoApprove per tool
- [**Kilo Code**](/editor-setup/kilo-code) — `.kilocode/mcp.json` with streamable-http transport

### Other CLIs / terminals

- [**Warp**](/editor-setup/warp) — AI terminal, STDIO-only + mcp-remote bridge
- [**Amp**](/editor-setup/amp) — Sourcegraph CLI, `amp mcp add` one-liner
- [**Amazon Q**](/editor-setup/amazon-q) — AWS Developer CLI, `/tools` + `/mcp` slash commands
- [**Qwen Code**](/editor-setup/qwen-code) — Alibaba CLI, Gemini-compatible httpUrl schema
- [**Crush**](/editor-setup/crush) — Charmbracelet TUI, top-level `mcp` object
- [**Factory**](/editor-setup/factory) — droid CLI, `droid mcp add` one-liner

### Desktop apps

- [**LM Studio**](/editor-setup/lm-studio) — Local-LLM desktop, STDIO bridge via mcp-remote
- [**BoltAI**](/editor-setup/boltai) — macOS AI chat, Settings → Plugins, STDIO bridge
- [**Perplexity**](/editor-setup/perplexity) — Desktop Connectors (Pro, Max, Enterprise only)

### Other

- [**Hermes**](/editor-setup/hermes) — Nous Research, YAML config at `~/.hermes/config.yaml`
- [**Rovo Dev**](/editor-setup/rovo-dev) — Atlassian Rovo CLI, `acli rovodev mcp`
- [**Zencoder**](/editor-setup/zencoder) — Agent tools menu, flat config
- [**Qodo Gen**](/editor-setup/qodo-gen) — Qodo agent, VS Code + IntelliJ, agentic mode
- [**Smithery**](/editor-setup/smithery) — Cross-client MCP installer, one command

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