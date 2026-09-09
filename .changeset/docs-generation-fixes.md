---
"@smithgray/usm": patch
---

Fix docs generation: feature markdown output path and watch mode.

**Feature markdown output path (#24, #25 items 1 & 2):** feature docs were
written to `apps/<service>/.usm-workspace/docs/features/` while every other
generator writes to the root `.usm-workspace/docs/`. This caused system-level
features (`$service === $system`, e.g. `smith-gray-ai/system`) to route to a
phantom `apps/system/` directory, and left all feature docs invisible to the
VitePress sidebar (only 2 of 36 features appeared, because the serve-time
`consolidateFeatureDocs` band-aid only rescued a couple). Feature docs now
write to the root `.usm-workspace/docs/features/<area>/<slug>.md`, matching
the other generators; the sidebar auto-discovers all features.

Also fixes a latent bug found during investigation: `APP_DIRS` / `KNOWN_APP_DIRS`
were declared empty and never populated, silently disabling six per-app
aggregator generators (surface tables, per-app decisions, API reference,
contracts, UI map, test specs). App dirs are now derived from service files
and feature `$service` values.

**Watch mode (#25 item 3):** `usm docs serve --watch` did not pick up new `.usm`
files in newly-created subdirectories — the watcher walked `.usm/` once at
startup and registered non-recursive `fs.watch` on existing dirs only. Replaced
with `fs.watch({ recursive: true })` on `.usm/` (with a defensive per-directory
fallback that registers watchers for new subdirs on platforms without
recursive support).