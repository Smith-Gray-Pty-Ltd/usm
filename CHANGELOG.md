# Changelog

## 0.2.1

### Patch Changes

- a75048b: Fixed the changeset release workflow so version PRs are created automatically. The release action now uses a real user token (CS_GITHUB_TOKEN) instead of the default GITHUB_TOKEN, which both bypasses the org-level block on Actions creating PRs and avoids the `action_required` approval step on the resulting CI runs.

## 0.2.0

### Minor Changes

- ce4311f: Added the Agent Feedback Protocol and `usm upgrade`.

  - **Agent Feedback Protocol** (`system.feedback`): a configurable policy (`human-gate` / `direct-to-feedback` / `direct-to-github`) that governs how AI agents report bugs and improvements, rendered into every agent-facing rules file (AGENTS.md, CLAUDE.md, .cursor/rules, copilot-instructions). Includes a hard rule against ad-hoc tracking files and a canonical `.usm/feedback/` location.
  - **`usm_report_feedback` MCP tool** (tool #13): validates and writes structured `$type: feedback` entries, respecting the configured policy.
  - **`usm feedback` CLI command**: interactive or flag-based setup of the feedback policy.
  - **`usm upgrade` CLI command**: detects stale projects via a capability registry, compares the installed USM version against `system.usm.usm_version`, and offers guided or default setup of new capabilities (feedback is the first registered).
  - **`usm_version` field**: dedicated field for USM-tool alignment (distinct from the project's own `version` and the schema `$version`).
  - **`$type: feedback`**: new first-class schema file type for structured feedback entries.
  - **Changesets**: added for package versioning; schema `$version` rules documented.

All notable changes to USM are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-23

### Alpha Release

USM is in alpha. The spec-first workflow, MCP tools, and docs generation are
functional but the API and schema may change before 1.0.

### Added

- Spec-first workflow: discuss → agent writes .usm → human reviews → agent builds
- `usm generate` — produce markdown, OpenAPI, Mermaid, ArchiMate, TOGAF, AGENTS.md, Vitest specs
- `usm generate --only <target>` — generate a specific output only
- `usm docs serve/build` — VitePress docs with `--audience help|developer` split
- `usm generate --only help-docs` — filtered public docs (hide planned features, contracts, tests)
- MCP server with 12 tools: 8 read (list, read, search, validate, summary, references, contracts, flows) + 4 write (draft_feature, write_feature, update_feature, update_feature_status)
- `usm init` — analyze repo and generate usmconfig.json
- `usm scan` — auto-discover routes, services, and components in your codebase
- `usm enrich` — LLM-powered semantic enrichment (LiteLLM, OpenAI, Anthropic, Ollama)
- `usm validate` — validate .usm files against the v1 JSON Schema (with $version warnings)
- `usm scaffold` / `usm scaffold-project` — starter .usm files
- Configurable output paths in usmconfig.json
- Rules file generation (.cursor/rules, CLAUDE.md, copilot-instructions.md)
- Help docs reference pages (CLI, config, schema, MCP tools)
- Roles field in system schema
- ADR-style decision recording (alternatives, consequences)
- Roadmap with feature links and shipped_in version tracking
- Smart-merge preserves human edits during scan
- Self-hosting: USM describes itself (`.usm/` in this repo)
- Cloudflare Pages deployment workflow for usm.dev
- VitePress integration with search, edit links, and auto-generated sidebar

### Migrated from @smith-gray/usm v0.1.0

- Same codebase, but now:
  - Public package: `@smithgray/usm` (was `@smith-gray/usm` private)
  - Standalone repo: `github.com/Smith-Gray-Pty-Ltd/usm`
  - MIT licensed
  - With public docs site: usm.dev

## [1.0.0-renamed] - 2026-06-29

### Renamed to `@smithgray/usm`

- Package renamed from `@~usm/core` (unusual `~` org name) to `@smithgray/usm` (proper npm org under Smith & Gray account)
- Old `@~usm/core@1.0.0` marked deprecated with redirect message to the new package name
- Install URL bug note: `npm install @smithgray/usm` may fail with a 404 due to a known npm CLI URL-encoding issue with org names without hyphens. Workaround:

  ```bash
  # Install via direct tarball
  npm install https://registry.npmjs.org/@smithgray/usm/-/usm-0.1.0.tgz

  # OR pin to a specific version
  npm install '@smithgray/usm@0.1.0'
  ```
