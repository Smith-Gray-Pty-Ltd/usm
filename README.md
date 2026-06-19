# USM — Universal System Map

> Structured source of truth for agentic systems.

A single `.usm/` directory describes your whole system — apps, services,
features, flows, contracts, decisions — in YAML files validated by a JSON
Schema. From that one source, USM generates:

- **Markdown docs** (renders natively on GitHub / GitHub Pages)
- **Mermaid diagrams** (architecture, sequence, ER, dependencies)
- **OpenAPI 3.1** specs
- **ArchiMate 3.1 / XMI 2.1** for enterprise-architecture tools (Archi, BiZZdesign, Orbus iServer)
- **TOGAF deliverables** (Principles, Architecture Vision, etc.)
- **Vitest test specs** from `tests[]` and `flows[]`
- **AGENTS.md** with USM-augmented context for AI coding agents
- **MCP server** for Claude, Cursor, Codex, and other AI agents

## Why

Traditional docs are scattered, stale, and unreadable to agents. USM is:

- **Structured** — every field is in a JSON Schema, validated on every change
- **Agent-first** — the same files feed an MCP server that lets AI agents navigate your system
- **Human-readable** — the same files generate GitHub-flavored markdown
- **Idempotent** — `usm scan` and `usm generate` are safe to run repeatedly; smart-merge preserves human edits

## Quick Start

```bash
# Install
npm install -g @usm/core
# or
pnpm add -g @usm/core

# Initialize a new USM scope in the current directory
usm init

# Scan your codebase for routes, methods, and components
usm scan

# Enrich with LLM (optional, requires LiteLLM or similar proxy)
usm enrich

# Generate everything: markdown, OpenAPI, Mermaid, ArchiMate, etc.
usm generate

# Validate the current scope
usm validate

# Browse via the MCP server (for AI agents)
usm-mcp
```

## Example

A minimal `system.usm`:

```yaml
$schema: https://usm.dev/schema/v1.json
$id: my-app/system
$type: system
$version: 1
$last_updated: 2026-06-19
summary: My application — a simple REST API
name: My App
type: web-app
tech_stack: [TypeScript, Next.js, PostgreSQL]
```

A feature file `features/agent/events.usm`:

```yaml
$schema: https://usm.dev/schema/v1.json
$id: my-app/agent-events
$type: feature
$version: 1
$last_updated: 2026-06-19
summary: Emit and subscribe to real-time events
name: Agent Events
parent: my-app/agent
flows:
  - id: emit-event
    steps:
      - actor calls POST /api/agent/events
      - system validates payload
      - system broadcasts to subscribers
tests:
  - given: a valid event payload
    when: client POSTs to /api/agent/events
    then: server returns 202 Accepted
```

## Architecture

USM is a single Node.js package with multiple entry points:

- **`@usm/core`** — the main library, JSON Schema, parsers, validators
- **`usm` CLI** — `init`, `scan`, `enrich`, `generate`, `validate`
- **Generators** — markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, AGENTS.md, Vitest specs
- **MCP server** — 12 tools for AI agents to navigate, search, and reference USM data

## Documentation

Full docs: <https://usm.dev> (deployed via Cloudflare Pages from this repo's `docs/` folder)

For the scanner design, see [`docs/SCANNER-DESIGN.md`](docs/SCANNER-DESIGN.md).

## Contributing

Issues and PRs welcome. See [issues](https://github.com/Smith-Gray-Pty-Ltd/usm/issues).

## License

MIT © 2026 Smith & Gray Pty Ltd — see [LICENSE](LICENSE).
