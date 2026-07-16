---
"@smithgray/usm": minor
---

Added the Agent Feedback Protocol and `usm upgrade`.

- **Agent Feedback Protocol** (`system.feedback`): a configurable policy (`human-gate` / `direct-to-feedback` / `direct-to-github`) that governs how AI agents report bugs and improvements, rendered into every agent-facing rules file (AGENTS.md, CLAUDE.md, .cursor/rules, copilot-instructions). Includes a hard rule against ad-hoc tracking files and a canonical `.usm/feedback/` location.
- **`usm_report_feedback` MCP tool** (tool #13): validates and writes structured `$type: feedback` entries, respecting the configured policy.
- **`usm feedback` CLI command**: interactive or flag-based setup of the feedback policy.
- **`usm upgrade` CLI command**: detects stale projects via a capability registry, compares the installed USM version against `system.usm.usm_version`, and offers guided or default setup of new capabilities (feedback is the first registered).
- **`usm_version` field**: dedicated field for USM-tool alignment (distinct from the project's own `version` and the schema `$version`).
- **`$type: feedback`**: new first-class schema file type for structured feedback entries.
- **Changesets**: added for package versioning; schema `$version` rules documented.
