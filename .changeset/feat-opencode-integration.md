---
"@smithgray/usm": minor
---

opencode first-class support in `usm generate` — emits `.opencode/skills/usm-workflow/SKILL.md` (description visible in the system prompt every message) plus `.opencode/usm-instructions.md` wired into `opencode.json` `instructions` (injected into every request). Counters mid-session workflow drift in long agent sessions. Existing opencode.json config is preserved — only the USM instructions entry is appended; JSONC configs are left untouched.
