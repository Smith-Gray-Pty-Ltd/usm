---
"@smithgray/usm": minor
---

Scan overhauled: auto-creates system.usm (bootstrap fix), output mirrors the repo (apps/{name}/service.usm, features/{app}/{name}.usm, packages/{pkg}/prisma.usm), Python detection via pyproject.toml, $id collision fix. App-service stub suppression extended. VitePress auto-prompt install. Four new MCP tools (usm_write_system, usm_write_service, usm_update_system, usm_update_service) — 18 total. Schema: external service type, GraphQL/SSE route protocol, structured auth_schemes. AGENTS.md template updated with all new tools and workflow.