---
"@smithgray/usm": minor
---

Add VitePress as devDependency, Smithery MCP server card, and clean up CI.

**VitePress dependency:**
- VitePress was already an optional peer dependency but not installed by default
- Added to devDependencies so `pnpm install` includes it — the docs commands
  (`usm docs serve`, `usm docs build`) are core CLI features
- Removed the manual `pnpm add -D vitepress` step from the CI docs workflow
- The existing `requireVitePress()` helper in docs.ts already handles the
  "not installed" case with a helpful install prompt

**Smithery MCP registry:**
- Added `.well-known/mcp/server-card.json` — static server card describing
  all 18 MCP tools with their input schemas
- Smithery reads this to list USM in their MCP server registry at
  smithery.ai — the primary discovery platform for MCP servers
- Submit at smithery.ai/new using our GitHub repo URL