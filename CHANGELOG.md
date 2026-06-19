# Changelog

All notable changes to USM are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-19

### Added
- Initial public release of USM as a standalone package
- `usm init` — initialize a new `.usm/` scope in the current directory
- `usm scan` — auto-discover routes, methods, and components in your codebase
- `usm enrich` — LLM-powered semantic naming and structure
- `usm generate` — produce markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, AGENTS.md, Vitest specs
- `usm validate` — validate the current scope against the JSON Schema
- `usm-mcp` — MCP server with 12 tools for AI agents
- JSON Schema v1 with full validation
- Generators: markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, AGENTS.md, Vitest specs
- Smart-merge preserves human edits during scan
- Self-hosting: USM can describe itself (`.usm/` in this repo)
- Cloudflare Pages deployment workflow for usm.dev

### Migrated from @smith-gray/usm v0.1.0
- Same codebase, but now:
  - Public package: `@usm/core` (was `@smith-gray/usm` private)
  - Standalone repo: `github.com/Smith-Gray-Pty-Ltd/usm`
  - MIT licensed
  - With public docs site: usm.dev
