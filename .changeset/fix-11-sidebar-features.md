---
"@smithgray/usm": patch
---

Fix docs sidebar omitting Features — flat feature specs and area-overview pages are now discovered from the docs/features directory instead of relying solely on nested system.index refs; docExists also recognises <path>/index.md. (fixes #11)
