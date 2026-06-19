# USM Scanner Design

> Design doc for `usm scan` — the command that generates `.usm` files from a codebase.
> Captures the user-facing workflow, the scanner's self-discovering behavior,
> and the smart-merge semantics.

## User Workflow (first-time USM in a repo)

The three-command experience:

```bash
cd my-repo

# 1. Install
pnpm add -D @smith-gray/usm

# 2. Initialize — creates usmconfig.json + the .usm/ directory structure
pnpm usm init

# 3. Scan — discovers services, packages, routes; writes per-service .usm/ files
pnpm usm scan

# 4. Generate docs
pnpm usm generate
```

For a monorepo, the same commands work — `pnpm usm scan` from the root discovers all `apps/*`, `infrastructure/services/*`, and `packages/*`.

## Design Principles

1. **Self-discovering** — the scanner finds USM scopes automatically from the file system. No config required for the common case.
2. **Per-service** — each app/service/package gets its own `.usm/` directory. The scanner writes to the right place based on the file's path.
3. **Smart-merge by default** — the scanner never overwrites hand-curated content. Fields marked `TODO: describe` are filled in by the LLM enrich step, not the scanner.
4. **Config is OPTIONAL** — `usmconfig.json` provides overrides for special cases (excludes, custom matchers). The scanner has sensible defaults.
5. **Idempotent** — running `usm scan` repeatedly is safe. No state is created outside `.usm/` files.

## Auto-Discovery Rules

The scanner looks for these patterns in the repo:

| Pattern | Discovered as | Output USM scope |
|---|---|---|
| `apps/*/app/` (Next.js) | web-app service | `apps/{name}/.usm/` |
| `apps/*/src/` (Express, FastAPI, etc.) | backend service | `apps/{name}/.usm/` |
| `apps/*/Cargo.toml` (Rust) | backend service | `apps/{name}/.usm/` |
| `apps/*/pyproject.toml` (Python) | backend service | `apps/{name}/.usm/` |
| `infrastructure/services/*/` | shared service | `infrastructure/services/{name}/.usm/` |
| `packages/*/package.json` (or `pyproject.toml`, `Cargo.toml`) | shared package | `packages/{name}/.usm/` |
| `packages/db/prisma/schema.prisma` | data model | `packages/db/.usm/data/{name}.usm` |
| Anything else | ignored (with warning) | — |

Existing `.usm/` directories (manually created) are detected as additional scopes.

## Output: Per-Project `.agents-workspace/`

The generated docs (the `pnpm usm generate` output) live in `.agents-workspace/`. This directory is **1:1 with a "project" in the architect app**:

- A project in the architect app has a `monorepoRoot` + `workspacePath`
- The project's docs are at `{monorepoRoot}/{workspacePath}/.agents-workspace/`
- The architect app's docs viewer reads from this path

So:
- The platform project (`proj-smith-gray-platform`) has workspacePath = `.` → docs at `.agents-workspace/` (monorepo root)
- The architect project has workspacePath = `apps/the-architect` → docs at `apps/the-architect/.agents-workspace/`
- The tenant project has workspacePath = `apps/tenant` → docs at `apps/tenant/.agents-workspace/`
- etc.

**`.agents-workspace/` is created ONLY for projects, not for every package or service.**

### Per-Project Output Paths

| USM scope | Output `.agents-workspace/` path |
|---|---|
| Monorepo root (platform) | `.agents-workspace/` (the platform project's docs) |
| `apps/the-architect` | `apps/the-architect/.agents-workspace/` |
| `apps/tenant` | `apps/tenant/.agents-workspace/` |
| `infrastructure/services/zitadel` | `.agents-workspace/docs/shared-services/zitadel/` (under platform project) |
| `packages/auth` | `.agents-workspace/docs/packages/auth/` (under platform project) |

**Shared services and packages** don't get their own `.agents-workspace/` directory. Their generated docs go under the platform project's `.agents-workspace/docs/{shared-services,packages}/{name}/`.

This avoids the previous bug (commit `7a64d4d`) where every package got its own orphaned `.agents-workspace/` directory.

## Scanner Output Per Service

For each detected scope, the scanner produces:

- `system.usm` (if no existing one) — the scope's identity
- `services/{name}.usm` — service definitions
- `features/{area}/{name}.usm` — feature files (e.g. `features/auth/login.usm`)
- `data/{name}.usm` — data models (if applicable)

The scanner writes ONLY files that don't exist (no overwrites). Hand-curated USM files are left alone.

## Smart-Merge Behavior

When the scanner finds an existing USM file with content, it uses `smart-merge`:

1. **Preserve all existing content** — never overwrite human edits
2. **Add new findings** — if the scanner detects a new route/file, add it to the existing USM file
3. **Never change $id** — if a $id exists, keep it. The scanner's $id is the default; human-set $ids win
4. **Never change name, summary, intent** — these are semantic. Filled in by LLM enrich, not scanner
5. **Update routes[] and interfaces[]** — these are structural, the scanner maintains them

The merge algorithm:

```
1. Read existing USM file
2. Parse it
3. Read new scanner findings
4. For each finding:
   - If $id already exists → no change
   - If finding is new (by path) → add to routes[] / interfaces[]
   - If finding is missing from routes[] → remove from routes[]
5. Write merged result
```

## LLM Enrichment (separate step)

The scanner does NOT do semantic naming. It produces STRUCTURAL findings only.

The LLM enrich step (`pnpm usm enrich`) reads each `.usm` file with `TODO: describe` placeholders and asks the LLM to fill them in based on:
- The file's actual code (read from disk)
- The function name (e.g. `HomePage`, `KanbanPage`)
- The Next.js `metadata.title` (if present)
- The SiteHeader breadcrumb label (if present)
- The H1 in the page (if present)

The LLM should NEVER invent names from URL paths. It reads the code.

## What the Config Does (overrides only)

`usmconfig.json` provides:

1. **Excludes** — paths to skip (e.g. `apps/demo/`, `apps/experimental/`)
2. **Custom matchers** — override the auto-discovery for specific paths
3. **Enrichment provider** — which LLM to use (litellm, openai, etc.)
4. **Output paths** — where USM source and generated docs live

The config does NOT list services/packages. Those are auto-discovered.

## Command Reference

```bash
# Initialize (one-time per repo)
pnpm usm init
  # Creates usmconfig.json (with sensible defaults)
  # Creates the .usm/ structure (system.usm, services/, features/, data/)

# Scan (idempotent, safe to re-run)
pnpm usm scan
  # Discovers scopes, writes per-service .usm/ files
  # Smart-merges with existing content
  # Adds new routes/interfaces, never overwrites

# Scan a specific scope only
pnpm usm scan --scope apps/the-architect
  # Only scans the architect app
  # Useful for testing changes in isolation

# Generate docs
pnpm usm generate
  # Writes .agents-workspace/docs/*.md from USM
  # Per-app + per-shared-service + per-package

# LLM enrich (fills in TODO placeholders)
pnpm usm enrich
  # Reads each USM file with TODO markers
  # Calls LLM to fill in semantic content
  # Smart-merges (preserves hand-curated)

# Validate
pnpm usm validate
  # Checks all USM files against the schema
  # Reports errors and warnings
```

## Edge Cases

**Q: What if two scopes have the same service name?**
A: The scanner uses path-based IDs, so `apps/marketing/src/foo.ts` and `infrastructure/services/marketing/src/bar.ts` are different scopes with different USM directories. They don't conflict.

**Q: What if a USM file is missing its $schema?**
A: The scanner adds `$schema: https://usm.dev/schema/v1.json` if missing. Doesn't overwrite if present.

**Q: What if a service has no routes (e.g. a library)?**
A: The scanner still creates a service USM, but with no `routes:`. The LLM enrich step can fill in the summary from the package's source code.

**Q: What if I delete a route from my code?**
A: On next scan, the route is removed from the USM file (smart-merge removes missing findings). This is a breaking change for the docs; review the diff before committing.

## Status: DRAFT

This is a design document. The actual implementation hasn't been built yet. Once implemented:

- The current scanner (`packages/usm/src/scan/`) needs significant refactoring
- The merge logic (`packages/usm/src/scan/merge.ts`) needs extension
- The CLI (`packages/usm/src/cli/index.ts`) needs the new flags (`--scope`)
- The LLM enrich prompt (`packages/usm/src/enrich/prompts.ts`) needs to read file content for naming
- Tests need to be added for the new behavior

Open questions:
- How do we handle non-Next.js frameworks? (Express, FastAPI, Rails, etc.)
- How do we handle non-TypeScript packages? (Python services, Rust crates, etc.)
- How do we handle multi-language monorepos?
- Should `pnpm usm watch` exist for incremental updates?
- How do we handle service renaming (USM file with old $id, code with new name)?
