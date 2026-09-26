import path from "node:path";
import type {
  FeatureUsm,
  GenerationResult,
  Persona,
  Flow,
  FlowStep,
  FeatureTest,
} from "../types.js";

/**
 * usm/gen-user-docs — user documentation generator.
 *
 * COMPOSES task-oriented guides from personas and journey flows (never by
 * filtering developer content). A flow is a journey when its effective actor
 * (flow-level, or step-level override) references a persona declared in
 * system.usm. One guide page per journey; steps performed by the persona are
 * rendered as instructions, system/agent steps as "the system will …" prose.
 *
 * Output: {user_docs}/guides/<personaId>/<journeyId>.md + index.md per persona.
 */

/** Reserved actors that never reference a persona. */
export const RESERVED: ReadonlySet<string> = new Set(["system", "agent"]);

/** A journey: a flow + the feature it belongs to + tests linked to it. */
interface Journey {
  featureId: string;
  featureName: string;
  flow: Flow;
  personaId: string;
  persona: Persona;
  linkedTests: FeatureTest[];
}

/**
 * Classify a flow: journey (with the persona that performs it) or pipeline.
 * Step-level actor overrides the flow-level default. A flow is a journey
 * when ANY step (or the flow itself) resolves to a persona.
 */
function journeyPersona(feature: FeatureUsm, flow: Flow, personaIds: ReadonlySet<string>): string | null {
  if (flow.actor && personaIds.has(flow.actor)) return flow.actor;
  for (const step of flow.steps) {
    const actor = step.actor ?? flow.actor;
    if (actor && personaIds.has(actor)) return actor;
  }
  return null;
}

/** Effective actor for a step within a flow (step overrides flow, default system). */
function effectiveActor(flow: Flow, step: FlowStep): string {
  return step.actor ?? flow.actor ?? "system";
}

/** Collect all journeys across features, keyed by persona id. */
export function collectJourneys(
  features: FeatureUsm[],
  personas: Persona[],
): Map<string, Journey[]> {
  const personaIds = new Set(personas.map((p) => p.id));
  const personaById = new Map(personas.map((p) => [p.id, p]));
  const byPersona = new Map<string, Journey[]>();
  for (const feature of features) {
    if (!feature.flows) continue;
    for (const flow of feature.flows) {
      const personaId = journeyPersona(feature, flow, personaIds);
      if (!personaId) continue; // pipeline — developer stream only
      const linkedTests = (feature.tests ?? []).filter((t) => {
        if (typeof t.flow === "string") return t.flow === flow.id;
        return t.flow?.ref === flow.id;
      });
      const journey: Journey = {
        featureId: feature.$id,
        featureName: feature.command ?? feature.$id.split("/").pop() ?? feature.$id,
        flow,
        personaId,
        persona: personaById.get(personaId)!,
        linkedTests,
      };
      const list = byPersona.get(personaId) ?? [];
      list.push(journey);
      byPersona.set(personaId, list);
    }
  }
  return byPersona;
}

/** Render one step as guide prose. */
function renderStep(flow: Flow, step: FlowStep, _personaName: string): string {
  const actor = effectiveActor(flow, step);
  const surface = step.surface ? ` (${step.surface})` : "";
  if (!RESERVED.has(actor)) {
    // persona instruction
    const action = step.action.charAt(0).toUpperCase() + step.action.slice(1);
    return `- **${action}**${surface}${step.target ? `: ${step.target}` : ""}`;
  }
  // system/agent step — "the system will …"
  return `- The system ${step.action}${surface}${step.target ? `: ${step.target}` : ""}`;
}

/** Compose one guide page for a journey. */
export function renderJourneyGuide(journey: Journey, persona: Persona): string {
  const lines: string[] = [];
  lines.push(`# ${journey.flow.name}`);
  lines.push("");
  lines.push(`**For:** ${persona.name}`);
  lines.push("");
  if (journey.flow.description) {
    lines.push(journey.flow.description);
    lines.push("");
  }
  lines.push(`Part of: **${journey.featureName}**`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  for (const step of journey.flow.steps) {
    lines.push(renderStep(journey.flow, step, persona.name));
  }
  lines.push("");

  if (journey.linkedTests.length > 0) {
    lines.push("## How this is verified");
    lines.push("");
    for (const t of journey.linkedTests) {
      for (const exp of t.expect) {
        const a = (exp as { assertion?: string }).assertion;
        if (a) lines.push(`- ${a}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Compose all user docs for a system. Deterministic; persona-ordered. */
export function generateUserDocs(
  systemFile: { personas?: Persona[] },
  features: FeatureUsm[],
  root: string,
  userDocsDir?: string,
): GenerationResult {
  const personas = systemFile.personas ?? [];
  if (personas.length === 0) return { outputs: [] };

  const base = path.join(root, userDocsDir ?? ".usm-workspace/user-docs");
  const byPersona = collectJourneys(features, personas);

  const outputs: GenerationResult["outputs"] = [];

  // Per-persona index + journey guides
  for (const persona of personas) {
    const journeys = byPersona.get(persona.id) ?? [];
    if (journeys.length === 0) continue;

    const indexLines: string[] = [];
    indexLines.push(`# Guides for ${persona.name}`);
    indexLines.push("");
    indexLines.push(persona.description);
    indexLines.push("");
    indexLines.push("| Guide | Feature |");
    indexLines.push("|-------|---------|");
    for (const j of journeys) {
      // Absolute, extension-less link: this index is served at /guides/<persona>/,
      // and a relative link with .md resolves to /guides/guides/<persona>/… —
      // the doubled-path 404. VitePress routes on extension-less absolute paths.
      indexLines.push(`| [${j.flow.name}](/guides/${persona.id}/${j.flow.id}) | ${j.featureName} |`);
    }
    indexLines.push("");
    outputs.push({
      path: path.join(base, `${persona.id}.md`),
      content: indexLines.join("\n"),
    });

    for (const j of journeys) {
      outputs.push({
        path: path.join(base, "guides", persona.id, `${j.flow.id}.md`),
        content: renderJourneyGuide(j, persona),
      });
    }
  }

  return { outputs };
}

export type { Journey };