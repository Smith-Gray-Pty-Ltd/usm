---
"@smithgray/usm": patch
---

**fix(docs): default to auto-port selection; strict explicit ports**

Many USM projects run docs servers concurrently on one machine, and port
clashes were the real pain: VitePress silently escalated to port+1 when
its bind raced the pre-flight check, so the announced URL served the
WRONG project's docs (agents then verified the wrong server).

- Omitting `--port` now auto-selects the next free port from 5173
  (auto-port is the default; `--auto-port` flag removed)
- Explicit `--port N` is strict: fails loudly if taken
- VitePress always runs with `--strictPort`: announced URL == bound URL
- Port probe checks BOTH `::1` and `127.0.0.1` — VitePress binds
  localhost (`::1` on macOS), invisible to a 127.0.0.1-only probe;
  a wildcard-`::` probe passes even when `::1` is taken
- "already served" message reads the bound port from the port file,
  not the requested one