---
"@smithgray/usm": patch
---

The CLI reference now shows each command's real name (`init`, `scan`, `usm feedback`, …) instead of the internal feature `$id` slug (`cli-init`, `agent-feedback`). Added an optional `command` field to feature specs and backfilled the existing CLI commands; the docs generator prefers it, falling back to the slug when absent.
