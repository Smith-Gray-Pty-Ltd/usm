---
"@smithgray/usm": patch
---

fix(generators): single-pass Mermaid entity escaping — feature sequenceDiagrams now parse again

`escapeMermaidText()` ran chained HTML-entity replaces, so the `#` → `&#35;` pass re-escaped the `#` inside entities emitted earlier (`Dave's` rendered as `Dave&&#35;39;s` and failed to parse), and entity `;` terminated sequenceDiagram messages (grammar: `[^#\n;]+`). Now escapes in a single pass using Mermaid's own entity codes (`#39; #58; #124; #59;` …), which Mermaid encodes before lexing — so `' : | & < > " ; ( ) [ ] { } #` in flow step targets produce valid, parseable diagrams. Also: aliased participants are declared exactly once (no redundant bare `participant X`), `step.actor` is honoured (`system`/`agent` arrows come from Server, persona actors become their own participant), and expectation notes use `#58;`. Fixes #49.
