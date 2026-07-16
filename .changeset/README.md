# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage
versions and changelogs.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This prompts you to:

1. **Select the package** — `@smithgray/usm`
2. **Choose a bump type**:
   - `major` — breaking changes (the .usm file format or public API is incompatible)
   - `minor` — new backward-compatible features (new optional schema fields, new CLI commands/MCP tools, new generators)
   - `patch` — bug fixes and small tweaks
3. **Write a summary** — a human-readable description of the change. This goes into `CHANGELOG.md`.

A markdown file is created in `.changeset/`. Commit it alongside your code change.

## Versioning policy

- **Package version** (`package.json`) is managed by Changesets — never bump it by hand.
  A "Version Packages" PR accumulates changesets and bumps the version + `CHANGELOG.md`.
- **Schema `$version`** (the `.usm` file format) moves **independently** of the package version:
  - **Additive** schema changes (new optional fields, like `feedback` or `usm_version`) → **no `$version` bump** (still v1, backward compatible).
  - **Breaking** schema changes (renaming/removing required fields, v1→v2) → bump `$version` **and** `CURRENT_SCHEMA_VERSION` in `src/validate.ts` together, and ship a migration in `usm upgrade`. Record it as a `major` changeset.
- A schema change (`schema/v1.json`) **must** have a changeset — CI blocks merges without one.

## Releasing

Merging the "Version Packages" PR triggers the Release workflow, which builds and
publishes to npm. No manual `npm publish`.
