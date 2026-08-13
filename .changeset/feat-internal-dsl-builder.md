---
"@smithgray/usm": minor
---

Internal DSL builder — fluent TypeScript that compiles to validated .usm specs: `defineFeature("org/slug", { system, service }).summary(...).flow(id, f => f.step(...)).contract(id, c => c.mustHave(...)).build()` returns `{ yaml, object, valid, errors }`, with `defineService` and `writeFeature` (refuses invalid specs) exported from the package entry. Extends existing parsed specs via `FeatureBuilder.adopt` — flows/contracts/tests upsert by id. Per Fowler: an expression builder over the semantic model — the .usm format stays canonical.
