---
"@smithgray/usm": minor
---

Scope-aware feedback routing — the Agent Feedback Protocol, the docs feedback page, and the `usm_report_feedback` MCP tool now explicitly distinguish bugs in the consuming project from bugs in the USM tool itself (CLI/MCP/generators/schema). Tool bugs route upstream to https://github.com/Smith-Gray-Pty-Ltd/usm/issues (overridable via the new optional `feedback.upstream_tracker` field in system.usm) and are never filed against the consuming project's tracker.
