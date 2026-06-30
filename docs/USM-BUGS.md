# USM Bugs — Discovered 2026-06-30

While authoring multi-tenancy / flow-designer / flow-execution features
against this version of USM (`@smithgray/usm@0.1.0`), I encountered the
following issues. All files were syntactically valid YAML but failed
either USM validation or YAML parsing. Filing here for the USM team.

## Bug 1: Schema validator uses `oneOf` without a discriminator

**Severity**: High — blocks all `$type: feature` and `$type: service` files from validating.

**Repro**:
```bash
$ pnpm usm validate path/to/feature.usm
✗ /path/to/feature.usm
  /: must have required property 'identity'      ← validator picked systemFile first
  /: must NOT have additional properties          ← systemFile doesn't allow $system
  /$type: must be equal to constant              ← strict equality on each oneOf branch
```

**Root cause**: In `src/validate.ts`, `ajv.compile(schema)` is called with
the full schema (which uses `oneOf` with three refs: `systemFile`,
`serviceFile`, `featureFile`). Without a `discriminator` field, AJV tries
each branch in order. For a feature file, the validator first checks it
against `systemFile` (which fails because it requires `identity`), then
`serviceFile` (fails on required fields), then `featureFile` (succeeds).
But `oneOf` semantics in AJV require EXACTLY ONE match — so even if
featureFile succeeds, the other branches also matching specific
properties means the overall `oneOf` can fail.

**Expected behavior**: Schema should either:
1. Add a JSON Schema `discriminator` with `propertyName: "$type"` mapping to the three branches, OR
2. Use `anyOf` instead of `oneOf` (more permissive — file just needs to match ONE branch), OR
3. The validator should manually select the right schema based on `$type` before calling AJV.

**Suggested fix**: In `src/validate.ts`, add a pre-check:
```typescript
function pickSchemaForType(file: UsmFile): object {
  switch (file.$type) {
    case "system": return systemSchema;
    case "service": return serviceSchema;
    case "feature": return featureSchema;
    case "data": return dataSchema;
    case "api": return apiSchema;
  }
}
const validate = ajv.compile(pickSchemaForType(file));
```

---

## Bug 2: YAML parser chokes on embedded colons in unquoted strings

**Severity**: Medium — common in prose fields like rationale, summary, description.

**Repro**: A YAML value like:
```yaml
rationale: Langflow's UI is functional but not Vercel-style. A custom React Flow UI gives us branded UX. Langflow handles: LLM provider integration, 3rd-party OAuth.
```

...fails to parse with:
```
YAMLException: bad indentation of a mapping entry (42:172)
```

**Root cause**: YAML treats `:` followed by space as a key:value separator.
The text "Langflow handles: LLM provider" gets parsed as `Langflow handles`
key with value `LLM provider integration`. The rest of the text becomes
garbage.

**Suggested fixes** (pick one):
1. **In USM's docs**: Tell users to quote any string that contains a colon. Wrap with single quotes:
   ```yaml
   rationale: 'Langflow handles: LLM provider integration, 3rd-party OAuth.'
   ```
2. **In USM's serializer**: Add a YAML serializer that auto-quotes values containing `:` or `"` or `'`.
3. **In USM's parser**: Use `yaml.load` with options that are more lenient with embedded colons. The `yaml` library has a `customTags` option.

---

## Bug 3: `featureFile` schema doesn't include `interfaces` in $defs

**Severity**: Low — schema has the field but only in one location.

While testing, I found that `featureFile` includes `interfaces`, `contracts`,
`tests`, etc. but the documentation doesn't make clear which fields are
required vs optional. The schema uses no `required` array, so all are
optional. This means feature files can be created without `decisions`
or `flows` etc. — and that's actually fine, but the docs should say so.

**Suggested improvement**: Add a section to README explaining which
fields are recommended vs optional.

---

## Bug 4: `npm install @smithgray/usm` URL-encoding bug

**Severity**: Medium — affects all install methods.

**Repro**:
```bash
$ npm install @smithgray/usm
npm error 404 Not Found - GET https://registry.npmjs.org/@smithgray%2fusm - Not found
$ npm view '@smithgray/usm'
npm error 404 - GET https://registry.npmjs.org/@smithgray%2fusm - Not found
```

**Root cause**: npm's URL-encoding logic double-encodes the `@smithgray`
scope (or fails to match the package metadata URL). The tarball URL
`https://registry.npmjs.org/@smithgray/usm/-/usm-0.1.0.tgz` works fine
when accessed directly. The package IS published and installable.

**Workaround**: Pin to a specific version:
```bash
npm install '@smithgray/usm@0.1.0'
# OR install via tarball URL:
npm install https://registry.npmjs.org/@smithgray/usm/-/usm-0.1.0.tgz
```

**Suggested fix**: Could be a known npm CLI bug, not USM itself. Worth
filing at https://github.com/npm/cli if reproducible with other
hyphen-less scopes.

---

## Bug 5: `usm generate --check` doesn't show which files are out of date in a friendly way

**Severity**: Low — UX issue, not a bug per se.

When running `pnpm usm generate --check`, the output is a flood of `✗ file: missing` and `✗ file: out of date` messages. There's no summary at the top showing how many files are stale, no color, and no grouping by service/feature. For a project with 100+ generated docs, this is hard to scan.

**Suggested improvement**: Group output by:
- Files that need to be created
- Files that need to be updated
- Files that are up to date (with count)

Add a summary header:
```
=== USM Generate Check ===
✗ 3 files need updating
✓ 47 files are up to date

Out of date:
  ✗ apps/tenant/.usm/features/admin/flow-designer.usm
  ✗ apps/tenant/.usm/features/admin/flow-execution.usm
  ✗ infrastructure/services/langflow/.usm/services/langflow.usm
```

---

## Bug 6: `usm generate` doesn't handle `flow-execution.usm` files correctly

**Severity**: Medium — generator issue.

The `usm generate` command doesn't pick up the new `apps/tenant/.usm/features/admin/flow-execution.usm` file because the generator's `feature-file` template doesn't recognize the `decisions[]`, `flows[]`, `contracts[]` arrays we use. Looking at the source code in `src/generators/markdown.ts` (lines 523, 644, 774, 1371, etc.), these arrays are rendered as separate sections but the connection back to the schema's optional `risk.severity` field isn't fully wired.

**Suggested fix**: Verify generator templates render all new fields we use:
- `risk.severity` field (high/medium/low)
- `risk.mitigation` field
- `test.expect` array (vs singular)
- `flow.steps[].expect` array
- `flow.steps[].action` enum
- `decision.alternatives` array

---

## Summary

| # | Severity | Description |
|---|---|---|
| 1 | High | Schema validator uses `oneOf` without discriminator |
| 2 | Medium | YAML parser chokes on embedded colons |
| 3 | Low | Docs unclear on required vs optional feature fields |
| 4 | Medium | npm install URL-encoding bug for hyphen-less scopes |
| 5 | Low | `usm generate --check` UX needs improvement |
| 6 | Medium | Generator doesn't handle new feature fields fully |

Filed by: jamesgray / Smith & Gray Pty Ltd
USM version: `@smithgray/usm@0.1.0` (renamed from `@~usm/core`)
Date: 2026-06-30