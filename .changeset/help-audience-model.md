---
"@smithgray/usm": patch
---

**fix(docs): help docs = user journey only (audience model)**

Confirmed audience model: help docs serve USM adopters and downstream end
users (the user journey); developer docs serve contributors with full
detail. Help now excludes contributor-facing content:

- code-navigator, orphan-files, spec-coverage → developer docs only
- entire design/ architecture section → developer docs only (sidebar
  group and files)
- help keeps: getting-started, agent setup, CLI/MCP/schema/config
  references, roadmap (with shipped_in), language-support, feedback,
  and the composed persona guides

Recorded as decision `docs-audience-model` + contract
`help-docs-user-journey-only` on usm/gen-docs-split. Help tree: 81 → 68
files, sidebar now Getting Started → Guides → Project Management →
Features → CLI → Developers → Help. Link crawl: 0 dead, 0 dup both sites.