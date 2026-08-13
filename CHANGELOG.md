# Changelog

## 0.5.0

### Minor Changes

- beb7876: Anti-drift docs tooling — hand-written surfaces stop rotting. New `usm generate --only readme-facts` target smart-merges a `USM:FACTS` block into README.md (version, CLI commands, MCP tool count) derived from package.json and feature-spec `command` fields. The MCP reference now documents all 14 tools (comma-bundled `command` fields split per tool, `usm_query` and `usm_report_feedback` specs added), the CLI reference documents `query`, `import`, and `feedback` via new usage/options spec blocks (with a filter so usm\_-prefixed tool specs never appear as CLI commands), and the agent setup guide lists the full two-tier rules-file output per tool. Marketing site (usm.dev) version badge and tool counts now derive from package.json; stale Alpha v0.1.0/12-tool/Codex-only claims corrected everywhere.

## 0.4.0

### Minor Changes

- 3bb24a2: Scope-aware feedback routing — the Agent Feedback Protocol, the docs feedback page, and the `usm_report_feedback` MCP tool now explicitly distinguish bugs in the consuming project from bugs in the USM tool itself (CLI/MCP/generators/schema). Tool bugs route upstream to https://github.com/Smith-Gray-Pty-Ltd/usm/issues (overridable via the new optional `feedback.upstream_tracker` field in system.usm) and are never filed against the consuming project's tracker.
- 271f896: Internal DSL builder — fluent TypeScript that compiles to validated .usm specs: `defineFeature("org/slug", { system, service }).summary(...).flow(id, f => f.step(...)).contract(id, c => c.mustHave(...)).build()` returns `{ yaml, object, valid, errors }`, with `defineService` and `writeFeature` (refuses invalid specs) exported from the package entry. Extends existing parsed specs via `FeatureBuilder.adopt` — flows/contracts/tests upsert by id. Per Fowler: an expression builder over the semantic model — the .usm format stays canonical.
- 3bb24a2: Per-message workflow enforcement across AI coding tools — counters mid-session drift in long agent sessions. Two tiers per tool wherever a mechanism exists:

  - **opencode**: `.opencode/skills/usm-workflow/SKILL.md` (description visible in the system prompt every message) + `.opencode/usm-instructions.md` iron rules wired into `opencode.json` `instructions` (injected into every request). Existing opencode.json config is preserved — only the USM entry is appended; JSONC configs are never touched.
  - **Claude Code**: `.claude/skills/usm-workflow/SKILL.md` (same file — Claude Code uses the SKILL.md convention, description visible every message) alongside CLAUDE.md.
  - **Cursor**: `.cursor/rules/usm-always.mdc` with `alwaysApply: true` (injected every request) alongside the glob-scoped detail rule.
  - **Copilot**: `.github/instructions/usm-iron-rules.md` with broad `applyTo` alongside copilot-instructions.md.
  - **Codex**: AGENTS.md only — the AGENTS.md standard has no per-message mechanism; documented limitation.

  Iron-rules content is generated from one shared function so all tiers stay identical.

- 271f896: Query layer over .usm data — `usm query "features where status = planned and contracts = 0"` in the CLI and a new `usm_query` MCP tool (read-only, results capped). A tiny predicate grammar (selectors, = != > < >= <=, ~ contains, has, and/or/not with parens) evaluated against parsed .usm files — typed impact analysis and drift checks instead of grepping raw YAML. Absent fields are false, never errors.
- 271f896: Structurizr bridge — `usm import <workspace.json>` converts a Structurizr workspace export into .usm system + service specs (guards existing files, `--force`/`--dry-run`/`--id`/`--domain` flags, service type inferred from technology), and `usm generate --only structurizr` exports the reverse: a Structurizr DSL workspace with softwareSystem → containers (services) → components (features, status-badged). Import JSON now; DSL-grammar parsing deferred until demand is demonstrated.

### Patch Changes

- cd32928: Fix contradictory feedback guidance in self-referential projects — when the consuming repo's tracker IS the USM upstream tracker (i.e. the USM repo itself), the generated protocol named the same URL as both "file tool bugs here" and "never file them here". The generator now detects the collision and collapses to coherent single-tracker text; downstream repos (different trackers) keep the full two-scope table unchanged.

## 0.3.1

### Patch Changes

- 411f24a: Fix docs sidebar omitting Features — flat feature specs and area-overview pages are now discovered from the docs/features directory instead of relying solely on nested system.index refs; docExists also recognises <path>/index.md. (fixes #11)
- 411f24a: Release the fixed Mermaid renderer in generated VitePress docs — the dynamic CDN loader with MutationObserver (SPA nav) and dark-mode re-render landed hours after 0.3.0 was published, so 0.3.0 users still had the broken boot script that raced Shiki. Verified rendering end-to-end in a browser against a static build. (fixes #12)
- 411f24a: Add parse-integrity warnings to usm generate and usm validate — list entries (e.g. contracts) absorbed into a YAML block-scalar are detected and reported loudly instead of silently vanishing from generated docs. (fixes #13)
- 411f24a: Fix MCP usm_update_feature silent data loss — id-bearing arrays (contracts, flows, tests, decisions) now merge by id instead of being replaced wholesale; replacement requires the explicit new `replace` param. Response reports merge_details per field. (fixes #14)

## 0.3.0

### Minor Changes

- cd3072f: Help-docs polish: rich data-driven homepage (hero, Mermaid workflow, principle cards, featured example), comprehensive schema reference (field-by-field from schema/v1.json with collapsible details), upgraded Getting Started (tabbed commands, first-run issues), restructured help sidebar (Getting Started / Core Concepts / Workflows / Generated Outputs / Roadmap / Contributing), and dark-mode-aware Mermaid + version/timestamp footer.

## 0.2.3

### Patch Changes

- d8e373a: The MCP tools reference now shows each tool's real name (`usm_read`, `usm_list`, `usm_get_contracts`, …) instead of the internal feature `$id` slug (`mcp-read`, `mcp-list`). The write-tools entry lists all four tools it covers. The shared `command` field's description now covers MCP tool names as well as CLI commands.

## 0.2.2

### Patch Changes

- 14a3afd: The CLI reference now shows each command's real name (`init`, `scan`, `usm feedback`, …) instead of the internal feature `$id` slug (`cli-init`, `agent-feedback`). Added an optional `command` field to feature specs and backfilled the existing CLI commands; the docs generator prefers it, falling back to the slug when absent.

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
