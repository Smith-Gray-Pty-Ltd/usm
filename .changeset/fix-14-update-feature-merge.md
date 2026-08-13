---
"@smithgray/usm": patch
---

Fix MCP usm_update_feature silent data loss — id-bearing arrays (contracts, flows, tests, decisions) now merge by id instead of being replaced wholesale; replacement requires the explicit new `replace` param. Response reports merge_details per field. (fixes #14)
