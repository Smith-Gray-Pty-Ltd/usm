// Prompt construction for the usm enrich subcommand

import type { EnrichmentContext } from "./types.js";

/**
 * System prompt for the enrichment LLM call.
 * This is the same across all enrichments.
 *
 * IMPORTANT: The LLM must produce YAML objects for structured fields
 * (decisions, flows, contracts, tests) — NOT plain strings.
 * The prompt includes concrete examples to force this behavior.
 */
export const SYSTEM_PROMPT = `You are enriching a .usm (Universal System Map) feature file.
The .usm format is a YAML-based spec that describes a software system in a way both humans and AI agents can consume.

CRITICAL RULES:
- Only fill in fields marked with "TODO: describe" — leave all other fields exactly as they are
- Preserve the existing YAML structure exactly — same keys, same order, same formatting
- Output ONLY valid YAML matching the schema — no markdown fences, no commentary, no extra text
- Do NOT wrap your output in backticks or code blocks
- EACH entry in decisions, flows, contracts, and tests MUST be a YAML object with the EXACT structure shown below — NEVER a plain string

STRING FIELDS (simple — just write the text):
  - summary: 1-2 sentences describing the feature
  - intent: 1-3 sentences explaining WHY the feature exists (not WHAT it does)

STRUCTURED FIELDS (MUST use the exact object format below — NEVER plain strings):

decisions — EACH entry must be an object with these keys:
  - id: kebab-case identifier (pattern: ^[a-z][a-z0-9-]*$)
  - decision: the architectural decision (1 sentence)
  - rationale: why this decision was made (1-2 sentences)
  - date: ISO date string (e.g. "2026-06-17")

EXACT FORMAT EXAMPLE:
decisions:
  - id: use-server-side-rendering
    decision: Use SSR for the dashboard to improve initial load times
    rationale: First Contentful Paint is critical for user retention; SSR avoids the white flash
    date: "2026-06-15"
  - id: lazy-load-session-list
    decision: Load session list lazily as the user scrolls
    rationale: Reduces initial payload from 500KB to 50KB
    date: "2026-06-12"

WRONG FORMAT (DO NOT DO THIS):
decisions:
  - "Decided to use SSR for dashboard"     ← THIS IS INVALID — it's a plain string, not an object

flows — EACH entry must be an object with these keys:
  - id: kebab-case identifier (pattern: ^[a-z][a-z0-9-]*$)
  - name: human-readable name of the flow
  - description: what the flow does (1-2 sentences)
  - steps: array of step objects, each with:
    - id: kebab-case step identifier
    - action: one of: navigate, click, fill, observe, authenticate, setup
    - target: what the user interacts with (URL, element, system)
    - expect: array of objects describing what should happen (optional)

EXACT FORMAT EXAMPLE:
flows:
  - id: create-session
    name: Create new agent session
    description: User opens the sessions page and clicks "New Session" to spawn an agent
    steps:
      - id: open-page
        action: navigate
        target: /sessions
        expect:
          - visible: "#sessions-list"
      - id: click-new
        action: click
        target: "#new-session-button"
        expect:
          - modal_visible: true

contracts — EACH entry must be an object with these keys:
  - id: kebab-case identifier (pattern: ^[a-z][a-z0-9-]*$)
  - description: what this contract guarantees (1-2 sentences)
  - must_have: array of strings, each a testable assertion (NOT objects)

EXACT FORMAT EXAMPLE:
contracts:
  - id: sessions-api
    description: GET /api/sessions returns paginated session list
    must_have:
      - "Response includes 200 status code"
      - "Response body contains sessions array"
      - "Requires valid Architect auth token"

tests — EACH entry must be an object with these keys:
  - id: kebab-case identifier (pattern: ^[a-z][a-z0-9-]*$)
  - setup: object describing test prerequisites (arbitrary keys)
  - expect: array of objects, each describing an expected outcome
  - contracts: array of contract id strings (optional — references contracts by their id)

EXACT FORMAT EXAMPLE:
tests:
  - id: page-loads-within-200ms
    setup:
      seed: 100 sessions
    expect:
      - assertion: page loads within 200ms
        type: performance
    contracts:
      - sessions-api

ADDITIONAL GUIDANCE:
- For decisions, write concrete architectural choices (not generic observations)
- For flows, write realistic user journeys based on the source code context
- For contracts, write testable assertions (not vague statements)
- For tests, write concrete test scenarios with specific expectations
- If you cannot infer meaningful content from the context, leave the TODO placeholder as-is
- For multi-line strings, use the YAML pipe (|) notation
- Always quote date strings: date: "2026-06-17" (not date: 2026-06-17 which YAML parses as a date object)

STATUS FIELD:
- status: must be one of: "built", "planned", "in-progress", "deprecated"
  - "built" if the feature has source code at the paths listed
  - "planned" if the feature is described but no code exists yet
  - "in-progress" if the feature has partial code (some paths, not all)
  - "deprecated" if the feature is being replaced (see_also contains a successor)
- Add the status field to every feature you enrich

DECISION STATUS:
- Each decision may have a status field: "proposed", "accepted", "rejected", "superseded"
- Default is "accepted" for decisions that are currently in force
- Use "proposed" for decisions under consideration
- Use "superseded" for decisions replaced by newer ones
- Use "rejected" for decisions that were considered but not adopted

Output the complete YAML file with the TODO fields filled in.`;

/**
 * Build the user prompt for a single enrichment call.
 */
export function buildUserPrompt(context: EnrichmentContext, targetFields: string[]): string {
  const parts: string[] = [];

  // 1. Show the current file state
  parts.push("Feature file (current state):");
  parts.push("```yaml");
  parts.push(context.originalYaml);
  parts.push("```");
  parts.push("");

  // 2. Show source code context
  const sourcePaths = Object.keys(context.sourceFiles);
  if (sourcePaths.length > 0) {
    parts.push("Context (source files referenced by this feature):");
    parts.push("");
    for (const sourcePath of sourcePaths) {
      const content = context.sourceFiles[sourcePath];
      parts.push(`File: ${sourcePath}`);
      parts.push("```");
      parts.push(content);
      parts.push("```");
      parts.push("");
    }
  }

  // 3. Show routes
  if (context.routes.length > 0) {
    parts.push("Routes this feature covers:");
    for (const route of context.routes) {
      const methods = route.http_methods.length > 0 ? ` ${route.http_methods.join("/")}` : "";
      parts.push(`- ${route.type === "api" ? "" : ""}${route.http_methods.length > 0 ? route.http_methods.join("/") : route.type === "api" ? "API" : ""} ${route.path}${methods}`);
    }
    parts.push("");
  }

  // 4. Show which fields need to be filled
  const todoInTarget = context.todoFields.filter((f) => targetFields.includes(f));
  if (todoInTarget.length > 0) {
    parts.push(`Task: Fill in the following fields: ${todoInTarget.join(", ")}`);
    parts.push("Return ONLY the completed YAML (no markdown fences, no commentary).");
    parts.push("REMEMBER: decisions, flows, contracts, and tests must use the EXACT object format shown in the system instructions — NEVER plain strings.");
  } else {
    parts.push("No fields need to be filled — all target fields already have content.");
  }

  return parts.join("\n");
}
