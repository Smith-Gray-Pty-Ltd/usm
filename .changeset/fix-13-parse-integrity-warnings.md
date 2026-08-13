---
"@smithgray/usm": patch
---

Add parse-integrity warnings to usm generate and usm validate — list entries (e.g. contracts) absorbed into a YAML block-scalar are detected and reported loudly instead of silently vanishing from generated docs. (fixes #13)
