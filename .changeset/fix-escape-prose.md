---
"@smithgray/usm": patch
---

Fix VitePress build failure on the developer docs audience — spec prose containing angle-bracket examples (e.g. `<this repo>`) was emitted raw, and Vue's template compiler rejected it as an unclosed HTML tag ("Element is missing end tag"). New `escapeProse` escapes angle brackets in generated summary/intent prose while allowing genuine inline HTML; the developer docs site (new dev-docs.usm.dev) now builds cleanly.
