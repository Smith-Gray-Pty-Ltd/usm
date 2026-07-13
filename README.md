# USM — Universal System Map

> A shared map that humans and AI agents maintain together.
>
> **🌐 <https://usm.dev>**

## The Problem

Agentic coding has no shared artifact between human intent and agent output. The
human describes what they want in chat. The agent writes code. The code is the
only artifact. If the agent gets it wrong, you iterate in chat — and the
discussion is lost. Meanwhile, docs go stale because nobody updates them after
the code changes.

## The Workflow

USM inverts the loop. **Write the spec first, then build from it.**

```
Discuss feature → Agent writes .usm spec → Human reviews docs → Agent builds → Documented
```

The `.usm` file is:
- **The spec** — the agent writes it before coding, so the human reviews
  intent, not implementation
- **The contract** — flows, contracts, and tests define what "done" means
- **The documentation** — it persists after the code is written, automatically
- **The onboarding** — the next agent session reads it and understands context

No stale docs. No lost discussions. One source of truth.

## What USM Generates

A single `.usm/` directory of YAML files (validated by a JSON Schema) produces:

- **Markdown docs** for human review
- **Mermaid diagrams** (architecture, sequence, ER, dependencies)
- **OpenAPI 3.1** specs
- **ArchiMate 3.1** / **TOGAF** deliverables for enterprise architecture
- **Vitest test specs** from feature `tests[]` and `flows[]`
- **AGENTS.md** with USM-augmented context for AI coding agents

## Quick Start

```bash
# Install
npm install -g @smithgray/usm

# Initialize a .usm/ scope in your project
usm init

# Scan your codebase for routes, services, and structure
usm scan

# Generate markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, test specs
usm generate

# Validate .usm files against the schema
usm validate

# Start the MCP server (for AI agents — Claude, Cursor, Codex)
usm mcp serve
```

## Example

A feature spec that an agent would draft for human review:

```yaml
# .usm/features/auth/login.usm
$schema: https://usm.dev/schema/v1.json
$id: my-app/login
$type: feature
$version: 1
$last_updated: 2026-06-22
summary: Login flow — authentication entry point for the app.
$system: my-app/system
$service: my-app/web
intent: |
  Users need to authenticate before accessing protected resources.

flows:
  - id: login-with-email
    name: Login with email and password
    steps:
      - id: s1
        action: navigate
        target: /login
      - id: s2
        action: fill
        target: email and password fields
      - id: s3
        action: submit
        target: login form
      - id: s4
        action: observe
        target: redirect to dashboard

contracts:
  - id: invalid-credentials-rejected
    description: Invalid credentials show an error, not a redirect
    must_have:
      - "Returns 401 for wrong password"
      - "Returns 404 for unknown email"
      - "No session token set on failure"

tests:
  - id: valid-login-succeeds
    setup:
      user_exists: true
      correct_password: true
    expect:
      - assertion: response is 302 redirect to /dashboard
      - assertion: session cookie set
```

The human reviews the generated markdown. The agent builds from the spec. The
spec becomes the docs.

## Architecture

USM is a single Node.js package with three entry points:

- **`usm` CLI** — `init`, `scan`, `validate`, `generate`, `enrich`, `scaffold`,
  `scaffold-project`, `roundtrip`, `info`, `mcp serve`, `generate:togaf`,
  `generate:archimate`
- **MCP server** — 12 tools (`list`, `read`, `search`, `validate`, `summary`,
  `references`, `contracts`, `flows`, `draft_feature`, `write_feature`,
  `update_feature`, `update_feature_status`) for AI agents to navigate, search,
  and author your system
- **Generators** — markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, AGENTS.md,
  Vitest specs — all derived from the same `.usm` source

USM distributes as an **MCP server plus rules files** — it integrates with the
tools you already use (Cursor, Claude Code, Codex, GitHub Copilot) rather than
replacing them.

## Documentation

Full docs: **<https://usm.dev>** (generated from this repo's own `.usm/` files —
USM describes itself).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup (Node 22+, pnpm 11+)
- Spec-first workflow for contributors (dogfood USM to spec your changes)
- Code standards (ESLint, TypeScript strict, conventional commits)
- PR process and checklist
- How to add generators, languages, and MCP tools

Quick start:
```bash
git clone git@github.com:YOUR_USERNAME/usm.git
cd usm && pnpm install && pnpm run build && pnpm run test
```

[Open an issue](https://github.com/Smith-Gray-Pty-Ltd/usm/issues) · [Start a discussion](https://github.com/Smith-Gray-Pty-Ltd/usm/discussions)

## License

MIT © 2026 Smith & Gray Pty Ltd — see [LICENSE](LICENSE).
