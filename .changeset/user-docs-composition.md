---
"@smithgray/usm": minor
---

**feat: personas, journey flows, composed user docs, e2e skeletons**

Restores the founding vision — user documentation COMPOSED from spec data
(never filtered from developer content):

- Schema: `personas[]` on system.usm (id, name, description); `actor` +
  `surface` on flows and steps. Flows referencing a persona are journeys;
  flows without an actor stay pipelines (developer stream, byte-identical
  output for existing projects)
- New generator: per-persona guide pages + per-journey guides — persona
  steps render as instructions, system/agent steps as "the system will …"
- E2E: journey flows with linked `tests[].flow` emit Playwright skeletons
  under `tests/auto-generated/e2e/` (collision-free, exact-$id paths);
  tests without a flow reference continue as Vitest-only
- Cross-file validation: a flow actor that references an undeclared
  persona is a hard error in `usm generate` (typo protection — a typo'd
  persona would silently drop the journey)
- Help docs: feature pages embed composed "Step-by-step guides" sections;
  the subtraction filter remains authoritative for system-level pages.
  Projects with zero personas get byte-identical help output
- USM dogfoods: personas + annotated flows in its own spec; the
  gen-user-docs spec's flows carry actor/surface

396 tests passing across 22 files (13 new acceptance tests covering the
spec's six contract blocks).