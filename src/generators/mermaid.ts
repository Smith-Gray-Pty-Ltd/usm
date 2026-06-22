import path from "node:path";
import fs from "node:fs";
import type {
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  Flow,
  FlowStep,
  GenerationResult,
  ServiceRef,
} from "../types.js";
import { findUsmFiles, parseUsmFile } from "../index.js";

// ─── Escape helper for Mermaid sequenceDiagram syntax ─────────────────────────

/**
 * Escape characters that collide with Mermaid sequenceDiagram syntax.
 * Mermaid uses `:` as the actor/message separator and `#` for line endings in some contexts.
 * HTML entities are parsed by Mermaid, so we use them to embed literal colons, pipes, and hashes.
 */
function escapeMermaidText(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")          // & FIRST (so we don't double-escape)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\|/g, "&#124;")        // pipe (mermaid label separator)
    .replace(/:/g, "&#58;")          // colon (mermaid message separator)
    .replace(/#/g, "&#35;")          // hash (CSS/JS contexts)
    .replace(/\(/g, "&#40;")         // ( — cylinder/circle shape
    .replace(/\)/g, "&#41;")         // ) — cylinder/circle shape
    .replace(/\[/g, "&#91;")         // [ — rectangle shape
    .replace(/\]/g, "&#93;")         // ] — close shape
    .replace(/\{/g, "&#123;")        // { — rhombus shape
    .replace(/\}/g, "&#125;")        // } — close rhombus
    .replace(/\n/g, " ")             // newlines → spaces
    .replace(/\r/g, "")              // strip CR
    .trim();
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known app directories — populated dynamically from system.usm services[] */
const APP_DIRS: string[] = [];

/** Service kinds that map to shared services */
const SHARED_SERVICE_KINDS = new Set(["idp", "llm-gateway", "agent-flows", "database", "cache", "queue", "api"]);

// ─── Color palette for Mermaid style directives ──────────────────────────────

const APP_COLORS: Record<string, string> = {};

const SHARED_SERVICE_COLORS: Record<string, string> = {};

const PACKAGE_COLOR = "#64748b";  // Slate

// ─── 1. Architecture Diagram (from system.usm) ──────────────────────────────

/**
 * Generate a Mermaid architecture diagram from the system.usm services array.
 * Shows all apps, shared services, packages, and their dependencies in subgraphs.
 *
 * Output: `.usm-workspace/docs/architecture/architecture.md`
 */
export function generateArchitectureDiagram(system: SystemUsm, root: string): GenerationResult {
  const services = system.services || [];

  // Categorize services from system.usm — dynamically based on service kind and ref
  const appServices = services.filter(s => s.ref?.includes("apps/") || !SHARED_SERVICE_KINDS.has(s.id));
  const sharedServices = services.filter(s => SHARED_SERVICE_KINDS.has(s.id));
  // Everything else is a package/internal dependency
  const packageServices = services.filter(s =>
    !appServices.some(a => a.id === s.id) &&
    !sharedServices.some(ss => ss.id === s.id)
  );

  // Also read service .usm files for richer runtime info
  const serviceDetails = loadServiceDetails(root);

  const lines: string[] = [];
  lines.push("# Architecture Diagram");
  lines.push("");
  lines.push("Auto-generated from `.usm/system.usm` services + `depends_on`.");
  lines.push("");
  lines.push("```mermaid");
  lines.push("graph TD");

  // App Services subgraph
  if (appServices.length > 0) {
    lines.push("");
    lines.push("    %% App Services");
    lines.push("    subgraph \"App Services\"");
    for (const svc of appServices) {
      const details = serviceDetails.get(svc.id);
      const runtime = details?.runtime || "nextjs";
      const port = svc.port || details?.port;
      const labelParts = [svc.name || svc.id];
      if (port) labelParts.push(`port ${port}`);
      labelParts.push(runtime);
      const label = labelParts.join("<br/>");
      const nodeId = sanitizeMermaidId(svc.id);
      lines.push(`        ${nodeId}["${escapeMermaidText(label)}"]`);
    }
    lines.push("    end");
  }

  // Shared Services subgraph
  if (sharedServices.length > 0) {
    lines.push("");
    lines.push("    %% Shared Services");
    lines.push("    subgraph \"Shared Services\"");
    for (const svc of sharedServices) {
      const details = serviceDetails.get(svc.id);
      const runtime = details?.runtime || inferRuntime(svc.id);
      const port = svc.port || details?.port;
      const labelParts = [svc.name || svc.id];
      if (port) labelParts.push(`port ${port}`);
      labelParts.push(runtime);
      const label = labelParts.join("<br/>");
      const nodeId = sanitizeMermaidId(svc.id);
      // Database gets cylinder shape
      if (svc.id === "postgres" || svc.id === "database") {
        lines.push(`        ${nodeId}[("${escapeMermaidText(label)}")]`);
      } else {
        lines.push(`        ${nodeId}["${escapeMermaidText(label)}"]`);
      }
    }
    lines.push("    end");
  }

  // Packages subgraph (compact)
  if (packageServices.length > 0) {
    lines.push("");
    lines.push("    %% Packages");
    lines.push("    subgraph \"Packages\"");
    for (const svc of packageServices) {
      const label = svc.name || svc.id;
      const nodeId = sanitizeMermaidId(svc.id);
      lines.push(`        ${nodeId}["${escapeMermaidText(label)}"]`);
    }
    lines.push("    end");
  }

  // Relationships (edges from depends_on)
  lines.push("");
  lines.push("    %% Relationships");
  for (const svc of services) {
    const deps = svc.depends_on || [];
    const fromId = sanitizeMermaidId(svc.id);
    for (const dep of deps) {
      const toId = sanitizeMermaidId(dep);
      lines.push(`    ${fromId} --> ${toId}`);
    }
  }

  // Style directives
  lines.push("");
  for (const svc of appServices) {
    const color = APP_COLORS[svc.id] || PACKAGE_COLOR;
    lines.push(`    style ${sanitizeMermaidId(svc.id)} fill:${color},color:#fff`);
  }
  for (const svc of sharedServices) {
    const color = SHARED_SERVICE_COLORS[svc.id] || PACKAGE_COLOR;
    lines.push(`    style ${sanitizeMermaidId(svc.id)} fill:${color},color:#fff`);
  }

  lines.push("```");
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/architecture/architecture.md`,
      content: lines.join("\n"),
    }],
  };
}

// ─── 2. Sequence Diagrams (from feature flows) ──────────────────────────────

/**
 * Generate a Mermaid sequenceDiagram for a feature's flows[].
 * Returns the Mermaid code block(s) for injection into the feature's .md.
 */
export function generateSequenceDiagrams(feature: FeatureUsm): string {
  const flows = feature.flows || [];
  if (flows.length === 0) return "";

  const blocks: string[] = [];

  for (const flow of flows) {
    const lines: string[] = [];
    lines.push("```mermaid");
    lines.push("sequenceDiagram");

    // Determine participants from the flow steps
    const participants = inferParticipants(flow);
    for (const p of participants) {
      lines.push(`    participant ${p.id}`);
      if (p.alias) {
        lines.push(`    participant ${p.id} as ${escapeMermaidText(p.alias)}`);
      }
    }

    lines.push("");

    // Generate steps
    for (const step of flow.steps) {
      const mermaidStep = mapStepToMermaid(step);
      lines.push(mermaidStep.arrow);

      // Add expectation notes
      if (step.expect && step.expect.length > 0) {
        for (const exp of step.expect) {
          const note = formatExpectationNote(exp, participants);
          if (note) lines.push(note);
        }
      }
    }

    lines.push("```");
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

interface Participant {
  id: string;
  alias?: string;
}

function inferParticipants(flow: Flow): Participant[] {
  const hasAuth = flow.steps.some(s => s.action === "authenticate");
  const hasServer = flow.steps.some(s =>
    s.target?.startsWith("/api/") || s.action === "submit"
  );

  const participants: Participant[] = [
    { id: "User" },
    { id: "Browser" },
  ];

  if (hasServer) {
    participants.push({ id: "Server" });
  }

  if (hasAuth) {
    participants.push({ id: "IdP", alias: "Identity Provider" });
  }

  return participants;
}

/**
 * Map a .usm FlowStep action to a Mermaid sequenceDiagram arrow.
 *
 * Action mapping:
 * - navigate → User->>Browser: navigate to <target>
 * - click → User->>Browser: click <target>
 * - fill → User->>Browser: fill <target>
 * - observe → Browser-->>User: shows <target>
 * - authenticate → Browser->>IdP: OIDC flow <target>
 * - setup → Note over Server,Browser: setup <target>
 */
function mapStepToMermaid(step: FlowStep): { arrow: string } {
  const target = step.target || "";

  switch (step.action) {
    case "navigate":
      if (target.startsWith("/api/")) {
        return { arrow: `    User->>Browser: navigate` };
      }
      if (target.startsWith("/") || target.startsWith("http")) {
        return { arrow: `    User->>Browser: navigate to ${escapeMermaidText(target)}` };
      }
      return { arrow: `    User->>Browser: navigate to ${escapeMermaidText(target)}` };

    case "click":
      if (target.startsWith("#")) {
        return { arrow: `    User->>Browser: interact with ${escapeMermaidText(target)}` };
      }
      return { arrow: `    User->>Browser: click ${escapeMermaidText(target)}` };

    case "fill":
      return { arrow: `    User->>Browser: fill ${escapeMermaidText(target)}` };

    case "observe":
      return { arrow: `    Browser-->>User: shows ${escapeMermaidText(target)}` };

    case "authenticate":
      return { arrow: `    Browser->>IdP: OIDC flow — ${escapeMermaidText(target)}` };

    case "setup":
      return { arrow: `    Note over Server,Browser: setup — ${escapeMermaidText(target)}` };

    default:
      return { arrow: `    User->>Browser: ${escapeMermaidText(step.action)} ${escapeMermaidText(target)}` };
  }
}

function formatExpectationNote(
  exp: Record<string, unknown>,
  participants: Participant[]
): string {
  const entries = Object.entries(exp);
  if (entries.length === 0) return "";

  // Determine which participant the note applies to
  const noteText = entries.map(([k, v]) => `${escapeMermaidText(k)}&#58; ${escapeMermaidText(String(v))}`).join(", ");

  // If the expectation mentions a visible element or status, it's about Browser
  const browserKeywords = ["visible", "redirect", "status", "cookie", "element", "value", "no_redirect", "no_cookie"];
  const isBrowserNote = entries.some(([k]) => browserKeywords.includes(k));

  const participant = isBrowserNote ? "Browser" :
    (participants.find(p => p.id === "Server") ? "Server" : "Browser");

  return `    Note over ${participant}: ${noteText}`;
}

// ─── 3. ER Diagram (from data/models.usm + Prisma schema) ──────────────────

/**
 * Generate a Mermaid erDiagram from data/models.usm and the Prisma schema.
 * Appends the diagram to the existing models.md content.
 *
 * Output: injected into `.usm-workspace/docs/data/models.md`
 */
export function generateERDiagram(dataFiles: DataUsm[], root: string, serviceFiles?: ServiceUsm[]): GenerationResult {
  // Parse the Prisma schema for the full ER info
  const schemaPath = path.join(root, "packages", "db", "prisma", "schema.prisma");
  const prismaContent = readPrismaSchema(schemaPath);

  // Parse models from Prisma schema
  const models = parsePrismaModelsForER(prismaContent);

  // Build the erDiagram
  const lines: string[] = [];
  lines.push("");
  lines.push("## ER Diagram");
  lines.push("");
  lines.push("Auto-generated from `packages/db/prisma/schema.prisma`.");
  lines.push("");
  lines.push("```mermaid");
  lines.push("erDiagram");

  // Enum declarations
  const enums = parsePrismaEnums(prismaContent);
  for (const [enumName, values] of enums) {
    lines.push(`    ${enumName} {`);
    for (const val of values) {
      lines.push(`        ${val}`);
    }
    lines.push("    }");
  }

  // Model declarations
  for (const [modelName, info] of models) {
    lines.push(`    ${modelName} {`);
    for (const field of info.fields) {
      const typeStr = field.type;
      const constraints: string[] = [];
      if (field.isPk) constraints.push("PK");
      if (field.isUnique && !field.isPk) constraints.push("UK");
      const constraintStr = constraints.length > 0 ? ` ${constraints.join(" ")}` : "";
      lines.push(`        ${typeStr} ${field.name}${constraintStr}`);
    }
    lines.push("    }");
  }

  // Relationship lines
  for (const [modelName, info] of models) {
    for (const rel of info.relationships) {
      lines.push(`    ${rel}`);
    }
  }

  lines.push("```");
  lines.push("");

  // Now read the existing models.md and append the ER diagram section
  const existingPath = `${root}/.usm-workspace/docs/data/models.md`;
  // Existing content is always set in try/catch below; declare without initializer
  let existingContent: string;
  try {
    existingContent = fs.readFileSync(existingPath, "utf-8");
  } catch {
    // If it doesn't exist yet, we'll create it from scratch
    existingContent = "# Data Model\n\nSource: `.usm/data/*.usm` + `packages/db/prisma/schema.prisma`\n\n";
  }

  // Remove any existing ER Diagram section to avoid duplication
  const erSectionStart = existingContent.indexOf("\n## ER Diagram\n");
  if (erSectionStart !== -1) {
    // Find the end of the ER section (next ## or end of file)
    const afterEr = existingContent.indexOf("\n## ", erSectionStart + 1);
    if (afterEr !== -1) {
      existingContent = existingContent.slice(0, erSectionStart) + existingContent.slice(afterEr);
    } else {
      existingContent = existingContent.slice(0, erSectionStart);
    }
  }

  // Append the new ER diagram section
  const finalContent = existingContent.trimEnd() + "\n" + lines.join("\n");

  return {
    outputs: [{
      path: existingPath,
      content: finalContent,
    }],
  };
}

// ─── 4. Service Dependency Graph ───────────────────────────────────────────

/**
 * Generate per-service dependency diagrams showing just that service and
 * what it depends on.
 *
 * Output:
 * - apps/{app}/.usm-workspace/docs/architecture/dependencies.md (for apps)
 * - .usm-workspace/docs/shared-services/{svc}/architecture/dependencies.md (for shared services)
 * - .usm-workspace/docs/packages/{pkg}/dependencies.md (for packages)
 */
export function generateServiceDependencies(
  system: SystemUsm,
  services: ServiceUsm[],
  root: string
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];
  const systemServices = system.services || [];
  const serviceDetails = loadServiceDetails(root);

  // Build a map of service id → ServiceRef from system.usm
  const systemServiceMap = new Map<string, ServiceRef>();
  for (const svc of systemServices) {
    systemServiceMap.set(svc.id, svc);
  }

  // Also build a map from ServiceUsm files (for richer detail)
  const serviceUsmMap = new Map<string, ServiceUsm>();
  for (const svc of services) {
    const slug = svc.$id.split("/").pop() || "";
    serviceUsmMap.set(slug, svc);
  }

  // Generate diagrams for each service that has depends_on
  for (const svc of systemServices) {
    const deps = svc.depends_on || [];
    if (deps.length === 0 && !APP_DIRS.includes(svc.id)) continue;  // Skip services with no deps (unless it's an app — apps always get a diagram)

    const diagram = buildServiceDependencyDiagram(svc, deps, systemServiceMap, serviceDetails);
    const content = buildServiceDependencyMd(svc, diagram);

    // Determine output path based on classification
    const classification = classifyServiceById(svc.id, serviceUsmMap);
    let outputPath: string;

    switch (classification) {
      case "app":
        outputPath = `${root}/apps/${svc.id}/.usm-workspace/docs/architecture/dependencies.md`;
        break;
      case "shared-service":
        outputPath = `${root}/.usm-workspace/docs/shared-services/${svc.id}/architecture/dependencies.md`;
        break;
      case "package":
        outputPath = `${root}/.usm-workspace/docs/packages/${svc.id}/dependencies.md`;
        break;
      default:
        outputPath = `${root}/.usm-workspace/docs/packages/${svc.id}/dependencies.md`;
    }

    outputs.push({ path: outputPath, content });
  }

  return { outputs };
}

function buildServiceDependencyDiagram(
  svc: ServiceRef,
  deps: string[],
  systemServiceMap: Map<string, ServiceRef>,
  serviceDetails: Map<string, ServiceUsm>
): string {
  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("graph LR");

  const mainId = sanitizeMermaidId(svc.id);
  const mainName = svc.name || svc.id;
  lines.push(`    ${mainId}[${escapeMermaidText(mainName)}]`);

  for (const dep of deps) {
    const depId = sanitizeMermaidId(dep);
    const depSvc = systemServiceMap.get(dep);
    const depName = depSvc?.name || dep;

    // Special shape for database
    if (dep === "postgres" || dep === "database") {
      lines.push(`    ${depId}[(${escapeMermaidText(depName)})]`);
    } else {
      lines.push(`    ${depId}[${escapeMermaidText(depName)}]`);
    }

    lines.push(`    ${mainId} --> ${depId}`);
  }

  // Style the main node
  const color = APP_COLORS[svc.id] || SHARED_SERVICE_COLORS[svc.id] || PACKAGE_COLOR;
  lines.push("");
  lines.push(`    style ${mainId} fill:${color},color:#fff`);

  lines.push("```");
  return lines.join("\n");
}

function buildServiceDependencyMd(svc: ServiceRef, diagram: string): string {
  const lines: string[] = [];
  lines.push("# Dependencies");
  lines.push("");
  lines.push(`Dependency graph for **${svc.name || svc.id}**.`);
  lines.push("");
  lines.push(diagram);
  lines.push("");

  const deps = svc.depends_on || [];
  if (deps.length > 0) {
    lines.push("## Dependency List");
    lines.push("");
    for (const dep of deps) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  } else {
    lines.push("No external dependencies.");
    lines.push("");
  }

  return lines.join("\n");
}

function classifyServiceById(
  id: string,
  serviceUsmMap: Map<string, ServiceUsm>
): "app" | "shared-service" | "package" {
  if (SHARED_SERVICE_KINDS.has(id)) {
    return "shared-service";
  }

  const svc = serviceUsmMap.get(id);
  if (svc) {
    if (svc.paths?.some(p => p.startsWith("apps/"))) return "app";
    if (svc.paths?.some(p => p.startsWith("packages/"))) return "package";
  }

  return "package";
}

// ─── Helper: Sanitize Mermaid node IDs ──────────────────────────────────────

/**
 * Mermaid IDs can't contain hyphens or some special chars.
 * Convert "the-architect" → "the_architect", etc.
 */
function sanitizeMermaidId(id: string): string {
  return id.replace(/-/g, "_").replace(/\./g, "_");
}

// ─── Helper: Infer runtime from service id ──────────────────────────────────

function inferRuntime(id: string): string {
  const runtimeMap: Record<string, string> = {
    "zitadel": "OIDC",
    "litellm": "LLM Gateway",
    "langflow": "Flows",
    "postgres": "PostgreSQL",
    "nango": "Integration",
  };
  return runtimeMap[id] || "service";
}

// ─── Helper: Load service .usm files for richer detail ──────────────────────

function loadServiceDetails(root: string): Map<string, ServiceUsm> {
  const details = new Map<string, ServiceUsm>();
  const servicesDir = path.join(root, ".usm", "services");

  if (!fs.existsSync(servicesDir)) return details;

  const files = findUsmFiles(servicesDir);
  for (const filePath of files) {
    try {
      const parsed = parseUsmFile(filePath);
      if (parsed.$type === "service") {
        const svc = parsed as ServiceUsm;
        const slug = svc.$id.split("/").pop() || "";
        details.set(slug, svc);
      }
    } catch {
      // Skip unparseable
    }
  }

  return details;
}

// ─── Helper: Read Prisma schema ─────────────────────────────────────────────

function readPrismaSchema(schemaPath: string): string {
  try {
    return fs.readFileSync(schemaPath, "utf-8");
  } catch {
    return "";
  }
}

// ─── Prisma ER Parser ──────────────────────────────────────────────────────

interface ERField {
  name: string;
  type: string;
  isPk: boolean;
  isUnique: boolean;
}

interface ERModelInfo {
  fields: ERField[];
  relationships: string[];
}

/**
 * Parse Prisma schema into a map of model name → ERModelInfo
 * suitable for Mermaid erDiagram rendering.
 */
function parsePrismaModelsForER(content: string): Map<string, ERModelInfo> {
  const models = new Map<string, ERModelInfo>();

  const modelRegex = /^model\s+(\w+)\s*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const blockStart = match.index + match[0].length;

    let depth = 1;
    let i = blockStart;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      i++;
    }
    const blockContent = content.slice(blockStart, i - 1);

    const fields: ERField[] = [];
    const relationships: string[] = [];

    const lines = blockContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)(?:\s+(.*))?$/);
      if (!fieldMatch) continue;

      const [, fieldName, rawType, rest] = fieldMatch;
      if (fieldName === "enum") continue;

      const cleanType = rawType.replace("?", "").replace("[]", "");
      const isArray = rawType.endsWith("[]");
      const isOptional = rawType.endsWith("?") || isArray;
      const restStr = rest || "";

      const isPk = restStr.includes("@id");
      const isUnique = restStr.includes("@unique");

      // Skip relation fields (they point to other models and are rendered as relationship lines)
      const hasRelation = restStr.includes("@relation");

      // Skip Unsupported types (like vector)
      if (rawType.startsWith("Unsupported")) {
        // Map Unsupported("vector") → vector for display
        fields.push({
          name: fieldName,
          type: "vector",
          isPk,
          isUnique,
        });
        continue;
      }

      // Skip reverse-relation fields (arrays without @relation, or fields with @relation that are the "many" side)
      if (isArray) {
        // This is a "many" side — add as a relationship line
        // E.g. users User[] → Organization ||--o{ User : "users"
        // The relationship is declared from the OTHER model's @relation field
        // So we skip it here and let the other model's parsing handle it
        continue;
      }

      if (hasRelation) {
        // This is a "one" side relation field (e.g., organization Organization @relation(...))
        // Determine relationship cardinality
        const relFieldsMatch = restStr.match(/fields:\s*\[(\w+)\]/);
        const relRefsMatch = restStr.match(/references:\s*\[(\w+)\]/);
        const relNameMatch = restStr.match(/"([^"]+)"/);

        const relFieldName = relFieldsMatch ? relFieldsMatch[1] : fieldName;
        const relRefName = relRefsMatch ? relRefsMatch[1] : "id";
        const relName = relNameMatch ? relNameMatch[1] : "";

        // One-to-one or one-to-many from this model's perspective
        // If optional (nullable), it's "zero or one" on the target side
        if (isOptional) {
          relationships.push(`${modelName} ||--o| ${cleanType} : "${relName || fieldName}"`);
        } else {
          relationships.push(`${modelName} ||--|{ ${cleanType} : "${relName || fieldName}"`);
        }

        // Still add the field as a FK reference
        fields.push({
          name: fieldName,
          type: cleanType + " FK",
          isPk,
          isUnique,
        });
        continue;
      }

      // Regular scalar field
      // Map Prisma types to Mermaid-compatible types
      const displayType = mapPrismaType(rawType);
      fields.push({
        name: fieldName,
        type: displayType,
        isPk,
        isUnique,
      });
    }

    models.set(modelName, { fields, relationships });
  }

  // Post-process: add "many" relationships for array fields we skipped
  // We need to find models that have array fields pointing to other models
  // and add the reverse relationship line
  const arrayRegex = /^model\s+(\w+)\s*\{/gm;
  while ((match = arrayRegex.exec(content)) !== null) {
    const modelName = match[1];
    const blockStart = match.index + match[0].length;

    let depth = 1;
    let i = blockStart;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      i++;
    }
    const blockContent = content.slice(blockStart, i - 1);

    const lines = blockContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)(?:\s+(.*))?$/);
      if (!fieldMatch) continue;

      const [, fieldName, rawType] = fieldMatch;
      if (!rawType.endsWith("[]")) continue;

      const cleanType = rawType.replace("[]", "");
      // Skip enum arrays and scalar arrays (String[], Json)
      if (["String", "Int", "Boolean", "Json", "DateTime"].includes(cleanType)) continue;

      const info = models.get(modelName);
      if (info && !info.relationships.some(r => r.includes(cleanType) && r.startsWith(modelName))) {
        // This model has a "many" side → add it as a "has many" relationship
        info.relationships.push(`${modelName} ||--o{ ${cleanType} : "${fieldName}"`);
      }
    }
  }

  return models;
}

function mapPrismaType(rawType: string): string {
  const cleanType = rawType.replace("?", "").replace("[]", "");

  const typeMap: Record<string, string> = {
    "String": "String",
    "Int": "Int",
    "Boolean": "Boolean",
    "DateTime": "DateTime",
    "Json": "Json",
    "Float": "Float",
    "Decimal": "Decimal",
    "Bytes": "Bytes",
    "BigInt": "BigInt",
  };

  // Check if it's an enum
  // Enums are referenced by their name in Prisma
  if (!typeMap[cleanType] && !cleanType.startsWith("Unsupported")) {
    // It's likely an enum reference or a model reference
    return cleanType;
  }

  return typeMap[cleanType] || cleanType;
}

/**
 * Parse Prisma enums for the erDiagram.
 */
function parsePrismaEnums(content: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();

  const enumRegex = /^enum\s+(\w+)\s*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = enumRegex.exec(content)) !== null) {
    const enumName = match[1];
    const blockStart = match.index + match[0].length;

    let depth = 1;
    let i = blockStart;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      i++;
    }
    const blockContent = content.slice(blockStart, i - 1);

    const values: string[] = [];
    for (const line of blockContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      values.push(trimmed);
    }

    enums.set(enumName, values);
  }

  return enums;
}
