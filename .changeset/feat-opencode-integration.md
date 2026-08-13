---
"@smithgray/usm": minor
---

Per-message workflow enforcement across AI coding tools — counters mid-session drift in long agent sessions. Two tiers per tool wherever a mechanism exists:

- **opencode**: `.opencode/skills/usm-workflow/SKILL.md` (description visible in the system prompt every message) + `.opencode/usm-instructions.md` iron rules wired into `opencode.json` `instructions` (injected into every request). Existing opencode.json config is preserved — only the USM entry is appended; JSONC configs are never touched.
- **Claude Code**: `.claude/skills/usm-workflow/SKILL.md` (same file — Claude Code uses the SKILL.md convention, description visible every message) alongside CLAUDE.md.
- **Cursor**: `.cursor/rules/usm-always.mdc` with `alwaysApply: true` (injected every request) alongside the glob-scoped detail rule.
- **Copilot**: `.github/instructions/usm-iron-rules.md` with broad `applyTo` alongside copilot-instructions.md.
- **Codex**: AGENTS.md only — the AGENTS.md standard has no per-message mechanism; documented limitation.

Iron-rules content is generated from one shared function so all tiers stay identical.
