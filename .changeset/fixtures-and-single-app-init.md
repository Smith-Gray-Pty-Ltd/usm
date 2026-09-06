---
"@smithgray/usm": minor
---

Fix `usm init` to detect single-app vs monorepo layouts and add 7 fixture codebases for integration testing.

**`usm init` improvements:**
- Detect monorepo (apps/* or packages/* exist) vs single-app layout (root package.json/go.mod/Cargo.toml/pyproject.toml/requirements.txt)
- For single-app repos: register the root as a single service and set source include to ['src'] (or ['.'] if no src/)
- For monorepo apps/: detect Go (go.mod), Rust (Cargo.toml), and Python (pyproject.toml/requirements.txt) in addition to package.json
- Strip any npm org scope from project name (not just @smith-gray/)

**OpenAPI generator fix:**
- Write openapi-types.ts to .usm-workspace/openapi/ instead of packages/types/src/ (which polluted single-app repos and broke monorepo detection on re-scan)

**Fixture tests (tests/fixtures.test.ts):**
- 7 fixture codebases in examples/ covering: nextjs-single-app, turborepo-monorepo, go-api, python-fastapi, express-api, prisma-monorepo, multi-lang
- 35 tests: init detection, scan structure, generate output, golden file comparison, idempotency
- Each fixture has committed .usm/ golden files — tests verify scan output matches
- All 201 tests pass (166 existing + 35 new)