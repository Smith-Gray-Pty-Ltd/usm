---
name: usm-workflow
description: Enforces the USM spec-first workflow — read .usm specs before code changes, draft a spec before building any new feature, update feature status after implementation, and route feedback by scope (this project vs the USM tool itself). Invoke before starting any feature, refactor, or bug fix; when unsure whether a change needs a .usm spec; when touching files listed in a feature's implementation paths; and to re-anchor a long session that has drifted off the workflow.
---

# USM Workflow Enforcement

You are working in a USM-managed project. The .usm/ directory is the source of
truth — code and specs must not drift. Work through this checklist.

## Pre-flight (before ANY code change)

1. Identify the feature/module the change belongs to.
2. Find its spec:
   - `usm_search "<feature keywords>"` or `usm_list` to locate the .usm file
   - `usm_read` the spec — read its contracts and flows before editing
3. If touching a file listed in a spec's `implementation:` paths, the spec
   governs the behaviour you are about to change. Check its contracts first.

## New feature work — draft BEFORE building

1. Discuss the feature with the human.
2. `usm_draft_feature` with structured fields (summary, intent, flows,
   contracts, tests).
3. Show the human the generated markdown preview — ALWAYS the markdown, not
   the YAML. Do not write to disk without approval.
4. On approval: `usm_write_feature`, then implement.
5. After implementing: `usm_update_feature_status` → built, with the
   implementation paths.

## Updating existing behaviour

1. Read the spec first (`usm_read`) — its contracts are acceptance criteria.
2. Make the code change.
3. `usm_update_feature` if behaviour changed (id-bearing arrays merge by id —
   pass only new/changed items).
4. `usm_update_feature_status` if the status changed.

## Hard rules

- NEVER hand-write .usm files — use the MCP write tools (they validate).
- NEVER write a spec to disk without showing the human the markdown preview.
- NEVER let code and spec drift — if you changed behaviour, update the spec in
  the same session.
- The .usm file IS the documentation — if it's wrong, the docs are wrong.

## Feedback — classify scope FIRST

- Bug in THIS project (app code, infra, this repo's .usm specs) → follow the
  Agent Feedback Protocol in AGENTS.md.
- Bug in the USM tool itself (CLI, MCP tools, generators, schema) → upstream:
  https://github.com/Smith-Gray-Pty-Ltd/usm/issues — never this repo's tracker.
- NEVER create ad-hoc tracking files (bugs.md, ISSUES.md, TODO-agent.md).

## Re-anchoring a drifted session

If you notice you have been editing code without consulting specs, or the
conversation has wandered from the agreed feature: STOP. List what has changed
so far, `usm_read` the governing spec(s), reconcile any drift (code or spec),
then continue. Drift compounds — correcting early is cheap.
