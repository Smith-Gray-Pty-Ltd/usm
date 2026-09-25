---
"@smithgray/usm": minor
---

**feat: configurable output paths; reference docs hardened with tests**

Completes `usm/cli-config-outputs` and `usm/gen-roadmap`:

- Output locations (docs, help-docs, togaf, archimate, openapi, tests)
  are now configurable via `usmconfig.json` `outputs` section — all
  generators route through `outDir()`/`outPath()`; defaults unchanged
  (`.usm-workspace/…`)
- Reference pages (CLI, MCP, config, schema) covered by contract tests
  generated from this repo's own specs and JSON schemas
- Roadmap generation covered by tests: non-empty generation, feature
  links, sidebar dead-link + case guards, mermaid boot script

Completes `usm/gen-help-reference` contract tests as well.
383 tests passing across 21 files.