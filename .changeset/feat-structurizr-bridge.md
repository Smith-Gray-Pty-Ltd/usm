---
"@smithgray/usm": minor
---

Structurizr bridge — `usm import <workspace.json>` converts a Structurizr workspace export into .usm system + service specs (guards existing files, `--force`/`--dry-run`/`--id`/`--domain` flags, service type inferred from technology), and `usm generate --only structurizr` exports the reverse: a Structurizr DSL workspace with softwareSystem → containers (services) → components (features, status-badged). Import JSON now; DSL-grammar parsing deferred until demand is demonstrated.
