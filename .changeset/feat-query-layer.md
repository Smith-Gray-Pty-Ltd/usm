---
"@smithgray/usm": minor
---

Query layer over .usm data — `usm query "features where status = planned and contracts = 0"` in the CLI and a new `usm_query` MCP tool (read-only, results capped). A tiny predicate grammar (selectors, = != > < >= <=, ~ contains, has, and/or/not with parens) evaluated against parsed .usm files — typed impact analysis and drift checks instead of grepping raw YAML. Absent fields are false, never errors.
