---
"@smithgray/usm": patch
---

Fix generator idempotency, schema drift, and docs-generation bugs (#29, #32,
#33, #34, #35, #36, #37).

**Idempotent AGENTS.md (#32):** the marker smart-merge re-appended the previous
run's trailing newline, so `AGENTS.md` grew one byte per `usm generate` and
`generate --check` could never pass. The merge now normalises whitespace around
the end marker while preserving genuine hand-written content after it.

**`$type: data` is a real file type (#33):** `UsmFileType` and the `DataUsm`
interface advertised `data`, and the docs pipeline consumed it, but the schema
omitted it — so `usm validate` rejected any file declaring it. Adds
`$defs.dataFile` (mirroring `DataUsm`), adds it to the `oneOf`, adds a
`dataFile` branch to the validator discriminator, and exports an `isDataFile`
guard. A regression test asserts every schema discriminator type validates.

**One writer for `data/models.md` (#37):** the data-model generator and the
ER-diagram generator both wrote `.usm-workspace/docs/data/models.md`, and the
ER generator derived its output by reading the file it was about to overwrite —
so `generate --check` reported it stale forever. The ER section is now a pure
function of the Prisma schema (`buildERDiagramSection`) composed by the
data-model generator; the standalone `er-diagram` pass is removed.

**Surface-table and test-spec `--check` convergence:** the surface-table pass
was skipped in check mode, and `generateAllTestSpecs` resolved source paths by
substring `$id` matching (so `usm/cli-scaffold` matched
`usm/cli-scaffold-project`), colliding two features on one output path. Both are
fixed; the check pass now compares the final composed content.

**Feature docs in the root workspace (#35):** area-overview stubs were written
to `apps/<service>/.usm-workspace/docs/…`, creating a stray nested workspace and
leaving the root docs tree incomplete after a plain `usm generate`. They now
write to the root `.usm-workspace/docs/features/`.

**Sidebar completeness (#36):** a feature area that had an `index.md` rendered
as a bare index link and its feature pages were silently omitted. The sidebar
now enumerates every page in every area uniformly.

**Docs URL + identity (#34):** `usm docs serve` now prints the serving project
name and the URL-shape rule (namespace dropped, `$system` ignored), and the MCP
write tools return `docs_url` / `docs_path` / `docs_hint` so agents return a
correct link instead of guessing.

**Fixture test hang on macOS (#29):** `runUsm` used synchronous `execSync`,
which blocks the event loop so vitest's `testTimeout` could never fire; the
fixture suite now uses async `execFile` and completes on macOS (170 tests).
