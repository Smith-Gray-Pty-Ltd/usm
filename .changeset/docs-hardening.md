---
"@smithgray/usm": patch
---

**fix(docs): link discipline, audience model polish, agents reference**

Post-audit hardening of the docs pipeline:

- Sidebar: dropped the redundant "Getting Started" item inside the
  "Getting Started" group; dedup + dead-link guards on every push
- Dead links in page *content*: full-link discipline — relative,
  `.md`-suffixed, and absolute links all resolve; help-roadmap links to
  excluded pages strip; guides index links are absolute and
  extension-less (the /guides/guides/… doubling cannot recur)
- Guides copy runs at generate time (both trees fresh between serves);
  bind-race retry proven live (concurrent servers self-organize ports)
- AGENTS.md: USM Reference block (docs.usm.dev / dev-docs.usm.dev /
  schema / upstream) with correct site labels; consumer repos get zero
  dogfood content and zero dead home links
- CLI reference: `--port` documented as auto-port default (explicit
  strict); guide prose grammar (third-person system steps, em-dash
  separators); feature display names resolve via system.usm index
- gen-user-docs spec/roadmap bookkeeping: status, index entry, prose fixes