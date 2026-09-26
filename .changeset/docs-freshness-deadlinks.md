---
"@smithgray/usm": patch
---

**fix(docs): freshness, dead links, and concurrent serve — the 404 class**

Agents reported changes as applied while served sites 404ed. Three root
causes, all fixed:

- **Watch regeneration was partial**: it ran `generate --only docs`,
  leaving the sidebar (config.mts) and the help-docs tree stale — the
  agent saw "Regenerated docs (1 file changed)" while nav links 404ed.
  Watch now runs full generate (both streams) and refreshes config.mts
  for both trees, write-on-change (idempotent; VitePress reloads nav
  exactly when it changed).
- **`generate --only help-docs` deleted `.vitepress/` mid-serve**: the
  tree rebuild rmSync'd config.mts out from under a running help server —
  the single biggest 404 generator. `.vitepress/` is now preserved across
  the rebuild, and the filter refreshes config at the end.
- **Concurrent startups raced the bind**: two servers probing 5173
  simultaneously — first binds, second dies (strictPort). Auto-port mode
  now retries with a fresh probe (3 attempts) on bind failure; explicit
  `--port` stays strict.

Also: sidebar has a dedup + dead-link guard (zero repeated links, zero
links to non-existent files), user-docs guides are wired into both sites'
sidebars ("Guides" group, nested per persona), per-service risks pages no
longer link to a `/risks` page that does not exist (system.usm without
risks), and help feature pages no longer leak the Given/Then test DSL
(`Guarantees`/`Test specifications` stripped for help audience).

Verified: full link crawl of both trees — 152 dev + 81 help pages, **0
dead links, 0 duplicate nav items**; concurrent serve self-organized to
distinct ports (5177/5176), both HTTP 200, surviving a help-docs
regeneration mid-serve.