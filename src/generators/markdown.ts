import path from "node:path";
import fs from "node:fs";
import type {
  UsmFile,
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  GenerationResult,
  Flow,
  Contract,
  FeatureTest,
  Interface,
  Decision,
  Risk,
  RoadmapItem,
  Module,
  FeatureRoute,
  Principle,
  ServiceInfrastructure,
  LocalDevelopment,
} from "../types.js";
import { findUsmFiles, findAllUsmFiles, parseUsmFile, isServiceFile, isFeatureFile, findAllUsmDirs } from "../index.js";
import { generateSequenceDiagrams } from "./mermaid.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known app directories in the monorepo (kind: web-app, mobile-app, desktop-app) */
const APP_DIRS: string[] = [];

/** Service kinds that map to shared services (full shape) */
const SHARED_SERVICE_KINDS = new Set(["idp", "llm-gateway", "agent-flows", "database", "cache", "queue", "api"]);

/**
 * Is this service file a seed-data file?
 * Seed data files use type: "database" (repurposed) with an $id containing "seed".
 * They are routed to the seed-data generator instead of the data-model generator.
 */
function isSeedDataFile(file: ServiceUsm): boolean {
  return file.type === "database" && (file.$id.includes("seed") || (file.name || "").toLowerCase().includes("seed"));
}

/** Service kinds that map to packages (light shape) */
const PACKAGE_KINDS = new Set(["ui-kit", "shared-util", "auth-lib", "orm", "llm-wrapper", "config", "types"]);

/**
 * Classify a service reference from system.usm services[] (lightweight —
 * only id, name, ref, port) into app, shared-service, or package.
 * Uses the service `id` and `ref` to determine classification.
 */
function classifyServiceById(svc: { id: string; name?: string; ref?: string; port?: number }): "app" | "shared-service" | "package" {
  // Services with refs pointing to apps/* are app services
  if (svc.ref?.includes("apps/")) return "app";
  // Services whose id matches known infrastructure patterns are shared services
  if (SHARED_SERVICE_KINDS.has(svc.id)) return "shared-service";
  // Default: treat as package
  return "package";
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate markdown documentation from a .usm file.
 *
 * @param sourceFilePath — absolute path to the .usm source file. For features,
 *   this is used to derive the output folder hierarchy (mirrors the .usm source
 *   structure). If omitted, the slug is derived from $id (legacy flat behaviour).
 */
export function generateMarkdown(
  file: UsmFile,
  monorepoRoot?: string,
  sourceFilePath?: string
): GenerationResult {
  const root = monorepoRoot || process.cwd();

  switch (file.$type) {
    case "system":
      return generateSystemMarkdown(file, root);
    case "service":
      return generateServiceMarkdown(file, root);
    case "data":
      return generateDataMarkdown(file, root);
    case "feature":
      return generateFeatureMarkdown(file, root, sourceFilePath);
    default:
      throw new Error(`Cannot generate markdown for $type: ${(file as UsmFile).$type}`);
  }
}

// ─── System → Platform README ─────────────────────────────────────────────────

/**
 * Read the installed package version for badges (best-effort).
 */
function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function generateSystemMarkdown(file: SystemUsm, root: string): GenerationResult {
  // Rich, data-driven homepage (VitePress home layout) derived from system.usm.
  // Used as both developer docs landing and help-docs landing (docs.usm.dev).
  const lines: string[] = [];
  const name = file.identity.name;
  const tagline = (file.summary || "").split("\n")[0].trim();
  const repo = file.identity.repository || "";
  const version = readPackageVersion();
  const generatedAt = new Date().toISOString().slice(0, 10);

  // VitePress home frontmatter
  lines.push("---");
  lines.push("layout: home");
  lines.push("");
  lines.push("hero:");
  lines.push(`  name: ${JSON.stringify(name)}`);
  lines.push(`  text: ${JSON.stringify("Structured source of truth for agentic systems")}`);
  lines.push(`  tagline: ${JSON.stringify(tagline.slice(0, 160))}`);
  lines.push("  actions:");
  lines.push("    - theme: brand");
  lines.push('      text: Get Started');
  lines.push("      link: /getting-started");
  lines.push("    - theme: alt");
  lines.push('      text: Schema Reference');
  lines.push("      link: /schema-reference");
  if (repo) {
    lines.push("    - theme: alt");
    lines.push('      text: GitHub');
    lines.push(`      link: ${JSON.stringify(repo)}`);
  }
  lines.push("");

  // Principle cards (from system.principles)
  if (file.principles && file.principles.length > 0) {
    lines.push("features:");
    for (const p of file.principles.slice(0, 6)) {
      lines.push(`  - title: ${JSON.stringify(p.name)}`);
      lines.push(`    details: ${JSON.stringify(p.statement)}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  lines.push(`# ${name}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");
  lines.push(`::: info Version \`${version}\` · Generated ${generatedAt}`);
  lines.push("This site is **fully generated** from `.usm` files. Edit the source of truth, not the markdown.");
  lines.push(":::");
  lines.push("");

  // Spec-first workflow diagram
  lines.push("## Spec-first workflow");
  lines.push("");
  lines.push("USM is designed for AI agents and humans to share one structured source of truth.");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart LR");
  lines.push("  A[Discuss feature] --> B[Draft .usm via MCP]");
  lines.push("  B --> C[Human reviews markdown]");
  lines.push("  C --> D[Write + validate .usm]");
  lines.push("  D --> E[Implement in code]");
  lines.push("  E --> F[usm generate]");
  lines.push("  F --> G[Docs · Mermaid · OpenAPI · AGENTS.md]");
  lines.push("  G --> H[Mark feature built]");
  lines.push("```");
  lines.push("");

  // Quick stats
  const allServiceRefs = file.services || [];
  const appServiceIds = new Set<string>();
  const sharedServiceIds = new Set<string>();
  const packageIds = new Set<string>();
  for (const svc of allServiceRefs) {
    const classification = classifyServiceById(svc);
    if (classification === "app") appServiceIds.add(svc.id);
    else if (classification === "shared-service") sharedServiceIds.add(svc.id);
    else packageIds.add(svc.id);
  }
  const featureCount = (file.index || []).length;
  const builtCount = (file.index || []).filter((f) => f.status === "built" || f.status === "active").length;

  lines.push("## At a glance");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Features | ${featureCount} (${builtCount} built) |`);
  lines.push(`| App services | ${appServiceIds.size} |`);
  lines.push(`| Shared services | ${sharedServiceIds.size} |`);
  lines.push(`| Packages | ${packageIds.size} |`);
  lines.push("");

  // Featured example (tabs: YAML vs what it produces)
  if (file.index && file.index.length > 0) {
    const exampleFeature = file.index.find(
      (f) => f.status === "built" || f.status === "active" || !f.status,
    );
    if (exampleFeature) {
      const usmPath = path.resolve(root, exampleFeature.ref);
      if (fs.existsSync(usmPath)) {
        const usmContent = fs.readFileSync(usmPath, "utf-8");
        const exampleLines = usmContent.split("\n").slice(0, 28);
        const truncated = usmContent.split("\n").length > 28;
        lines.push("## Featured example");
        lines.push("");
        lines.push(`A real feature from this project: **${exampleFeature.name || exampleFeature.id}** (\`${exampleFeature.ref}\`).`);
        lines.push("");
        lines.push("::: code-group");
        lines.push("");
        lines.push("```yaml [feature.usm]");
        lines.push(exampleLines.join("\n"));
        if (truncated) lines.push("# … truncated");
        lines.push("```");
        lines.push("");
        lines.push("```bash [what it generates]");
        lines.push("usm generate");
        lines.push("# → markdown docs (this site)");
        lines.push("# → Mermaid diagrams");
        lines.push("# → OpenAPI / ArchiMate / TOGAF (when present)");
        lines.push("# → AGENTS.md + rules files for Cursor / Claude / Copilot");
        lines.push("# → Vitest specs from contracts + tests");
        lines.push("```");
        lines.push("");
        lines.push(":::");
        lines.push("");
      }
    }
  }

  // Identity
  lines.push("## Identity");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Name | ${file.identity.name} |`);
  lines.push(`| Domain | ${file.identity.domain} |`);
  if (file.identity.contact) lines.push(`| Contact | ${file.identity.contact} |`);
  if (repo) lines.push(`| Repository | <${repo}> |`);
  lines.push("");

  // Services lists (kept for navigation)
  const appServicesFromSystem = allServiceRefs.filter((s) => appServiceIds.has(s.id));
  if (appServicesFromSystem.length > 0) {
    lines.push("## App services");
    lines.push("");
    for (const svc of appServicesFromSystem) {
      const port = svc.port ? ` (port ${svc.port})` : "";
      lines.push(`- **${svc.name || slugToTitle(svc.id)}**${port}`);
    }
    lines.push("");
  }

  const sharedServicesFromSystem = allServiceRefs.filter((s) => sharedServiceIds.has(s.id));
  if (sharedServicesFromSystem.length > 0) {
    lines.push("## Shared services");
    lines.push("");
    for (const svc of sharedServicesFromSystem) {
      lines.push(`- [${svc.name || slugToTitle(svc.id)}](/shared-services/${svc.id}/overview)`);
    }
    lines.push("");
  }

  // Principles (detailed, after cards)
  if (file.principles && file.principles.length > 0) {
    lines.push("## Principles");
    lines.push("");
    for (const p of file.principles) {
      lines.push(`### ${p.name}`);
      lines.push("");
      lines.push(p.statement);
      lines.push("");
      if (p.rationale) {
        lines.push(`**Why:** ${p.rationale}`);
        lines.push("");
      }
    }
  }

  // Roles
  if (file.roles && file.roles.length > 0) {
    lines.push("## Who it's for");
    lines.push("");
    for (const role of file.roles) {
      lines.push(`- **${role.name}** — ${role.description.split("\n")[0].trim()}`);
    }
    lines.push("");
  }

  // Next steps
  lines.push("## Next steps");
  lines.push("");
  lines.push("| Go here | If you want to… |");
  lines.push("|--------|------------------|");
  lines.push("| [Getting Started](/getting-started) | Install USM and run your first `init` → `scan` → `generate` |");
  lines.push("| [Schema Reference](/schema-reference) | Understand every field in a `.usm` file |");
  lines.push("| [CLI Reference](/cli-reference) | See every `usm` command and flag |");
  lines.push("| [MCP Tools](/mcp-reference) | Wire agents into the spec-first loop |");
  lines.push("| [Agent Setup Guide](/agent-setup-guide) | Connect Cursor / Claude / Copilot |");
  lines.push("");

  if (repo) {
    lines.push("::: tip Contribute");
    lines.push(`Source of truth: [\`.usm/\` on GitHub](${repo}/tree/main/.usm). Edit the specs, not the generated markdown.`);
    lines.push(":::");
    lines.push("");
  }

  return {
    outputs: [
      {
        path: `${root}/.usm-workspace/docs/README.md`,
        content: lines.join("\n"),
      },
    ],
  };
}

// ─── Service → Per-Service or Per-Package Docs ────────────────────────────────

/**
 * Determine which bucket a service belongs to:
 * - 'app' → apps/{name}/.usm-workspace/docs/ (full shape)
 * - 'shared-service' → .usm-workspace/docs/shared-services/{name}/ (full shape)
 * - 'package' → .usm-workspace/docs/packages/{name}/ (light shape)
 * - 'data' → skip (handled by generateDataModelDoc separately)
 */
function classifyService(file: ServiceUsm): "app" | "shared-service" | "package" | "data" | "seed-data" {
  const appName = appFromPaths(file.paths || []);

  // Seed data files (type: database + $id contains "seed") → separate seed-data generator
  if (isSeedDataFile(file)) {
    return "seed-data";
  }

  // Data files (type: database, $id containing "models") go to data/ not packages/
  if (file.type === "database" || file.$id.endsWith("/models")) {
    return "data";
  }

  // If paths point to apps/*, it's an app
  if (appName !== "unknown") return "app";

  // If paths point to packages/*, it's a package
  if (file.paths?.some(p => p.startsWith("packages/"))) {
    return "package";
  }

  // Infrastructure services (paths point to docker-compose or no paths)
  if (SHARED_SERVICE_KINDS.has(file.type) || file.paths?.some(p => p.includes("docker-compose") || p.includes("compose"))) {
    return "shared-service";
  }

  if (["idp", "llm-gateway", "agent-flows", "database", "cache", "queue"].includes(file.type)) {
    return "shared-service";
  }

  if (SHARED_SERVICE_KINDS.has(file.type)) {
    return "shared-service";
  }

  return "package";
}

/**
 * Get the slug name from a service's $id.
 * E.g. "smith-gray/the-architect" → "the-architect"
 */
function serviceSlug(file: ServiceUsm): string {
  return file.$id.split("/").pop() || "unknown";
}

function generateServiceMarkdown(file: ServiceUsm, root: string): GenerationResult {
  const classification = classifyService(file);
  const slug = serviceSlug(file);

  switch (classification) {
    case "app":
      return generateAppServiceDocs(file, root, slug);
    case "shared-service":
      return generateSharedServiceDocs(file, root, slug);
    case "package":
      return generatePackageDocs(file, root, slug);
    case "data":
      // Data files are handled by generateDataModelDoc aggregator, skip here
      return { outputs: [] };
    case "seed-data":
      // Seed data files are handled by generateSeedDataDoc aggregator, skip here
      return { outputs: [] };
  }
}

// ─── Data → Data Model Doc ────────────────────────────────────────────────────

function generateDataMarkdown(file: DataUsm, root: string): GenerationResult {
  // Data files generate their content into .usm-workspace/docs/data/models.md
  // This is handled by generateDataModelDoc in the aggregator pass.
  // Return empty here — the data file's output is generated in the aggregator.
  return { outputs: [] };
}

// ─── Feature → Per-App Feature Doc ────────────────────────────────────────────

function generateFeatureMarkdown(
  file: FeatureUsm,
  root: string,
  sourceFilePath?: string
): GenerationResult {
  const lines: string[] = [];

  // Derive the feature slug from the source file path
  // Now features live in sub-.usm/ directories, so we need to find the
  // features/ portion relative to any .usm/ directory
  let featureSlug: string;
  if (sourceFilePath) {
    // Find the .usm/features/ portion — works for both root .usm and sub-.usm dirs
    // e.g., "/root/apps/the-architect/.usm/features/agent/events.usm" → "agent/events"
    // e.g., "/root/.usm/features/agent/events.usm" → "agent/events"
    const usmIndex = sourceFilePath.indexOf("/.usm/features/");
    if (usmIndex !== -1) {
      const relFromFeatures = sourceFilePath.slice(usmIndex + "/.usm/features/".length);
      featureSlug = relFromFeatures.replace(/\.usm$/, "");
    } else {
      // Legacy: relative from root .usm/features/
      const usmFeaturesDir = path.resolve(root, ".usm", "features");
      const relFromFeatures = path.relative(usmFeaturesDir, sourceFilePath);
      featureSlug = relFromFeatures.replace(/\.usm$/, "");
    }
  } else {
    const idAfterSystem = file.$id.replace(/^[^/]+\/(?=.)/, "");
    featureSlug = idAfterSystem.replace(/\//g, "-");
  }

  const statusBadge = file.status ? ` [${file.status}]` : "";
  lines.push(`# ${file.$id}${statusBadge}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  if (file.status) {
    lines.push(`> **Status**: ${file.status}`);
    lines.push("");
  }

  // Intent
  lines.push("## Intent");
  lines.push("");
  lines.push(file.intent);
  lines.push("");

  // Decisions
  if (file.decisions && file.decisions.length > 0) {
    lines.push("## Decisions");
    lines.push("");
    renderDecisions(lines, file.decisions);
  }

  // Flows
  if (file.flows && file.flows.length > 0) {
    lines.push("## Flows");
    lines.push("");
    for (const flow of file.flows) {
      renderFlow(lines, flow);
    }

    // Flow Diagrams (Mermaid sequence diagrams)
    const mermaidDiagrams = generateSequenceDiagrams(file);
    if (mermaidDiagrams) {
      lines.push("## Flow Diagrams");
      lines.push("");
      lines.push(mermaidDiagrams);
      lines.push("");
    }
  }

  // Interfaces
  if (file.interfaces && file.interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    for (const iface of file.interfaces) {
      renderInterface(lines, iface);
    }
  }

  // Contracts
  if (file.contracts && file.contracts.length > 0) {
    lines.push("## Contracts");
    lines.push("");
    for (const contract of file.contracts) {
      renderContract(lines, contract);
    }
  }

  // Tests
  if (file.tests && file.tests.length > 0) {
    lines.push("## Tests");
    lines.push("");
    for (const test of file.tests) {
      renderTest(lines, test);
    }
  }

  // Implementation
  if (file.implementation) {
    lines.push("## Implementation");
    lines.push("");
    const impl = file.implementation;
    if (impl.primary) lines.push(`- **Primary**: ${impl.primary}`);
    if (impl.ui) lines.push(`- **UI**: ${impl.ui}`);
    if (impl.test_code) lines.push(`- **Test code**: ${impl.test_code}`);
    if (impl.test_code_status) lines.push(`- **Test code status**: ${impl.test_code_status}`);
    if (impl.test_code_generated_from) {
      lines.push(`- **Test code generated from**: ${impl.test_code_generated_from}`);
    }
    if (impl.test_code_last_generated) {
      lines.push(`- **Test code last generated**: ${impl.test_code_last_generated}`);
    }
    lines.push("");
  }

  // See also
  if (file.see_also && file.see_also.length > 0) {
    lines.push("## See Also");
    lines.push("");
    for (const ref of file.see_also) {
      lines.push(`- ${ref}`);
    }
    lines.push("");
  }

  // Output path: determine which app this feature belongs to
  const serviceDir = file.$service
    ? file.$service.split("/")[1] || "unknown"
    : "unknown";
  const appDir = `apps/${serviceDir}`;

  const hasSubPath = featureSlug.includes("/");
  const featureOutputName = hasSubPath
    ? `${featureSlug}.md`
    : `${featureSlug}/index.md`;
  const outputPath = `${root}/${appDir}/.usm-workspace/docs/features/${featureOutputName}`;

  return {
    outputs: [{ path: outputPath, content: lines.join("\n") }],
  };
}

// ─── Area Overview (auto-generated stubs) ───────────────────────────────────

interface SubFeatureInfo {
  name: string;
  slug: string;
  type: string;
  routeCount: number;
  summaryPeek: string;
  service: string;
}

/**
 * Generate auto-generated area overview stubs for any folder under
 * .usm/features/ that has sub-features but no umbrella .usm file.
 */
export function generateAreaOverviews(root: string): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  // Scan all .usm/ directories across the monorepo for feature subdirectories
  const usmDirs = findAllUsmDirs(root);

  // Group features by their parent .usm directory (per-app, per-service, etc.)
  for (const usmDir of usmDirs) {
    const featuresDir = path.join(usmDir, "features");

    if (!fs.existsSync(featuresDir)) continue;

    const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    const areaDirs = entries.filter(e => e.isDirectory());

    for (const areaDir of areaDirs) {
      const areaName = areaDir.name;
      const umbrellaPath = path.join(featuresDir, `${areaName}.usm`);

      if (fs.existsSync(umbrellaPath)) {
        continue;
      }

      const areaDirPath = path.join(featuresDir, areaName);
      const areaFiles = findUsmFiles(areaDirPath);

      if (areaFiles.length === 0) {
        continue;
      }

      const subFeatures: SubFeatureInfo[] = [];
      let primaryService: string | undefined;

      for (const filePath of areaFiles) {
        try {
          const parsed = parseUsmFile(filePath);
          if (!isFeatureFile(parsed)) continue;

          const relFromFeatures = path.relative(featuresDir, filePath).replace(/\.usm$/, "");
          const name = path.basename(filePath, ".usm");
          const routeCount = (parsed.flows?.length ?? 0) + (parsed.interfaces?.length ?? 0);
          const summaryPeek = parsed.summary
            ? parsed.summary.substring(0, 100).replace(/\n/g, " ").trim()
            : "TODO: describe";

          subFeatures.push({
            name,
            slug: relFromFeatures,
            type: parsed.$type,
            routeCount,
            summaryPeek,
            service: parsed.$service || "unknown",
          });

          if (!primaryService) {
            primaryService = parsed.$service;
          }
        } catch {
          // Skip unparseable files
        }
      }

      if (subFeatures.length === 0) {
        continue;
      }

      const serviceDir = primaryService
        ? primaryService.split("/")[1] || "unknown"
        : "unknown";
      const appDir = `apps/${serviceDir}`;

      const content = buildAreaOverviewContent(areaName, subFeatures, serviceDir);
      const outputPath = `${root}/${appDir}/.usm-workspace/docs/features/${areaName}/index.md`;

      outputs.push({ path: outputPath, content });
    }
  }

  return { outputs };
}

function buildAreaOverviewContent(
  areaName: string,
  subFeatures: SubFeatureInfo[],
  serviceDir: string
): string {
  const lines: string[] = [];
  const title = areaName.charAt(0).toUpperCase() + areaName.slice(1);

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> Auto-generated area overview. Hand-edit \`.usm/features/${areaName}.usm\` to override this.`);
  lines.push("");

  const totalSubs = subFeatures.length;
  lines.push(`This area contains ${totalSubs} features related to ${title.toLowerCase()} within the`);
  lines.push(`${serviceDir.charAt(0).toUpperCase() + serviceDir.slice(1)} product.`);
  lines.push("");

  lines.push("## Sub-features");
  lines.push("");
  lines.push("| Feature | Type | Routes | Description |");
  lines.push("|---------|------|--------|-------------|");
  for (const sf of subFeatures) {
    const link = `[${sf.name}](${sf.name}.md)`;
    const routes = sf.routeCount > 0 ? `${sf.routeCount} API` : "0";
    lines.push(`| ${link} | ${sf.type} | ${routes} | ${sf.summaryPeek} |`);
  }
  lines.push("");

  const totalRoutes = subFeatures.reduce((sum, sf) => sum + sf.routeCount, 0);
  lines.push("## Implementation");
  lines.push(`- 0 pages, ${totalRoutes} API endpoints across ${totalSubs} features`);
  lines.push("");

  return lines.join("\n");
}

// ─── App Service Docs (Full Shape) ────────────────────────────────────────────

function generateAppServiceDocs(file: ServiceUsm, root: string, slug: string): GenerationResult {
  const appRoot = `${root}/apps/${slug}/.usm-workspace/docs`;
  const outputs: GenerationResult["outputs"] = [];

  // README.md — entry point
  outputs.push({
    path: `${appRoot}/README.md`,
    content: buildServiceReadme(file, slug, "app"),
  });

  // overview.md — top-down view with surface tables (populated in aggregator pass)
  outputs.push({
    path: `${appRoot}/overview.md`,
    content: buildServiceOverview(file, slug),
  });

  // Architecture section
  outputs.push({ path: `${appRoot}/architecture/README.md`, content: sectionReadme("Architecture", "System design and diagrams") });
  outputs.push({ path: `${appRoot}/architecture/overview.md`, content: buildArchOverview(file, slug) });
  outputs.push({ path: `${appRoot}/architecture/system-architecture.md`, content: buildArchSystemArchitecture(file, slug) });
  outputs.push({ path: `${appRoot}/architecture/modules.md`, content: buildModulesDoc(file) });
  outputs.push({ path: `${appRoot}/architecture/data-model.md`, content: buildArchDataModel(file, slug) });
  outputs.push({ path: `${appRoot}/architecture/security.md`, content: buildArchSecurity(file, slug) });

  // Features section (populated by feature generator)
  outputs.push({ path: `${appRoot}/features/README.md`, content: sectionReadme("Features", "Feature documentation") });

  // API section
  outputs.push({ path: `${appRoot}/api/README.md`, content: sectionReadme("API", "API endpoints and contracts") });
  outputs.push({ path: `${appRoot}/api/reference.md`, content: placeholder("API reference", file) });
  outputs.push({ path: `${appRoot}/api/contracts.md`, content: placeholder("API contracts", file) });

  // UI section
  outputs.push({ path: `${appRoot}/ui/README.md`, content: sectionReadme("UI", "Pages and elements") });
  outputs.push({ path: `${appRoot}/ui/ui-map.md`, content: placeholder("UI map", file) });
  outputs.push({ path: `${appRoot}/ui/elements.md`, content: placeholder("Elements index", file) });

  // Deployment section
  outputs.push({ path: `${appRoot}/deployment/README.md`, content: sectionReadme("Deployment", "Deployment docs and runbooks") });
  outputs.push({ path: `${appRoot}/deployment/local-dev.md`, content: buildDeployLocalDev(file, slug) });
  outputs.push({ path: `${appRoot}/deployment/production.md`, content: buildDeployProduction(file, slug) });

  // Testing section
  outputs.push({ path: `${appRoot}/testing/README.md`, content: sectionReadme("Testing", "Test specs and strategy") });
  outputs.push({ path: `${appRoot}/testing/specs.md`, content: placeholder("Test specifications", file) });

  // Operations section
  outputs.push({ path: `${appRoot}/operations/README.md`, content: sectionReadme("Operations", "Observability, incidents, backups") });
  outputs.push({ path: `${appRoot}/operations/observability.md`, content: buildOpsObservability(file, slug) });
  outputs.push({ path: `${appRoot}/operations/incident-response.md`, content: buildOpsIncidentResponse(file, slug) });

  // Decisions section
  outputs.push({ path: `${appRoot}/decisions/README.md`, content: sectionReadme("Decisions", "Architecture Decision Records") });
  outputs.push({ path: `${appRoot}/decisions/0001-template.md`, content: adrTemplate() });

  // Risks + Roadmap
  outputs.push({ path: `${appRoot}/risks.md`, content: buildRisksMd(file) });
  outputs.push({ path: `${appRoot}/roadmap.md`, content: buildRoadmapMd(file) });

  // New USM-migrated content — rendered from service .usm fields

  // Project Structure
  if (file.project_structure) {
    outputs.push({
      path: `${appRoot}/architecture/project-structure.md`,
      content: buildProjectStructureDoc(file),
    });
  }

  // RBAC
  if (file.rbac) {
    outputs.push({
      path: `${appRoot}/architecture/rbac.md`,
      content: buildRbacDoc(file),
    });
  }

  // Tech Stack (detailed)
  if (file.tech_stack && Object.keys(file.tech_stack).length > 0) {
    outputs.push({
      path: `${appRoot}/architecture/tech-stack.md`,
      content: buildTechStackDoc(file),
    });
  }

  // Conventions (service-level)
  if (file.conventions && file.conventions.length > 0) {
    outputs.push({
      path: `${appRoot}/architecture/conventions.md`,
      content: buildConventionsDoc(file),
    });
  }

  // Runtime Details (agent runtime architecture)
  if (file.runtime_details) {
    outputs.push({
      path: `${appRoot}/architecture/runtime.md`,
      content: buildRuntimeDetailsDoc(file),
    });
  }

  // Testing Details
  if (file.testing_details) {
    outputs.push({
      path: `${appRoot}/testing/details.md`,
      content: buildTestingDetailsDoc(file),
    });
  }

  // Patterns
  if (file.patterns && file.patterns.length > 0) {
    outputs.push({
      path: `${appRoot}/architecture/patterns.md`,
      content: buildPatternsDoc(file),
    });
  }

  // Infrastructure (from service .usm infrastructure: field)
  if (file.infrastructure) {
    outputs.push({
      path: `${appRoot}/architecture/infrastructure.md`,
      content: buildInfrastructureDoc(file),
    });
  }

  return { outputs };
}

// ─── Shared Service Docs (Full Shape) ─────────────────────────────────────────

function generateSharedServiceDocs(file: ServiceUsm, root: string, slug: string): GenerationResult {
  const svcRoot = `${root}/.usm-workspace/docs/shared-services/${slug}`;
  const outputs: GenerationResult["outputs"] = [];

  // README.md — entry point
  outputs.push({
    path: `${svcRoot}/README.md`,
    content: buildServiceReadme(file, slug, "shared-service"),
  });

  // overview.md — top-down view (surface tables populated in aggregator pass)
  outputs.push({
    path: `${svcRoot}/overview.md`,
    content: buildServiceOverview(file, slug),
  });

  // Architecture section
  outputs.push({ path: `${svcRoot}/architecture/README.md`, content: sectionReadme("Architecture", "System design") });
  outputs.push({ path: `${svcRoot}/architecture/overview.md`, content: placeholder("Architecture overview", file) });
  outputs.push({ path: `${svcRoot}/architecture/system-architecture.md`, content: placeholder("System architecture", file) });
  outputs.push({ path: `${svcRoot}/architecture/modules.md`, content: buildModulesDoc(file) });
  outputs.push({ path: `${svcRoot}/architecture/data-model.md`, content: placeholder("Data model", file) });
  outputs.push({ path: `${svcRoot}/architecture/security.md`, content: placeholder("Security model", file) });

  // Features section (for infrastructure services that may have their own features)
  outputs.push({ path: `${svcRoot}/features/README.md`, content: sectionReadme("Features", "Feature documentation") });

  // API section
  outputs.push({ path: `${svcRoot}/api/README.md`, content: sectionReadme("API", "Service endpoints") });
  outputs.push({ path: `${svcRoot}/api/reference.md`, content: placeholder("API reference", file) });
  outputs.push({ path: `${svcRoot}/api/contracts.md`, content: placeholder("API contracts", file) });

  // UI section
  outputs.push({ path: `${svcRoot}/ui/README.md`, content: sectionReadme("UI", "Service pages") });
  outputs.push({ path: `${svcRoot}/ui/ui-map.md`, content: placeholder("UI map", file) });
  outputs.push({ path: `${svcRoot}/ui/elements.md`, content: placeholder("Elements index", file) });

  // Deployment section
  outputs.push({ path: `${svcRoot}/deployment/README.md`, content: sectionReadme("Deployment", "Deployment docs and runbooks") });
  outputs.push({ path: `${svcRoot}/deployment/local-dev.md`, content: placeholder("Local development", file) });
  outputs.push({ path: `${svcRoot}/deployment/production.md`, content: placeholder("Production deployment", file) });

  // Testing section
  outputs.push({ path: `${svcRoot}/testing/README.md`, content: sectionReadme("Testing", "Test specs") });
  outputs.push({ path: `${svcRoot}/testing/specs.md`, content: placeholder("Test specifications", file) });

  // Operations section
  outputs.push({ path: `${svcRoot}/operations/README.md`, content: sectionReadme("Operations", "Observability, incidents, backups") });
  outputs.push({ path: `${svcRoot}/operations/observability.md`, content: placeholder("Observability", file) });
  outputs.push({ path: `${svcRoot}/operations/incident-response.md`, content: placeholder("Incident response", file) });

  // Decisions section
  outputs.push({ path: `${svcRoot}/decisions/README.md`, content: sectionReadme("Decisions", "Architecture Decision Records") });
  outputs.push({ path: `${svcRoot}/decisions/0001-template.md`, content: adrTemplate() });

  // Risks + Roadmap
  outputs.push({ path: `${svcRoot}/risks.md`, content: buildRisksMd(file) });
  outputs.push({ path: `${svcRoot}/roadmap.md`, content: buildRoadmapMd(file) });

  // Infrastructure (from service .usm infrastructure: field)
  if (file.infrastructure) {
    outputs.push({
      path: `${svcRoot}/architecture/infrastructure.md`,
      content: buildInfrastructureDoc(file),
    });
  }

  return { outputs };
}

// ─── Package Docs (Light Shape) ───────────────────────────────────────────────

function generatePackageDocs(file: ServiceUsm, root: string, slug: string): GenerationResult {
  const pkgRoot = `${root}/.usm-workspace/docs/packages/${slug}`;
  const outputs: GenerationResult["outputs"] = [];

  // README.md
  outputs.push({
    path: `${pkgRoot}/README.md`,
    content: buildPackageReadme(file, slug),
  });

  // api.md
  outputs.push({
    path: `${pkgRoot}/api.md`,
    content: buildPackageApiMd(file, slug),
  });

  // architecture.md
  outputs.push({
    path: `${pkgRoot}/architecture.md`,
    content: buildPackageArchitectureMd(file, slug),
  });

  // testing.md
  outputs.push({
    path: `${pkgRoot}/testing.md`,
    content: buildPackageTestingMd(file, slug),
  });

  // patterns.md — from service .usm patterns field
  if (file.patterns && file.patterns.length > 0) {
    outputs.push({
      path: `${pkgRoot}/patterns.md`,
      content: buildPatternsDoc(file),
    });
  }

  return { outputs };
}

// ─── Content Builders ─────────────────────────────────────────────────────────

function buildServiceReadme(file: ServiceUsm, slug: string, kind: "app" | "shared-service"): string {
  const lines: string[] = [];
  const title = displayName(file, slug);
  const badge = file.status ? ` [${file.status}]` : "";

  lines.push(`# ${title}${badge}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  // Quick stats
  lines.push("## Quick Stats");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Type | ${file.type} |`);
  lines.push(`| Runtime | ${file.runtime} |`);
  if (file.port) lines.push(`| Port | ${file.port} |`);
  lines.push("");

  // Depends On (cross-references)
  if (file.depends_on && file.depends_on.length > 0) {
    lines.push("## Depends On");
    lines.push("");
    for (const dep of file.depends_on) {
      const depSlug = dep.split("/").pop() || dep;
      lines.push(`- ${depSlug}`);
    }
    lines.push("");
  }

  // Sections
  lines.push("## Sections");
  lines.push("");
  lines.push("- [Overview](overview.md)");
  lines.push("- [Architecture](architecture/README.md)");
  lines.push("- [Features](features/README.md)");
  lines.push("- [API](api/README.md)");
  lines.push("- [UI](ui/README.md)");
  lines.push("- [Deployment](deployment/README.md)");
  lines.push("- [Testing](testing/README.md)");
  lines.push("- [Operations](operations/README.md)");
  lines.push("- [Decisions](decisions/README.md)");
  lines.push("- [Risks](risks.md)");
  lines.push("- [Roadmap](roadmap.md)");
  lines.push("");

  return lines.join("\n");
}

function buildServiceOverview(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);
  const badge = file.status ? ` [${file.status}]` : "";

  lines.push(`# ${title}${badge}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  // Identity table
  lines.push("## Identity");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Type | ${file.type} |`);
  lines.push(`| Runtime | ${file.runtime} |`);
  if (file.port) lines.push(`| Port | ${file.port} |`);
  if (file.status) lines.push(`| Status | ${file.status} |`);
  lines.push("");

  // Surface — placeholder tables that will be filled by generateSurfaceTables()
  // Only rendered if features have UI pages or API endpoints
  lines.push("<!-- USM:SURFACE:SECTION_START -->");
  lines.push("<!-- USM:SURFACE:UI_START -->");
  lines.push("<!-- USM:SURFACE:UI_END -->");
  lines.push("");
  lines.push("<!-- USM:SURFACE:API_START -->");
  lines.push("<!-- USM:SURFACE:API_END -->");
  lines.push("<!-- USM:SURFACE:SECTION_END -->");
  lines.push("");

  // Properties
  lines.push("## Properties");
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Type | ${file.type} |`);
  lines.push(`| Runtime | ${file.runtime} |`);
  if (file.port) lines.push(`| Port | ${file.port} |`);
  if (file.status) lines.push(`| Status | ${file.status} |`);
  if (file.depends_on && file.depends_on.length > 0) {
    lines.push(`| Depends On | ${file.depends_on.join(", ")} |`);
  }
  lines.push("");

  // Paths
  if (file.paths && file.paths.length > 0) {
    lines.push("## Paths");
    lines.push("");
    for (const p of file.paths) {
      lines.push(`- \`${p}\``);
    }
    lines.push("");
  }

  // Dev Setup
  if (file.dev) {
    lines.push("## Dev Setup");
    lines.push("");
    if (file.dev.command) lines.push(`- **Command**: \`${file.dev.command}\``);
    if (file.dev.url) lines.push(`- **URL**: ${file.dev.url}`);
    if (file.dev.env && Object.keys(file.dev.env).length > 0) {
      lines.push("- **Env vars**:");
      for (const [key, val] of Object.entries(file.dev.env)) {
        lines.push(`  - \`${key}\`: ${val}`);
      }
    }
    lines.push("");
  }

  // Prod Config
  if (file.prod) {
    lines.push("## Prod Config");
    lines.push("");
    if (file.prod.url) lines.push(`- **URL**: ${file.prod.url}`);
    if (file.prod.region) lines.push(`- **Region**: ${file.prod.region}`);
    if (file.prod.deployment_ref) lines.push(`- **Deployment**: ${file.prod.deployment_ref}`);
    lines.push("");
  }

  // Testing
  if (file.testing) {
    lines.push("## Testing");
    lines.push("");
    if (file.testing.framework) lines.push(`- **Framework**: ${file.testing.framework}`);
    if (file.testing.command) lines.push(`- **Command**: \`${file.testing.command}\``);
    if (file.testing.coverage_target) lines.push(`- **Coverage target**: ${file.testing.coverage_target}`);
    lines.push("");
  }

  // Security
  if (file.security) {
    lines.push("## Security");
    lines.push("");
    if (file.security.auth_method) lines.push(`- **Auth method**: ${file.security.auth_method}`);
    if (file.security.secrets_ref) lines.push(`- **Secrets ref**: ${file.security.secrets_ref}`);
    lines.push("");
  }

  // Infrastructure
  if (file.infrastructure) {
    lines.push("## Infrastructure");
    lines.push("");
    renderInfrastructure(lines, file.infrastructure);
  }

  return lines.join("\n");
}

/**
 * Render the infrastructure: sub-field as structured Markdown sections.
 */
function renderInfrastructure(lines: string[], infra: ServiceInfrastructure): void {
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Provider | ${infra.provider || "—"} |`);
  if (infra.region) lines.push(`| Region | ${infra.region} |`);
  lines.push("");

  // Compute
  if (infra.compute) {
    lines.push("### Compute");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.compute.type) lines.push(`| Type | ${infra.compute.type} |`);
    if (infra.compute.mode) lines.push(`| Mode | ${infra.compute.mode} |`);
    if (infra.compute.cpu) lines.push(`| CPU | ${infra.compute.cpu} units |`);
    if (infra.compute.memory_mb) lines.push(`| Memory | ${infra.compute.memory_mb} MB |`);
    if (infra.compute.desired_count) lines.push(`| Desired Count | ${infra.compute.desired_count} |`);
    lines.push("");
  }

  // Networking
  if (infra.networking) {
    lines.push("### Networking");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.networking.port) lines.push(`| Port | ${infra.networking.port} |`);
    if (infra.networking.protocol) lines.push(`| Protocol | ${infra.networking.protocol} |`);
    if (infra.networking.tls_termination) lines.push(`| TLS Termination | ${infra.networking.tls_termination} |`);
    if (infra.networking.alb_listener_rule) lines.push(`| ALB Rule | ${infra.networking.alb_listener_rule} |`);
    if (infra.networking.hostnames && infra.networking.hostnames.length > 0) {
      lines.push(`| Hostnames | ${infra.networking.hostnames.join(", ")} |`);
    }
    lines.push("");
  }

  // Data
  if (infra.data) {
    lines.push("### Data");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.data.engine) lines.push(`| Engine | ${infra.data.engine} |`);
    if (infra.data.instance_class) lines.push(`| Instance Class | ${infra.data.instance_class} |`);
    if (infra.data.multi_az !== undefined) lines.push(`| Multi-AZ | ${infra.data.multi_az ? "yes" : "no"} |`);
    if (infra.data.backup_retention_days) lines.push(`| Backup Retention | ${infra.data.backup_retention_days} days |`);
    lines.push("");
  }

  // Scaling
  if (infra.scaling) {
    lines.push("### Scaling");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.scaling.min !== undefined) lines.push(`| Min | ${infra.scaling.min} |`);
    if (infra.scaling.max !== undefined) lines.push(`| Max | ${infra.scaling.max} |`);
    if (infra.scaling.target_cpu_percent !== undefined) lines.push(`| Target CPU | ${infra.scaling.target_cpu_percent}% |`);
    lines.push("");
  }

  // Secrets
  if (infra.secrets && infra.secrets.length > 0) {
    lines.push("### Secrets");
    lines.push("");
    lines.push("| Name | Source | Purpose |");
    lines.push("|------|--------|---------|");
    for (const secret of infra.secrets) {
      lines.push(`| ${secret.name || "—"} | ${secret.source || "—"} | ${secret.purpose || "—"} |`);
    }
    lines.push("");
  }

  // Monitoring
  if (infra.monitoring) {
    lines.push("### Monitoring");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.monitoring.logs) lines.push(`| Logs | ${infra.monitoring.logs} |`);
    if (infra.monitoring.metrics) lines.push(`| Metrics | ${infra.monitoring.metrics} |`);
    lines.push("");
    if (infra.monitoring.alarms && infra.monitoring.alarms.length > 0) {
      lines.push("**Alarms**:");
      lines.push("");
      for (const alarm of infra.monitoring.alarms) {
        lines.push(`- ${alarm}`);
      }
      lines.push("");
    }
  }

  // Cost
  if (infra.cost) {
    lines.push("### Cost");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.cost.monthly_estimate_usd !== undefined) {
      lines.push(`| Monthly Estimate | $${infra.cost.monthly_estimate_usd.toFixed(2)} |`);
    }
    if (infra.cost.optimization_notes) lines.push(`| Optimization | ${infra.cost.optimization_notes} |`);
    lines.push("");
  }

  // Disaster Recovery
  if (infra.disaster_recovery) {
    lines.push("### Disaster Recovery");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.disaster_recovery.backup_strategy) lines.push(`| Backup Strategy | ${infra.disaster_recovery.backup_strategy} |`);
    if (infra.disaster_recovery.rto_minutes !== undefined) lines.push(`| RTO | ${infra.disaster_recovery.rto_minutes} minutes |`);
    if (infra.disaster_recovery.rpo_minutes !== undefined) lines.push(`| RPO | ${infra.disaster_recovery.rpo_minutes} minutes |`);
    lines.push("");
  }

  // Self-Hosting
  if (infra.self_hosting) {
    lines.push("### Self-Hosting");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (infra.self_hosting.supported !== undefined) lines.push(`| Supported | ${infra.self_hosting.supported ? "yes" : "no"} |`);
    if (infra.self_hosting.guide_ref) lines.push(`| Guide | ${infra.self_hosting.guide_ref} |`);
    lines.push("");
    if (infra.self_hosting.requirements && infra.self_hosting.requirements.length > 0) {
      lines.push("**Requirements**:");
      lines.push("");
      for (const req of infra.self_hosting.requirements) {
        lines.push(`- ${req}`);
      }
      lines.push("");
    }
  }
}

function buildPackageReadme(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  // Quick stats
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Type | ${file.type} |`);
  lines.push(`| Runtime | ${file.runtime} |`);
  if (file.depends_on && file.depends_on.length > 0) {
    lines.push(`| Depends On | ${file.depends_on.join(", ")} |`);
  }
  lines.push("");

  // Docs
  lines.push("## Docs");
  lines.push("");
  lines.push("- [API](api.md)");
  lines.push("- [Architecture](architecture.md)");
  lines.push("- [Testing](testing.md)");
  lines.push("");

  return lines.join("\n");
}

function buildPackageApiMd(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);
  lines.push(`# ${title} — API`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  if (file.modules && file.modules.length > 0) {
    lines.push("## Exports");
    lines.push("");
    lines.push("| Module | Purpose |");
    lines.push("|--------|---------|");
    for (const mod of file.modules) {
      lines.push(`| ${mod.name} | ${mod.purpose} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildPackageArchitectureMd(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);
  lines.push(`# ${title} — Architecture`);
  lines.push("");

  if (file.paths && file.paths.length > 0) {
    lines.push("## Source Paths");
    lines.push("");
    for (const p of file.paths) {
      lines.push(`- \`${p}\``);
    }
    lines.push("");
  }

  if (file.modules && file.modules.length > 0) {
    lines.push("## Modules");
    lines.push("");
    lines.push("| Module | Purpose | Paths |");
    lines.push("|--------|---------|-------|");
    for (const mod of file.modules) {
      const paths = (mod.paths || []).map((p) => `\`${p}\``).join(", ");
      lines.push(`| ${mod.name} | ${mod.purpose} | ${paths} |`);
    }
    lines.push("");
  }

  if (file.decisions && file.decisions.length > 0) {
    lines.push("## Decisions");
    lines.push("");
    renderDecisions(lines, file.decisions);
  }

  return lines.join("\n");
}

function buildPackageTestingMd(file: ServiceUsm, _slug: string): string {
  const lines: string[] = [];
  lines.push("# Testing");
  lines.push("");

  if (file.testing) {
    if (file.testing.framework) lines.push(`- **Framework**: ${file.testing.framework}`);
    if (file.testing.command) lines.push(`- **Command**: \`${file.testing.command}\``);
    if (file.testing.coverage_target) lines.push(`- **Coverage target**: ${file.testing.coverage_target}`);
  } else {
    lines.push("No testing configuration defined.");
  }
  lines.push("");

  return lines.join("\n");
}

function buildModulesDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Modules");
  lines.push("");

  if (file.modules && file.modules.length > 0) {
    lines.push("| Module | Purpose | Paths |");
    lines.push("|--------|---------|-------|");
    for (const mod of file.modules) {
      const paths = (mod.paths || []).map((p) => `\`${p}\``).join(", ");
      lines.push(`| ${mod.name} | ${mod.purpose} | ${paths} |`);
    }
    lines.push("");
  } else {
    lines.push("No modules defined.");
    lines.push("");
  }

  return lines.join("\n");
}

function buildRisksMd(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Risks");
  lines.push("");

  if (file.risks && file.risks.length > 0) {
    for (const risk of file.risks) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  } else {
    lines.push("No risks defined in this service's .usm file.");
    lines.push("");
    lines.push("For platform-wide risks, see [Platform Risks](../../.usm-workspace/docs/risks.md).");
    lines.push("");
  }

  return lines.join("\n");
}

function buildRoadmapMd(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Roadmap");
  lines.push("");

  if (file.future && file.future.length > 0) {
    lines.push("## Future Items");
    lines.push("");
    for (const item of file.future) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  } else {
    lines.push("No roadmap items defined in this service's .usm file.");
    lines.push("");
    lines.push("For the platform roadmap, see [Platform Roadmap](../../.usm-workspace/docs/roadmap.md).");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Aggregator Generators ──────────────────────────────────────────────────

/**
 * Generate surface tables for every app and shared-service overview.md.
 * This reads all features' routes[] and interfaces[] to build the tables.
 */
export function generateSurfaceTables(
  features: FeatureUsm[],
  services: ServiceUsm[],
  root: string
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  // For each app service
  for (const app of APP_DIRS) {
    const appFeatures = featuresForApp(features, app);
    const overviewPath = `${root}/apps/${app}/.usm-workspace/docs/overview.md`;

    if (fs.existsSync(overviewPath)) {
      const content = injectSurfaceTables(
        fs.readFileSync(overviewPath, "utf-8"),
        appFeatures,
        app
      );
      outputs.push({ path: overviewPath, content });
    }
  }

  // For each shared service
  const sharedServiceSlugs = services
    .filter(s => classifyService(s) === "shared-service")
    .map(s => serviceSlug(s));

  for (const slug of sharedServiceSlugs) {
    const svcFeatures = featuresForService(features, slug);
    const overviewPath = `${root}/.usm-workspace/docs/shared-services/${slug}/overview.md`;

    if (fs.existsSync(overviewPath)) {
      const content = injectSurfaceTables(
        fs.readFileSync(overviewPath, "utf-8"),
        svcFeatures,
        slug
      );
      outputs.push({ path: overviewPath, content });
    }
  }

  return { outputs };
}

/**
 * Inject surface tables into an overview.md between the USM:SURFACE markers.
 *
 * Bug 2 fix: deduplicate entries by grouping across apps.
 *
 * UI pages: group by (feature, page URL) → count distinct apps.
 * API endpoints: normalize methods (alphabetical), group by (path, methods-set) → count distinct apps.
 */
function injectSurfaceTables(
  existing: string,
  appFeatures: FeatureUsm[],
  _serviceSlug: string
): string {
  // Collect UI pages from interfaces — dedupe by (featureSlug, page URL)
  const uiPageMap = new Map<string, { feature: string; page: string; auth: string; area: string; apps: Set<string> }>();
  for (const feat of appFeatures) {
    const featureSlug = feat.$id.split("/").pop() || "";
    const area = inferArea(feat.$id);
    const appName = inferAppName(feat);
    if (feat.interfaces) {
      for (const iface of feat.interfaces) {
        const page = iface.page || "/";
        const auth = hasAuthInRoutes(feat) ? "required" : "none";
        const key = `${featureSlug}::${page}`;
        const existing = uiPageMap.get(key);
        if (existing) {
          if (appName) existing.apps.add(appName);
        } else {
          uiPageMap.set(key, { feature: featureSlug, page, auth, area, apps: new Set(appName ? [appName] : []) });
        }
      }
    }
  }
  const uiPages = [...uiPageMap.values()];

  // Collect API endpoints from routes — normalize methods, dedupe by (path, methods-set)
  const apiMap = new Map<string, { method: string; path_: string; feature: string; auth: string; area: string; apps: Set<string> }>();
  for (const feat of appFeatures) {
    const featureSlug = feat.$id.split("/").pop() || "";
    const area = inferArea(feat.$id);
    const appName = inferAppName(feat);
    if (feat.routes) {
      for (const route of feat.routes) {
        if (route.type === "api") {
          const methods = (route.http_methods || []).slice().sort();
          const methodStr = methods.length > 0 ? methods.join(", ") : "";
          // Skip malformed entries (no methods)
          if (!methodStr) continue;
          const auth = route.auth_required ? "required" : "none";
          const key = `${methodStr}::${route.path}::${featureSlug}`;
          const existing = apiMap.get(key);
          if (existing) {
            if (appName) existing.apps.add(appName);
          } else {
            apiMap.set(key, { method: methodStr, path_: route.path, feature: featureSlug, auth, area, apps: new Set(appName ? [appName] : []) });
          }
        }
      }
    }
  }
  const apiEndpoints = [...apiMap.values()];

  // Build UI table
  const uiTableLines: string[] = [];
  if (uiPages.length > 0) {
    const totalUniquePages = new Set(uiPages.map(p => p.page)).size;
    const totalFeatures = new Set(uiPages.map(p => p.feature)).size;
    uiTableLines.push(`**${uiPages.length} page entries across ${totalFeatures} features (${totalUniquePages} unique URLs)**`);
    uiTableLines.push("");
    uiTableLines.push("| Feature | Page | Apps | Auth |");
    uiTableLines.push("|---------|------|------|------|");
    for (const p of uiPages) {
      const link = `[${p.feature}](features/${p.area}/)`;
      const appCount = p.apps.size > 0 ? `${p.apps.size} app${p.apps.size > 1 ? "s" : ""}` : "—";
      uiTableLines.push(`| ${link} | \`${p.page}\` | ${appCount} | ${p.auth} |`);
    }
    uiTableLines.push("");
  } else {
    uiTableLines.push("");
  }

  // Build API table
  const apiTableLines: string[] = [];
  if (apiEndpoints.length > 0) {
    const totalEndpoints = new Set(apiEndpoints.map(e => `${e.method} ${e.path_}`)).size;
    const totalFeatures = new Set(apiEndpoints.map(e => e.feature)).size;
    apiTableLines.push(`**${apiEndpoints.length} endpoint entries across ${totalFeatures} features (${totalEndpoints} unique)**`);
    apiTableLines.push("");
    apiTableLines.push("| Method | Path | Feature | Apps | Auth |");
    apiTableLines.push("|--------|------|---------|------|------|");
    for (const e of apiEndpoints) {
      const link = `[${e.feature}](features/${e.area}/${e.feature}.md)`;
      const appCount = e.apps.size > 0 ? `${e.apps.size} app${e.apps.size > 1 ? "s" : ""}` : "—";
      apiTableLines.push(`| ${e.method} | \`${e.path_}\` | ${link} | ${appCount} | ${e.auth} |`);
    }
    apiTableLines.push("");
  } else {
    apiTableLines.push("");
  }

  // Build the full section content — only include headers when there's data
  const hasUi = uiPages.length > 0;
  const hasApi = apiEndpoints.length > 0;
  let sectionContent = "";
  if (hasUi || hasApi) {
    sectionContent = "## Surface\n\n";
    if (hasUi) {
      sectionContent += "### UI Pages\n\n" + uiTableLines.join("\n") + "\n";
    }
    if (hasApi) {
      sectionContent += "### API Endpoints\n\n" + apiTableLines.join("\n") + "\n";
    }
  }

  // Replace the entire section between SECTION_START and SECTION_END
  let result = existing;
  result = replaceBetweenMarkers(result, "USM:SURFACE:SECTION_START", "USM:SURFACE:SECTION_END", sectionContent);

  return result;
}

/**
 * Infer the app name from a feature's $service or apps[] field.
 */
function inferAppName(feat: FeatureUsm): string | undefined {
  if (feat.apps && feat.apps.length > 0) return feat.apps[0];
  if (feat.$service) {
    const slug = feat.$service.split("/").pop() || "";
    if (APP_DIRS.includes(slug)) return slug;
  }
  return undefined;
}

function replaceBetweenMarkers(content: string, startMarker: string, endMarker: string, replacement: string): string {
  const startIdx = content.indexOf(`<!-- ${startMarker} -->`);
  const endIdx = content.indexOf(`<!-- ${endMarker} -->`);
  if (startIdx === -1 || endIdx === -1) return content;
  const before = content.slice(0, startIdx + `<!-- ${startMarker} -->`.length);
  const after = content.slice(endIdx);
  return before + "\n" + replacement + after;
}

function inferArea($id: string): string {
  // Try to detect area from $id like "smith-gray/agent-events" → "agent"
  const parts = $id.split("/").pop() || "";
  // Check if the feature id contains a known area prefix like "agent-", "files-", "tickets-"
  for (const area of ["agent", "auth", "files", "git", "projects", "settings", "tickets", "user", "users", "admin", "internal"]) {
    if (parts.startsWith(area + "-") || parts === area) return area;
  }
  return parts;
}

function hasAuthInRoutes(feat: FeatureUsm): boolean {
  return (feat.routes || []).some(r => r.auth_required);
}

/**
 * Generate the shared-services/README.md listing all shared services.
 */
export function generateSharedServicesIndex(services: ServiceUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# Shared Services");
  lines.push("");
  lines.push("Infrastructure services shared across all apps.");
  lines.push("");

  const sharedServices = services.filter(s => classifyService(s) === "shared-service");

  if (sharedServices.length > 0) {
    lines.push("| Service | Type | Port | Status |");
    lines.push("|---------|------|------|--------|");
    for (const svc of sharedServices) {
      const slug = serviceSlug(svc);
      const port = svc.port ? String(svc.port) : "—";
      const status = svc.status || "built";
      lines.push(`| [${slugToTitle(slug)}](${slug}/README.md) | ${svc.type} | ${port} | ${status} |`);
    }
    lines.push("");
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/shared-services/README.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate the packages/README.md listing all packages.
 */
export function generatePackagesIndex(services: ServiceUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# Packages");
  lines.push("");
  lines.push("Shared libraries used across apps.");
  lines.push("");

  const packages = services.filter(s => classifyService(s) === "package");

  if (packages.length > 0) {
    lines.push("| Package | Type | Runtime | Depends On |");
    lines.push("|---------|------|---------|------------|");
    for (const pkg of packages) {
      const slug = serviceSlug(pkg);
      const deps = (pkg.depends_on || []).join(", ") || "—";
      lines.push(`| [${slugToTitle(slug)}](${slug}/README.md) | ${pkg.type} | ${pkg.runtime} | ${deps} |`);
    }
    lines.push("");
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/packages/README.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/risks.md — from system.risks
 */
export function generateRisksDoc(system: SystemUsm, root: string): GenerationResult {
  if (!system.risks || system.risks.length === 0) {
    return { outputs: [] };
  }

  const lines: string[] = [];
  lines.push("# Risks");
  lines.push("");
  lines.push("Source: `.usm/system.usm` → `risks`");
  lines.push("");

  lines.push("| ID | Title | Severity | Status | Description | Mitigation |");
  lines.push("|----|-------|----------|--------|-------------|------------|");
  for (const risk of system.risks) {
    const severity = risk.severity || "—";
    const status = risk.status || "—";
    const desc = risk.description || "—";
    const mitigation = risk.mitigation || "—";
    lines.push(`| ${risk.id} | ${risk.title} | ${severity} | ${status} | ${desc} | ${mitigation} |`);
  }
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/risks.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/roadmap.md — from system.roadmap
 */
export function generateRoadmapDoc(system: SystemUsm, root: string): GenerationResult {
  if (!system.roadmap || system.roadmap.length === 0) {
    return { outputs: [] };
  }

  // Build a map from feature id to doc path for linking
  // Index ids are short (e.g. "cli-docs"), roadmap feature refs are full $ids (e.g. "usm/cli-docs")
  const featureDocPaths = new Map<string, string>();
  if (system.index) {
    for (const feat of system.index) {
      const refMatch = feat.ref.match(/\.usm\/features\/([^/]+)\/(.+?)\.usm$/);
      if (refMatch) {
        featureDocPaths.set(feat.id, `features/${refMatch[1]}/${refMatch[2]}`);
      }
    }
  }

  const lines: string[] = [];
  lines.push("# Roadmap");
  lines.push("");
  lines.push("Source: `.usm/system.usm` → `roadmap`");
  lines.push("");

  // Summary counts by status
  const shipped = system.roadmap.filter(r => r.status === "shipped").length;
  const inProgress = system.roadmap.filter(r => r.status === "in-progress").length;
  const planned = system.roadmap.filter(r => r.status === "planned").length;
  lines.push(`**${shipped} shipped** · **${inProgress} in progress** · **${planned} planned**`);
  lines.push("");

  lines.push("| Status | Title | Shipped In | Target Date | Description |");
  lines.push("|--------|-------|------------|-------------|-------------|");
  for (const item of system.roadmap) {
    const status = item.status || "—";
    const target = item.target_date || "—";
    const desc = item.description || "—";
    const shippedIn = item.shipped_in || "—";
    // Link title to feature spec if feature field is set and we have a doc path
    let title = item.title;
    if (item.feature) {
      // Strip system prefix from $id to get the index id (e.g. "usm/cli-docs" → "cli-docs")
      const featureId = item.feature.replace(/^[^/]+\//, "");
      if (featureDocPaths.has(featureId)) {
        title = `[${item.title}](${featureDocPaths.get(featureId)})`;
      }
    }
    lines.push(`| ${status} | ${title} | ${shippedIn} | ${target} | ${desc} |`);
  }
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/roadmap.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/deployment.md — from system.deployment + system.operations
 */
export function generateDeploymentDoc(system: SystemUsm, root: string): GenerationResult {
  if (!system.deployment && !system.operations) {
    return { outputs: [] };
  }

  const lines: string[] = [];
  lines.push("# Deployment & Operations");
  lines.push("");
  lines.push("Source: `.usm/system.usm` → `deployment` + `operations`");
  lines.push("");

  // Deployment environments
  if (system.deployment?.environments && system.deployment.environments.length > 0) {
    lines.push("## Environments");
    lines.push("");
    lines.push("| Name | URL | Type | Notes |");
    lines.push("|------|-----|------|-------|");
    for (const env of system.deployment.environments) {
      const url = env.url ? `[${env.url}](${env.url})` : "—";
      const type = env.type || "—";
      const notes = (env.notes as string) || "—";
      lines.push(`| ${env.name} | ${url} | ${type} | ${notes} |`);
    }
    lines.push("");

    // Extract deployment details from environment fields (generic — any project can use these)
    for (const env of system.deployment.environments) {
      if (env.build_command || env.output_directory || env.project_name || env.secrets) {
        lines.push(`### ${env.name} Details`);
        lines.push("");
        if (env.build_command) {
          lines.push(`**Build command**: \`${env.build_command}\``);
          lines.push("");
        }
        if (env.output_directory) {
          lines.push(`**Output directory**: \`${env.output_directory}\``);
          lines.push("");
        }
        if (env.project_name) {
          lines.push(`**Project name**: ${env.project_name}`);
          lines.push("");
        }
        if (env.secrets) {
          const secrets = env.secrets as string[];
          lines.push(`**Required secrets**: ${secrets.join(", ")}`);
          lines.push("");
        }
      }
    }
  }

  // Operations
  if (system.operations) {
    lines.push("## Operations");
    lines.push("");

    // Operations has [key: string]: unknown, so we iterate known + custom fields
    const ops = system.operations as Record<string, unknown>;
    for (const [key, val] of Object.entries(ops)) {
      if (val === undefined || val === null) continue;
      const displayKey = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      lines.push(`### ${displayKey}`);
      lines.push("");
      lines.push(String(val));
      lines.push("");
    }
  }

  if (lines.length <= 4) {
    return { outputs: [] }; // No real content
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/deployment.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/getting-started.md — orientation page from system summary, roles, and local dev
 */
export function generateGettingStartedDoc(system: SystemUsm, root: string): GenerationResult {
  const lines: string[] = [];
  const version = readPackageVersion();
  lines.push("# Getting Started");
  lines.push("");
  lines.push(system.summary);
  lines.push("");
  lines.push("::: tip Five minutes to a living system map");
  lines.push("Install → `usm init` → `usm scan` → `usm generate` → `usm docs serve`. Everything below is copy-pasteable.");
  lines.push(":::");
  lines.push("");

  // First-run sequence diagram
  lines.push("## The first-run loop");
  lines.push("");
  lines.push("```mermaid");
  lines.push("sequenceDiagram");
  lines.push("  participant You");
  lines.push("  participant USM as usm CLI");
  lines.push("  participant Disk as .usm/ + docs");
  lines.push("  You->>USM: npm i -g @smithgray/usm");
  lines.push("  You->>USM: usm init");
  lines.push("  USM->>Disk: usmconfig.json");
  lines.push("  You->>USM: usm scan");
  lines.push("  USM->>Disk: .usm/**/*.usm");
  lines.push("  You->>USM: usm generate");
  lines.push("  USM->>Disk: docs, Mermaid, AGENTS.md, OpenAPI…");
  lines.push("  You->>USM: usm docs serve --audience help");
  lines.push("  USM-->>You: http://localhost:5173");
  lines.push("```");
  lines.push("");

  // Tabbed quick start
  lines.push("## Quick start");
  lines.push("");
  lines.push("::: code-group");
  lines.push("");
  lines.push("```bash [1. Install]");
  lines.push(`npm install -g @smithgray/usm@${version}`);
  lines.push("# or: pnpm add -g @smithgray/usm");
  lines.push("usm --version");
  lines.push("```");
  lines.push("");
  lines.push("```bash [2. Init + scan]");
  lines.push("cd your-project");
  lines.push("usm init                 # creates usmconfig.json");
  lines.push("usm scan                 # detects services, routes, data");
  lines.push("# Review .usm/ — this is your source of truth");
  lines.push("```");
  lines.push("");
  lines.push("```bash [3. Generate + serve]");
  lines.push("usm generate");
  lines.push("pnpm add -D vitepress    # once, if you want local docs");
  lines.push("usm docs serve --audience help");
  lines.push("# Open the printed localhost URL");
  lines.push("```");
  lines.push("");
  lines.push("```bash [4. Wire agents]");
  lines.push("usm mcp serve            # MCP for Cursor / Claude / Copilot");
  lines.push("# See Agent Setup Guide for IDE config");
  lines.push("```");
  lines.push("");
  lines.push(":::");
  lines.push("");

  // Example — show a real .usm file from this project
  if (system.index && system.index.length > 0) {
    const exampleFeature = system.index.find(
      (f) => f.status === "built" || f.status === "active" || !f.status,
    );
    if (exampleFeature) {
      const usmPath = path.resolve(root, exampleFeature.ref);
      if (fs.existsSync(usmPath)) {
        const usmContent = fs.readFileSync(usmPath, "utf-8");
        const exampleLines = usmContent.split("\n").slice(0, 36);
        const truncated = usmContent.split("\n").length > 36;
        lines.push("## Example feature spec");
        lines.push("");
        lines.push(`From this project (\`${exampleFeature.ref}\`):`);
        lines.push("");
        lines.push("```yaml");
        lines.push(exampleLines.join("\n"));
        if (truncated) lines.push("# … truncated");
        lines.push("```");
        lines.push("");
        lines.push("`usm generate` turns this into markdown, Mermaid, OpenAPI, AGENTS.md, and tests.");
        lines.push("");
      }
    }
  }

  // Common first-run issues
  lines.push("## Common first-run issues");
  lines.push("");
  lines.push("::: details Node / package manager");
  lines.push("USM requires **Node ≥ 18**. Prefer pnpm 9+ in monorepos. If `usm` is not found after install, check your global bin is on `PATH`.");
  lines.push(":::");
  lines.push("");
  lines.push("::: details `usm docs serve` fails with \"VitePress is not installed\"");
  lines.push("VitePress is an optional peer dependency. Install it once in the project:");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm add -D vitepress");
  lines.push("# or: npm install -D vitepress");
  lines.push("```");
  lines.push(":::");
  lines.push("");
  lines.push("::: details Validation warnings about `$version`");
  lines.push("A warning (not an error) means a file's `$version` differs from the schema version this USM understands. Additive schema changes do not require a bump — only breaking ones do. Run `usm upgrade` to adopt new optional capabilities.");
  lines.push(":::");
  lines.push("");
  lines.push("::: details Agents inventing `bugs.md` / ad-hoc tracking files");
  lines.push("Configure feedback policy with `usm feedback` (or `usm upgrade --apply`). Default is `human-gate`: agents must ask before filing. Rules files forbid root-level ad-hoc trackers.");
  lines.push(":::");
  lines.push("");
  lines.push("::: details GitHub Actions can't create the version PR");
  lines.push("The release workflow uses a user token (`CS_GITHUB_TOKEN`) so version PRs auto-create. See the contributing docs / release workflow comments if you self-host the package.");
  lines.push(":::");
  lines.push("");

  // Who uses this?
  if (system.roles && system.roles.length > 0) {
    lines.push("## Who uses this system");
    lines.push("");
    for (const role of system.roles) {
      const firstLine = role.description.split("\n")[0].trim();
      lines.push(`- **${role.name}** — ${firstLine}`);
    }
    lines.push("");
  }

  // Next steps
  lines.push("## Where to go next");
  lines.push("");
  lines.push("| Page | Why |");
  lines.push("|------|-----|");
  lines.push("| [Schema Reference](/schema-reference) | Field-by-field answers for every `.usm` type |");
  lines.push("| [CLI Reference](/cli-reference) | Every command and flag |");
  lines.push("| [MCP Tools](/mcp-reference) | Spec-first tools for agents |");
  lines.push("| [Agent Setup Guide](/agent-setup-guide) | Cursor / Claude / Copilot wiring |");
  lines.push("| [Roadmap](/roadmap) | What's shipping next |");
  lines.push("");

  // Local development — from system.usm (if present)
  if (system.local_development) {
    const ld = system.local_development;
    lines.push("## Local Development");
    lines.push("");

    if (ld.monorepo) {
      if (ld.monorepo.package_manager) {
        lines.push(`**Package manager**: ${ld.monorepo.package_manager}`);
        lines.push("");
      }
      if (ld.monorepo.install_command) {
        lines.push(`**Install**: \`${ld.monorepo.install_command}\``);
        lines.push("");
      }
    }

    if (ld.apps && ld.apps.length > 0) {
      lines.push("### Apps");
      lines.push("");
      lines.push("| App | Port | Dev Command | URL |");
      lines.push("|-----|------|-------------|-----|");
      for (const app of ld.apps) {
        const name = app.name || "—";
        const port = app.port ? String(app.port) : "—";
        const cmd = app.dev_command || "—";
        const url = app.url_local || "—";
        lines.push(`| ${name} | ${port} | \`${cmd}\` | ${url} |`);
      }
      lines.push("");
    }

    if (ld.environment?.required_vars && ld.environment.required_vars.length > 0) {
      lines.push("### Required Environment Variables");
      lines.push("");
      for (const v of ld.environment.required_vars) {
        lines.push(`- \`${v}\``);
      }
      lines.push("");
    }

    if (ld.known_quirks && ld.known_quirks.length > 0) {
      lines.push("### Known Quirks");
      lines.push("");
      for (const q of ld.known_quirks) {
        if (q.title) {
          lines.push(`**${q.title}**`);
          if (q.description) {
            lines.push(`> ${q.description}`);
          }
          if (q.workaround) {
            lines.push(`> **Workaround**: ${q.workaround}`);
          }
          lines.push("");
        }
      }
    }
  }

  // Next steps
  lines.push("## Next Steps");
  lines.push("");
  const featureCount = (system.index || []).length;
  const serviceCount = (system.services || []).length;
  if (serviceCount > 0) {
    lines.push(`- Browse the [Services](/) — ${serviceCount} service(s)`);
  }
  if (featureCount > 0) {
    lines.push(`- Read the [Features](/) — ${featureCount} feature spec(s)`);
  }
  lines.push("- View the [Architecture](architecture/architecture.md)");
  if (system.roadmap && system.roadmap.length > 0) {
    lines.push("- Check the [Roadmap](roadmap.md)");
  }
  if (system.identity?.repository) {
    lines.push(`- [View on GitHub](${system.identity.repository})`);
  }
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/getting-started.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/cli-reference.md — from feature specs with usage/options fields.
 * Scans all .usm feature files for usage examples and CLI options.
 * Generic — works for any project that adds usage/options to their feature specs.
 */

/**
 * Escape markdown-table cell content so angle brackets aren't parsed as HTML
 * by VitePress/Vue (which breaks the build with "Element is missing end tag")
 * and pipes don't break the column structure. Applied to description/default
 * cells; flag cells are backtick-wrapped (already safe).
 */
function escapeTableCell(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|");
}

export function generateCliReference(root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# CLI Reference");
  lines.push("");
  lines.push("Commands and options for the `usm` CLI.");
  lines.push("");

  // Find all .usm files and look for ones with usage fields
  const allFiles = findAllUsmFiles(root);
  const commands: Array<{ id: string; name: string; summary: string; usage?: unknown[]; options?: unknown[]; prerequisites?: string[] }> = [];

  for (const filePath of allFiles) {
    try {
      const parsed = parseUsmFile(filePath);
      if (parsed.$type !== "feature") continue;
      const feature = parsed as FeatureUsm;
      if (!feature.usage && !feature.options) continue;
      commands.push({
        id: feature.$id,
        name: feature.command || feature.$id.split("/").pop() || feature.$id,
        summary: feature.summary,
        usage: feature.usage as unknown[],
        options: feature.options as unknown[],
        prerequisites: feature.prerequisites,
      });
    } catch {
      // Skip unparseable
    }
  }

  if (commands.length === 0) {
    return { outputs: [] };
  }

  // Sort by name
  commands.sort((a, b) => a.name.localeCompare(b.name));

  // Quick reference table
  lines.push("## Quick Reference");
  lines.push("");
  lines.push("| Command | Description |");
  lines.push("|---------|-------------|");
  for (const cmd of commands) {
    const firstLine = cmd.summary.split("\n")[0].slice(0, 80);
    lines.push(`| \`${cmd.name}\` | ${escapeTableCell(firstLine)} |`);
  }
  lines.push("");

  // Per-command details
  for (const cmd of commands) {
    lines.push(`## ${cmd.name}`);
    lines.push("");
    lines.push(cmd.summary);
    lines.push("");

    if (cmd.prerequisites && cmd.prerequisites.length > 0) {
      lines.push("**Prerequisites**:");
      lines.push("");
      for (const p of cmd.prerequisites) {
        lines.push(`- ${p}`);
      }
      lines.push("");
    }

    if (cmd.usage && Array.isArray(cmd.usage) && cmd.usage.length > 0) {
      lines.push("### Usage");
      lines.push("");
      lines.push("```bash");
      for (const u of cmd.usage) {
        const usage = u as { command: string; description: string };
        lines.push(`# ${usage.description}`);
        lines.push(usage.command);
        lines.push("");
      }
      lines.push("```");
      lines.push("");
    }

    if (cmd.options && Array.isArray(cmd.options) && cmd.options.length > 0) {
      lines.push("### Options");
      lines.push("");
      lines.push("| Flag | Description | Default |");
      lines.push("|------|-------------|---------|");
      for (const o of cmd.options) {
        const opt = o as { flag: string; description: string; default?: string };
        lines.push(`| \`${opt.flag}\` | ${escapeTableCell(opt.description)} | ${opt.default ? escapeTableCell(opt.default) : "—"} |`);
      }
      lines.push("");
    }
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/cli-reference.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/config-reference.md — from usmconfig-v1.json schema.
 * Reads the JSON schema and produces a human-readable field reference.
 * Generic — the config schema is the same for all USM projects.
 */
export function generateConfigReference(root: string): GenerationResult {
  const schemaPath = path.resolve(__dirname, "..", "..", "schema", "usmconfig-v1.json");
  if (!fs.existsSync(schemaPath)) {
    return { outputs: [] };
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
  const props = schema.properties as Record<string, Record<string, unknown>>;
  const defs = (schema.$defs || {}) as Record<string, Record<string, unknown>>;

  const lines: string[] = [];
  lines.push("# Configuration Reference");
  lines.push("");
  lines.push("Fields in `usmconfig.json` — the configuration file that drives `usm init` and `usm scan`.");
  lines.push("");

  // Top-level fields
  lines.push("## Top-Level Fields");
  lines.push("");
  lines.push("| Field | Type | Description |");
  lines.push("|-------|------|-------------|");
  const required = (schema.required as string[]) || [];
  for (const [key, val] of Object.entries(props)) {
    const type = (val.type as string) || (val.$ref ? `$ref → ${val.$ref}` : "—");
    const desc = (val.description as string) || "—";
    const reqMark = required.includes(key) ? " *(required)*" : "";
    lines.push(`| \`${key}\`${reqMark} | ${type} | ${desc} |`);
  }
  lines.push("");

  // $defs sections
  for (const [defName, defVal] of Object.entries(defs)) {
    const defProps = defVal.properties as Record<string, Record<string, unknown>> | undefined;
    if (!defProps) continue;
    const defDesc = (defVal.description as string) || "";
    lines.push(`## ${defName}`);
    lines.push("");
    if (defDesc) {
      lines.push(defDesc);
      lines.push("");
    }
    lines.push("| Field | Type | Description |");
    lines.push("|-------|------|-------------|");
    const defRequired = (defVal.required as string[]) || [];
    for (const [key, val] of Object.entries(defProps)) {
      const type = (val.type as string) || (val.$ref ? `$ref` : "—");
      const desc = (val.description as string) || "—";
      const reqMark = defRequired.includes(key) ? " *(required)*" : "";
      lines.push(`| \`${key}\`${reqMark} | ${type} | ${desc} |`);
    }
    lines.push("");
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/config-reference.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/schema-reference.md — from v1.json schema.
 * Reads the JSON schema and produces a field reference for each .usm type.
 * Generic — the schema is the same for all USM projects.
 */
/**
 * Format a JSON-Schema property type for display (handles enum, $ref, array, oneOf).
 */
function formatSchemaType(prop: Record<string, unknown>): string {
  if (prop.const !== undefined) return `\`${JSON.stringify(prop.const)}\``;
  if (Array.isArray(prop.enum)) {
    return prop.enum.map((e) => `\`${e}\``).join(" \\| ");
  }
  if (prop.$ref && typeof prop.$ref === "string") {
    const ref = prop.$ref.split("/").pop() || prop.$ref;
    return `[\`${ref}\`](#${ref.toLowerCase().replace(/[^a-z0-9]+/g, "-")})`;
  }
  if (prop.type === "array") {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items) return `${formatSchemaType(items)}[]`;
    return "array";
  }
  if (Array.isArray(prop.type)) return prop.type.join(" \\| ");
  if (prop.type) return String(prop.type);
  if (prop.oneOf || prop.anyOf) return "union";
  return "object";
}

/**
 * Build a short YAML example snippet for a field based on its schema.
 */
function exampleForField(key: string, prop: Record<string, unknown>): string {
  if (prop.const !== undefined) return `${key}: ${JSON.stringify(prop.const)}`;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return `${key}: ${JSON.stringify(prop.enum[0])}`;
  const t = prop.type;
  if (t === "string") {
    if (key === "summary" || key === "intent" || key === "description") {
      return `${key}: |\n  One or two sentences describing this.`;
    }
    if (key.includes("path") || key.includes("dir")) return `${key}: "src/example.ts"`;
    if (key.includes("url") || key === "repository") return `${key}: "https://github.com/org/repo"`;
    if (key === "email" || key === "contact") return `${key}: "team@example.com"`;
    return `${key}: "example-value"`;
  }
  if (t === "integer" || t === "number") return `${key}: 1`;
  if (t === "boolean") return `${key}: true`;
  if (t === "array") return `${key}:\n  - example-item`;
  if (t === "object" || prop.properties || prop.$ref) return `${key}:\n  # nested fields…`;
  return `${key}: …`;
}

/**
 * Impact notes for well-known fields (generators / MCP / validation).
 */
const FIELD_IMPACT: Record<string, string> = {
  summary: "Rendered on every generated doc page; used by MCP `usm_list` / `usm_search`.",
  intent: "Feature docs lead with intent; agents use it to understand *why* before building.",
  status: "Drives help-docs filtering (only `built`/`public` appear); badges in sidebar.",
  visibility: "Overrides status for help-docs inclusion (`public` always shown).",
  flows: "Drives Mermaid sequence diagrams and numbered steps in feature docs.",
  contracts: "Acceptance criteria in feature docs; feed test-planning via `usm_get_contracts`.",
  tests: "Given/When/Then blocks; auto-generate Vitest specs when present.",
  decisions: "ADR-style decision records in feature docs.",
  usage: "Powers CLI reference pages (`usm generate --only docs`).",
  options: "Powers CLI option tables in the CLI reference.",
  command: "Display name for CLI/MCP reference (preferred over `$id` slug).",
  identity: "Homepage hero, VitePress title/description, footer/repo links.",
  principles: "Homepage feature cards + AGENTS.md principles section.",
  index: "Feature index, sidebar feature groups, getting-started example selection.",
  services: "Service overview pages + homepage service lists.",
  infrastructure: "Deployment docs and ArchiMate/TOGAF outputs.",
  feedback: "Agent Feedback Protocol in all rules files; `usm upgrade` / `usm feedback`.",
  usm_version: "Compared by `usm upgrade` against the installed tool version.",
  version: "Project's own release version — not the USM tool version.",
  $id: "Stable identity used by MCP tools, cross-refs, and generators.",
  $type: "Discriminator for validation (`oneOf`) and type-specific generators.",
  $schema: "Pins the JSON Schema version used by `usm validate`.",
  $version: "Schema format version; mismatch produces a validation warning.",
  $system: "Links features/services back to their system file.",
  $service: "Groups features under a service for docs and MCP context.",
};

/**
 * Best-practice notes for well-known fields.
 */
const FIELD_PRACTICE: Record<string, string> = {
  summary: "Keep to 1–3 sentences. Lead with the outcome, not the implementation.",
  intent: "Answer *why this exists* — not *how it works*. Agents read this first.",
  status: "Only advance planned → in-progress → built → deprecated. Use MCP status tools.",
  visibility: "Default is internal-safe. Set `public` only for features safe for help docs.",
  flows: "Prefer 3–7 steps. Use stable `id`s so diagrams and contracts can reference them.",
  contracts: "Write `must_have` as checkable assertions, not vague wishes.",
  tests: "One test per contract when possible. Keep setup keys machine-readable.",
  decisions: "Record rejected alternatives — future agents will re-propose them otherwise.",
  command: "Bare name only (`init`, `usm_read`) — no `usm` prefix for CLI, full tool name for MCP.",
  $id: "Format `org/name`. Immutable after write — never rename casually.",
  feedback: "Default policy is `human-gate`. Never invent ad-hoc `bugs.md` files.",
  usm_version: "Written only by `usm upgrade`. Do not hand-edit unless you know why.",
};

/**
 * Resolve a $ref like `#/$defs/systemFile` against the root schema.
 */
function resolveSchemaRef(
  root: Record<string, unknown>,
  ref: string,
): Record<string, unknown> | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return (cur && typeof cur === "object") ? (cur as Record<string, unknown>) : null;
}

/**
 * Render one schema object definition (file type or nested type) as markdown.
 */
function renderSchemaDef(
  lines: string[],
  defName: string,
  def: Record<string, unknown>,
  opts: { headingLevel: number; anchorPrefix?: string } = { headingLevel: 2 },
): void {
  const props = def.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return;

  const required = (def.required as string[]) || [];
  const h = "#".repeat(opts.headingLevel);
  const title = defName
    .replace(/File$/, " Files")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  const desc = (def.description as string) || "";

  lines.push(`${h} ${title}`);
  lines.push("");
  if (desc) {
    lines.push(desc);
    lines.push("");
  }

  // Summary table
  lines.push("| Field | Type | Required | Description |");
  lines.push("|-------|------|----------|-------------|");
  for (const [key, val] of Object.entries(props)) {
    const typeStr = formatSchemaType(val);
    const req = required.includes(key) ? "yes" : "—";
    const shortDesc = ((val.description as string) || "").split("\n")[0].slice(0, 80);
    // Plain field name in the table (no HTML anchors — VitePress-safe)
    lines.push(`| \`${key}\` | ${typeStr} | ${req} | ${escapeTableCell(shortDesc)} |`);
  }
  lines.push("");

  // Per-field detail (collapsible). Keep container titles plain — nested
  // backticks/quotes inside ::: details titles break VitePress's Vue compiler.
  lines.push(`${h}# Field details`);
  lines.push("");
  for (const [key, val] of Object.entries(props)) {
    const typeStr = formatSchemaType(val);
    const plainType = typeStr.replace(/`/g, "").replace(/\|/g, "/").slice(0, 60);
    const req = required.includes(key) ? "required" : "optional";
    const description = (val.description as string) || "No description in schema.";
    const impact = FIELD_IMPACT[key] || "Validated by `usm validate`; available to generators and MCP tools.";
    const practice = FIELD_PRACTICE[key];
    const constraints: string[] = [];
    if (Array.isArray(val.enum)) constraints.push(`enum: ${val.enum.map((e) => `\`${e}\``).join(", ")}`);
    if (val.const !== undefined) constraints.push(`const: \`${JSON.stringify(val.const)}\``);
    if (typeof val.minLength === "number") constraints.push(`minLength: ${val.minLength}`);
    if (typeof val.minimum === "number") constraints.push(`minimum: ${val.minimum}`);
    if (typeof val.pattern === "string") constraints.push(`pattern: \`${val.pattern}\``);
    if (val.default !== undefined) constraints.push(`default: \`${JSON.stringify(val.default)}\``);

    // Escape angle brackets in free text so VitePress/Vue never sees bare <tag>
    const safeDesc = description.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeImpact = impact.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safePractice = practice ? practice.replace(/</g, "&lt;").replace(/>/g, "&gt;") : undefined;

    lines.push(`::: details ${key} (${req}, ${plainType})`);
    lines.push("");
    // Avoid Vue-hostile constructs: no raw HTML anchors, no {#custom-id} near $
    lines.push(`#### \`${key}\``);
    lines.push("");
    lines.push("**Description and intent**");
    lines.push("");
    lines.push(safeDesc);
    lines.push("");
    lines.push("**Type and constraints**");
    lines.push("");
    lines.push(`- Type: ${typeStr}`);
    lines.push(`- Required: ${req === "required" ? "yes" : "no"}`);
    if (constraints.length > 0) {
      for (const c of constraints) lines.push(`- ${c}`);
    }
    lines.push("");
    lines.push("**YAML example**");
    lines.push("");
    lines.push("```yaml");
    lines.push(exampleForField(key, val));
    lines.push("```");
    lines.push("");
    lines.push("**Impact**");
    lines.push("");
    lines.push(safeImpact);
    lines.push("");
    if (safePractice) {
      lines.push("**Best practice**");
      lines.push("");
      lines.push(safePractice);
      lines.push("");
    }
    lines.push(":::");
    lines.push("");
  }
}

/**
 * Generate docs/schema-reference.md — comprehensive field-by-field reference
 * derived from schema/v1.json (authoritative type/required/constraints + descriptions).
 */
export function generateSchemaReference(root: string): GenerationResult {
  const schemaPath = path.resolve(__dirname, "..", "..", "schema", "v1.json");
  if (!fs.existsSync(schemaPath)) {
    return { outputs: [] };
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
  const defs = (schema.$defs || {}) as Record<string, Record<string, unknown>>;

  const lines: string[] = [];
  lines.push("# Schema Reference");
  lines.push("");
  lines.push("A living, field-by-field reference for every major `.usm` type. **Sourced from the [v1 JSON Schema](https://usm.dev/schema/v1.json)** — type, required, constraints, and descriptions are never hand-maintained here.");
  lines.push("");
  lines.push("::: tip How to use this page");
  lines.push("Scan the summary tables for a quick answer, then expand a field for intent, YAML example, generator/MCP impact, and best practices.");
  lines.push(":::");
  lines.push("");
  lines.push("## File types at a glance");
  lines.push("");
  lines.push("| `$type` | Purpose | Required header fields |");
  lines.push("|--------|---------|------------------------|");
  lines.push("| `system` | Whole-system map (identity, services, features index) | `$schema`, `$id`, `$type`, `$version`, `summary`, `identity` |");
  lines.push("| `service` | One deployable service or shared package | `$schema`, `$id`, `$type`, `$version`, `summary`, `$system` |");
  lines.push("| `feature` | One capability with flows, contracts, tests | `$schema`, `$id`, `$type`, `$version`, `summary`, `$system`, `$service`, `intent` |");
  lines.push("| `feedback` | Structured agent/human feedback entry | `$schema`, `$id`, `$type`, `$version`, `summary`, `kind`, `severity`, `status`, `reported_by` |");
  lines.push("");

  // Primary file types (from $defs)
  const primaryDefs = ["systemFile", "serviceFile", "featureFile", "feedbackFile"];
  for (const name of primaryDefs) {
    if (defs[name]) renderSchemaDef(lines, name, defs[name], { headingLevel: 2 });
  }

  // Shared nested shapes used across features
  lines.push("## Shared building blocks");
  lines.push("");
  lines.push("These shapes appear inside feature (and other) files — flows, contracts, tests, decisions, CLI usage.");
  lines.push("");

  // Pull nested item schemas from featureFile where possible
  const featureDef = defs.featureFile;
  if (featureDef?.properties) {
    const fprops = featureDef.properties as Record<string, Record<string, unknown>>;
    const nested: Array<{ name: string; def: Record<string, unknown> }> = [];
    for (const nestKey of ["flows", "contracts", "tests", "decisions", "usage", "options"]) {
      const arr = fprops[nestKey];
      if (!arr) continue;
      const items = arr.items as Record<string, unknown> | undefined;
      if (items && items.properties) {
        nested.push({ name: nestKey, def: items });
      } else if (items?.$ref && typeof items.$ref === "string") {
        const resolved = resolveSchemaRef(schema, items.$ref);
        if (resolved) nested.push({ name: nestKey, def: resolved });
      }
    }
    for (const n of nested) {
      renderSchemaDef(lines, n.name, n.def, { headingLevel: 3 });
    }
  }

  // commonFields if present
  if (defs.commonFields) {
    renderSchemaDef(lines, "commonFields", defs.commonFields, { headingLevel: 2 });
  }

  lines.push("## See also");
  lines.push("");
  lines.push("- [CLI Reference](/cli-reference) — commands that create and validate these files");
  lines.push("- [MCP Tools](/mcp-reference) — agent tools for reading/writing `.usm`");
  lines.push("- [Getting Started](/getting-started) — first-run workflow");
  lines.push("- [Agent Setup Guide](/agent-setup-guide) — wire USM into Cursor / Claude / Copilot");
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/schema-reference.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/mcp-reference.md — consolidated MCP tools reference.
 * Scans .usm/features/mcp/ for all tool specs and generates a table.
 * Generic for USM's own docs — other projects may not have MCP features.
 */
export function generateMcpReference(root: string): GenerationResult {
  const mcpDir = path.join(root, ".usm", "features", "mcp");
  if (!fs.existsSync(mcpDir)) {
    return { outputs: [] };
  }

  const lines: string[] = [];
  lines.push("# MCP Tools Reference");
  lines.push("");
  lines.push("Tools available in the USM MCP server for AI agents.");
  lines.push("");

  // Read all .usm files in features/mcp/
  const tools: Array<{ id: string; name: string; summary: string; intent: string }> = [];
  for (const entry of fs.readdirSync(mcpDir)) {
    if (!entry.endsWith(".usm")) continue;
    const filePath = path.join(mcpDir, entry);
    try {
      const parsed = parseUsmFile(filePath);
      if (parsed.$type !== "feature") continue;
      const feature = parsed as FeatureUsm;
      tools.push({
        id: feature.$id,
        name: feature.command || feature.$id.split("/").pop() || feature.$id,
        summary: feature.summary,
        intent: feature.intent,
      });
    } catch {
      // Skip
    }
  }

  if (tools.length === 0) {
    return { outputs: [] };
  }

  // Sort by name
  tools.sort((a, b) => a.name.localeCompare(b.name));

  // Tools table
  lines.push("## All Tools");
  lines.push("");
  lines.push("| Tool | Summary |");
  lines.push("|------|---------|");
  for (const tool of tools) {
    const firstLine = tool.summary.split("\n")[0].slice(0, 100);
    lines.push(`| \`${tool.name}\` | ${escapeTableCell(firstLine)} |`);
  }
  lines.push("");

  // Per-tool details
  for (const tool of tools) {
    lines.push(`## ${tool.name}`);
    lines.push("");
    lines.push(tool.summary);
    lines.push("");
    lines.push("**Purpose**:");
    lines.push("");
    lines.push(tool.intent);
    lines.push("");
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/mcp-reference.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Language support data — used by both the marketing carousel and the docs grid.
 * This is the single source of truth for language/framework/route detection info.
 */
const LANGUAGE_SUPPORT = [
  { language: "TypeScript/JavaScript", manifest: "package.json", runtime: "node", frameworks: ["Next.js", "Express", "Hono", "NestJS"], routeExample: "app.get('/users', handler)", routePattern: "app.(get|post|put|delete)\\(['\"]([^'\"]+)" },
  { language: "Python", manifest: "pyproject.toml / requirements.txt", runtime: "python", frameworks: ["FastAPI", "Flask", "Django"], routeExample: "@app.get('/users')", routePattern: "@(app|router)\\.(get|post|put|delete|patch)\\(['\"]([^'\"]+)" },
  { language: "Go", manifest: "go.mod", runtime: "go", frameworks: ["chi", "gin", "echo", "net/http"], routeExample: "r.GET('/users', handler)", routePattern: "\\.(GET|POST|PUT|DELETE|PATCH)\\(['\"]([^'\"]+)" },
  { language: "Rust", manifest: "Cargo.toml", runtime: "rust", frameworks: ["Axum", "Actix", "Rocket"], routeExample: ".route('/users', get(handler))", routePattern: "\\.route\\(['\"]([^'\"]+).*?(get|post|put|delete)" },
  { language: "Java/Kotlin", manifest: "pom.xml / build.gradle", runtime: "jvm", frameworks: ["Spring Boot", "Javalin", "Quarkus"], routeExample: "@GetMapping('/users')", routePattern: "@(Get|Post|Put|Delete|Request)Mapping\\(['\"]?([^'\"]+)" },
  { language: "C#/.NET", manifest: ".csproj / .sln", runtime: "dotnet", frameworks: ["ASP.NET Core", "Minimal APIs"], routeExample: "[HttpGet('users')]", routePattern: "\\[(Get|Post|Put|Delete)Http\\(['\"]?([^'\"]+)" },
  { language: "Ruby", manifest: "Gemfile", runtime: "ruby", frameworks: ["Rails", "Sinatra"], routeExample: "get '/users' do", routePattern: "(get|post|put|delete)\\s+['\"]([^'\"]+)" },
  { language: "PHP", manifest: "composer.json", runtime: "php", frameworks: ["Laravel", "Symfony", "Slim"], routeExample: "Route::get('/users', ...)", routePattern: "Route::(get|post|put|delete)\\(['\"]([^'\"]+)" },
  { language: "Elixir", manifest: "mix.exs", runtime: "elixir", frameworks: ["Phoenix"], routeExample: "get '/users', UserController, :index", routePattern: "(get|post|put|delete)\\s+['\"]([^'\"]+)" },
  { language: "Swift", manifest: "Package.swift", runtime: "swift", frameworks: ["Vapor"], routeExample: "routes.get('users') { req in }", routePattern: "routes?\\.(get|post|put|delete)\\(['\"]([^'\"]+)" },
  { language: "Scala", manifest: "build.sbt", runtime: "jvm", frameworks: ["Akka HTTP", "Play", "Tapir"], routeExample: "path('users') { get { ... } }", routePattern: "path\\(['\"]?([^'\"]+)" },
  { language: "C/C++", manifest: "CMakeLists.txt / Makefile", runtime: "native", frameworks: ["Crow", "Drogon", "Pistache"], routeExample: "CROW_ROUTE(app, \"/users\")", routePattern: "CROW_ROUTE\\([^,]+,\\s*['\"]([^'\"]+)" },
];

/**
 * Generate docs/language-support.md — comprehensive language/framework reference.
 * Lists all 12 languages, their manifests, frameworks, and route detection patterns.
 * Generic — same for all USM installations.
 */
export function generateLanguageSupportDoc(root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# Language Support");
  lines.push("");
  lines.push("USM's scanner detects services, routes, and data models across 12 languages and 30+ frameworks.");
  lines.push("");
  lines.push("## Supported Languages");
  lines.push("");
  lines.push("| Language | Manifest | Runtime | Frameworks |");
  lines.push("|----------|----------|---------|------------|");

  for (const lang of LANGUAGE_SUPPORT) {
    lines.push(`| ${lang.language} | \`${lang.manifest}\` | ${lang.runtime} | ${lang.frameworks.join(", ")} |`);
  }
  lines.push("");

  // Route detection details
  lines.push("## Route Detection Patterns");
  lines.push("");
  lines.push("| Language | Framework | Example | Regex Pattern |");
  lines.push("|----------|-----------|---------|---------------|");

  for (const lang of LANGUAGE_SUPPORT) {
    for (const fw of lang.frameworks) {
      lines.push(`| ${lang.language} | ${fw} | \`${lang.routeExample}\` | \`${lang.routePattern}\` |`);
    }
  }
  lines.push("");

  // Data model detection
  lines.push("## Data Model Detection");
  lines.push("");
  lines.push("| ORM | Language | Detection |");
  lines.push("|-----|----------|-----------|");
  lines.push("| Prisma | TypeScript | `schema.prisma` file |");
  lines.push("| SQLAlchemy | Python | Class definitions in `models.py` |");
  lines.push("| Django ORM | Python | Class definitions in `models.py` |");
  lines.push("| GORM | Go | Struct definitions with `gorm` tags |");
  lines.push("| Diesel | Rust | `table!` macros in `schema.rs` |");
  lines.push("| Hibernate | Java | `@Entity` annotations in `.java` |");
  lines.push("| Entity Framework | C# | `DbSet` properties in `DbContext` |");
  lines.push("| ActiveRecord | Ruby | Classes inheriting `ApplicationRecord` |");
  lines.push("| Eloquent | PHP | Classes extending `Model` |");
  lines.push("| Ecto | Elixir | `schema` definitions in `.ex` files |");
  lines.push("");

  lines.push("## Custom Detection Rules");
  lines.push("");
  lines.push("Add custom manifest and route patterns in `usmconfig.json`:");
  lines.push("");
  lines.push("```json");
  lines.push("{");
  lines.push('  "detection": {');
  lines.push('    "manifests": [');
  lines.push('      { "pattern": "**/my-framework.config", "language": "custom", "frameworks": ["my-framework"] }');
  lines.push('    ],');
  lines.push('    "routes": [');
  lines.push('      { "framework": "my-framework", "pattern": "route\\\\.(get|post)\\\\([\'"]([^\'"]+)", "method_group": 1, "path_group": 2 }');
  lines.push('    ]');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/language-support.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate docs/agent-setup-guide.md — how to add USM to a project and prompt agents.
 * Generic — same for all USM installations.
 */
export function generateAgentSetupGuide(root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# Adding USM to Your Project");
  lines.push("");
  lines.push("Install USM, scan your codebase, configure your AI agent, and start the spec-first workflow.");
  lines.push("");
  lines.push("## Step 1: Install");
  lines.push("");
  lines.push("```bash");
  lines.push("npm install -g @smithgray/usm");
  lines.push("```");
  lines.push("");
  lines.push("## Step 2: Initialize and Scan");
  lines.push("");
  lines.push("```bash");
  lines.push("cd your-repo");
  lines.push("usm init          # Creates usmconfig.json");
  lines.push("usm scan          # Detects services, routes, data models");
  lines.push("```");
  lines.push("");
  lines.push("## Step 3: Generate Docs");
  lines.push("");
  lines.push("```bash");
  lines.push("usm generate      # Produces markdown, Mermaid, OpenAPI, test specs");
  lines.push("usm docs serve    # Preview docs at localhost:5173");
  lines.push("```");
  lines.push("");
  lines.push("## Step 4: Start the MCP Server");
  lines.push("");
  lines.push("The MCP server lets your AI agent read the .usm system map.");
  lines.push("");
  lines.push("```bash");
  lines.push("usm mcp serve     # stdio MCP server (runs in background)");
  lines.push("```");
  lines.push("");
  lines.push("### Configure MCP in Your AI Tool");
  lines.push("");
  lines.push("**Cursor** — add to `.cursor/mcp.json`:");
  lines.push("```json");
  lines.push('{');
  lines.push('  "mcpServers": {');
  lines.push('    "usm": {');
  lines.push('      "command": "usm",');
  lines.push('      "args": ["mcp", "serve"]');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");
  lines.push("**Claude Code / Claude Desktop** — add to config:");
  lines.push("```json");
  lines.push('{');
  lines.push('  "mcpServers": {');
  lines.push('    "usm": {');
  lines.push('      "command": "usm",');
  lines.push('      "args": ["mcp", "serve"]');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");
  lines.push("**OpenCode** — add to `opencode.jsonc`:");
  lines.push("```json");
  lines.push('"mcp": {');
  lines.push('  "usm": {');
  lines.push('    "type": "local",');
  lines.push('    "command": ["usm", "mcp", "serve"],');
  lines.push('    "enabled": true');
  lines.push('  }');
  lines.push('}');
  lines.push("```");
  lines.push("");
  lines.push("**Any MCP-compatible tool:** The server is stdio-based.");
  lines.push("");
  lines.push("## Step 5: Generate Rules Files");
  lines.push("");
  lines.push("```bash");
  lines.push("usm generate --only rules");
  lines.push("```");
  lines.push("");
  lines.push("Creates `.cursor/rules/usm.mdc`, `CLAUDE.md`, and `.github/copilot-instructions.md` —");
  lines.push("teaching your agent the spec-first workflow automatically.");
  lines.push("");
  lines.push("## Step 6: (Optional) Enrich with LLM");
  lines.push("");
  lines.push("Scanned .usm files contain `TODO: describe` placeholders. Fill them with an LLM:");
  lines.push("");
  lines.push("```bash");
  lines.push("usm enrich --dry-run          # Preview changes");
  lines.push("usm enrich                     # Fill TODOs (requires LLM config)");
  lines.push("```");
  lines.push("");
  lines.push("Supports OpenAI, Anthropic, Ollama, and LiteLLM (any OpenAI-compatible model).");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## How to Prompt Your Agent");
  lines.push("");
  lines.push("### First-time setup");
  lines.push("");
  lines.push("> Install USM in this repo: run `npm install -g @smithgray/usm`, then `usm init`,");
  lines.push("> `usm scan`, and `usm generate`. Start the MCP server with `usm mcp serve`.");
  lines.push("> Read the generated .usm files to understand the project structure. Going forward,");
  lines.push("> before implementing any feature, draft a .usm spec first using the MCP write tools,");
  lines.push("> show me the markdown for review, then build from the approved spec.");
  lines.push("");
  lines.push("### New feature");
  lines.push("");
  lines.push("> I want to add [feature description]. Use USM to draft a feature spec first —");
  lines.push("> call `usm_draft_feature` with the summary, intent, flows, and contracts. Show me");
  lines.push("> the generated markdown. Once I approve, write the .usm file and implement the");
  lines.push("> feature. Update the feature status to `built` when done.");
  lines.push("");
  lines.push("### Quick agent context");
  lines.push("");
  lines.push("> Read the .usm system map before starting work. Use `usm_list` to see all files,");
  lines.push("> `usm_search` to find relevant features, and `usm_read` to get details.");
  lines.push("");
  lines.push("### Bug fix");
  lines.push("");
  lines.push("> Fix [bug description]. First, search the .usm files with `usm_search` to find");
  lines.push("> the relevant feature spec. Read it with `usm_read` to understand the contracts");
  lines.push("> and tests. Fix the bug, then update the feature spec if the behavior changed.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Available MCP Tools (13)");
  lines.push("");
  lines.push("**Read (8):** `usm_list`, `usm_read`, `usm_search`, `usm_validate`,");
  lines.push("`usm_summary`, `usm_references`, `usm_get_contracts`, `usm_get_flows`");
  lines.push("");
  lines.push("**Write (5):** `usm_draft_feature`, `usm_write_feature`,");
  lines.push("`usm_update_feature`, `usm_update_feature_status`, `usm_report_feedback`");
  lines.push("");
  lines.push("## Verify It's Working");
  lines.push("");
  lines.push("```bash");
  lines.push("usm check                        # Validate all .usm files");
  lines.push("usm info .usm/system.usm         # Show system summary");
  lines.push("```");
  lines.push("");
  lines.push("## Next Steps");
  lines.push("");
  lines.push("- [CLI Reference](cli-reference.md)");
  lines.push("- [Configuration](config-reference.md)");
  lines.push("- [Schema Reference](schema-reference.md)");
  lines.push("- [MCP Tools](mcp-reference.md)");
  lines.push("- [Language Support](language-support.md)");
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/agent-setup-guide.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate data/models.md — from .usm/data/models.usm + Prisma schema.
 * Also accepts ServiceUsm files that live in .usm/data/ (scan generates
 * them with $type: service rather than $type: data).
 */
export function generateDataModelDoc(dataFiles: DataUsm[], root: string, serviceFiles?: ServiceUsm[]): GenerationResult {
  const lines: string[] = [];
  lines.push("# Data Model");
  lines.push("");

  // Collect data from both DataUsm and ServiceUsm files in .usm/data/
  const allDataSources: Array<{
    summary: string;
    type?: string;
    runtime?: string;
    port?: number;
    schema_source?: string;
    models?: string[];
    modules?: Array<{ name: string; purpose: string; paths?: string[] }>;
  }> = [...dataFiles];

  // Also look for ServiceUsm files that are in the .usm/data/ directory
  if (serviceFiles) {
    for (const svc of serviceFiles) {
      const slug = serviceSlug(svc);
      // Skip seed data files — they have their own generator
      if (isSeedDataFile(svc)) continue;
      // Check if this service file is in .usm/data/ by checking its $id
      if (svc.$id.includes("models") || svc.paths?.some(p => p.includes("prisma") || p.includes("schema"))) {
        // Check if a DataUsm version already exists to avoid duplicates
        const alreadyCovered = dataFiles.some(d => d.$id === svc.$id);
        if (!alreadyCovered) {
          allDataSources.push({
            summary: svc.summary,
            type: svc.type,
            runtime: svc.runtime,
            port: svc.port,
            models: svc.modules?.map(m => m.name),
            modules: svc.modules,
          });
        }
      }
    }
  }

  // Try to directly read .usm/data/ files
  const dataDir = path.join(root, ".usm", "data");
  if (fs.existsSync(dataDir)) {
    const dataDirFiles = findUsmFiles(dataDir);
    for (const filePath of dataDirFiles) {
      try {
        const parsed = parseUsmFile(filePath);
        // Avoid duplicates
        const alreadyCovered = allDataSources.some(d => d.summary === parsed.summary);
        if (!alreadyCovered) {
          if (parsed.$type === "data") {
            const d = parsed as DataUsm;
            allDataSources.push({
              summary: d.summary,
              type: d.type,
              runtime: d.runtime,
              port: d.port,
              schema_source: d.schema_source,
              models: d.models,
              modules: d.modules,
            });
          } else if (parsed.$type === "service") {
            const s = parsed as ServiceUsm;
            // Skip seed data files — they have their own generator
            if (isSeedDataFile(s)) continue;
            allDataSources.push({
              summary: s.summary,
              type: s.type,
              runtime: s.runtime,
              port: s.port,
              models: s.modules?.map(m => m.name),
              modules: s.modules,
            });
          }
        }
      } catch {
        // Skip unparseable files
      }
    }
  }

  if (allDataSources.length > 0) {
    const mainData = allDataSources[0];
    const totalModels = allDataSources.reduce((sum, d) => sum + (d.models?.length ?? d.modules?.length ?? 0), 0);
    lines.push(`Source: \`.usm/data/*.usm\` (${totalModels} models)`);
    lines.push("");
    lines.push(mainData.summary);
    lines.push("");

    // Metadata table
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (mainData.type) lines.push(`| Type | ${mainData.type} |`);
    if (mainData.runtime) lines.push(`| Runtime | ${mainData.runtime} |`);
    if (mainData.port) lines.push(`| Port | ${mainData.port} |`);
    if (mainData.schema_source) lines.push(`| Schema Source | ${mainData.schema_source} |`);
    lines.push("");
  } else {
    lines.push("Source: `.usm/data/*.usm`");
    lines.push("");
  }

  // Parse Prisma schema
  const schemaPath = path.join(root, "packages", "db", "prisma", "schema.prisma");
  const prismaModels = parsePrismaSchema(schemaPath);

  for (const data of allDataSources) {
    const moduleDescriptions = new Map<string, string>();
    if (data.modules) {
      for (const mod of data.modules) {
        moduleDescriptions.set(mod.name, mod.purpose);
      }
    }

    const modelNames = data.models || data.modules?.map((m) => m.name) || [];
    if (modelNames.length === 0) continue;

    lines.push(`## Models (${modelNames.length} total)`);
    lines.push("");

    for (const modelName of modelNames) {
      const description = moduleDescriptions.get(modelName) || "";
      lines.push(`### ${modelName}`);
      lines.push("");
      if (description && !description.startsWith("TODO:")) {
        lines.push(`**Description**: ${description}`);
        lines.push("");
      }

      const prismaModel = prismaModels.get(modelName);
      if (prismaModel && prismaModel.fields.length > 0) {
        lines.push("| Field | Type | Required | Description |");
        lines.push("|-------|------|----------|-------------|");
        for (const field of prismaModel.fields) {
          const required = field.isRequired ? "yes" : "no";
          const desc = field.description || "—";
          lines.push(`| ${field.name} | ${field.type} | ${required} | ${desc} |`);
        }
        lines.push("");

        if (prismaModel.relations.length > 0) {
          lines.push("**Relations**:");
          lines.push("");
          for (const rel of prismaModel.relations) {
            lines.push(`- \`${modelName}\` → ${rel}`);
          }
          lines.push("");
        }

        if (prismaModel.indexes.length > 0) {
          lines.push(`<details><summary>Indexes (${prismaModel.indexes.length})</summary>`);
          lines.push("");
          for (const idx of prismaModel.indexes) {
            lines.push(`- ${idx}`);
          }
          lines.push("");
          lines.push("</details>");
          lines.push("");
        }
      }
    }
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/data/models.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate data/README.md
 */
export function generateDataIndex(root: string): GenerationResult {
  const lines: string[] = [];
  lines.push("# Data");
  lines.push("");
  lines.push("Cross-cutting data documentation.");
  lines.push("");
  lines.push("- [Data Models](models.md)");
  lines.push("");

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/data/README.md`,
      content: lines.join("\n"),
    }],
  };
}

// ─── Seed Data → data/seed_users.md ──────────────────────────────────────────

/**
 * Parse key:value entries from a module's `paths` array.
 * E.g., ["email:james@smith-gray.com", "roles:OWNER,SUPERADMIN"]
 * becomes { email: "james@smith-gray.com", roles: "OWNER,SUPERADMIN" }
 */
function parsePathsEntries(paths: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of paths) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx !== -1) {
      const key = entry.slice(0, colonIdx);
      const value = entry.slice(colonIdx + 1);
      result[key] = value;
    }
  }
  return result;
}

/**
 * Generate data/seed_users.md — from .usm/data/seed_users.usm
 * Renders canonical test users as a Markdown table with dev server startup commands.
 */
export function generateSeedDataDoc(serviceFiles: ServiceUsm[], root: string): GenerationResult {
  const lines: string[] = [];

  // Find seed data files from the service files list
  const seedFiles = serviceFiles.filter(isSeedDataFile);

  // Also scan .usm/data/ directly for any seed files not yet collected
  const dataDir = path.join(root, ".usm", "data");
  if (fs.existsSync(dataDir)) {
    const dataDirFiles = findUsmFiles(dataDir);
    for (const filePath of dataDirFiles) {
      try {
        const parsed = parseUsmFile(filePath);
        if (isServiceFile(parsed) && isSeedDataFile(parsed)) {
          const alreadyCovered = seedFiles.some(s => s.$id === parsed.$id);
          if (!alreadyCovered) {
            seedFiles.push(parsed);
          }
        }
      } catch {
        // Skip unparseable files
      }
    }
  }

  if (seedFiles.length === 0) {
    return { outputs: [] };
  }

  const file = seedFiles[0];
  const title = file.name || "Seed Users & Test Data";

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");
  lines.push("> **Note**: All passwords listed below are local-development only. Never use these in production.");
  lines.push("");

  // Conventions
  if (file.conventions && file.conventions.length > 0) {
    lines.push("## Conventions");
    lines.push("");
    for (const conv of file.conventions) {
      lines.push(`- ${conv}`);
    }
    lines.push("");
  }

  // Seeding Setup
  const testingDetails = file.testing_details;
  const setup = (testingDetails?.setup as string[] | undefined);
  if (setup && setup.length > 0) {
    lines.push("## Seeding Setup");
    lines.push("");
    for (const step of setup) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  // Canonical Test Users table
  if (file.modules && file.modules.length > 0) {
    lines.push("## Canonical Test Users");
    lines.push("");
    lines.push("| Email | User ID | Roles | Password | Purpose |");
    lines.push("|-------|---------|-------|----------|---------|");
    for (const mod of file.modules) {
      const meta = parsePathsEntries(mod.paths || []);
      const email = meta.email || "—";
      const userId = meta.user_id || meta.zitadel_id || "—";
      const roles = meta.roles || "—";
      const password = meta.password || "—";
      lines.push(`| \`${email}\` | \`${userId}\` | ${roles} | \`${password}\` | ${mod.purpose} |`);
    }
    lines.push("");

    // Password env var references
    const hasPasswordRefs = file.modules.some(mod => {
      const meta = parsePathsEntries(mod.paths || []);
      return meta.password_ref;
    });
    if (hasPasswordRefs) {
      lines.push("### Environment Variable References");
      lines.push("");
      lines.push("| User | Env Var |");
      lines.push("|------|---------|");
      for (const mod of file.modules) {
        const meta = parsePathsEntries(mod.paths || []);
        if (meta.password_ref) {
          lines.push(`| ${mod.name} | \`${meta.password_ref}\` |`);
        }
      }
      lines.push("");
    }
  }

  // Dev Server Startup
  const devServers = (testingDetails?.dev_servers as Array<{
    name?: string;
    command?: string;
    port?: number;
    requires_db?: boolean;
  }> | undefined);
  if (devServers && devServers.length > 0) {
    lines.push("## Dev Server Startup");
    lines.push("");
    lines.push("| App | Command | Port | Requires DB |");
    lines.push("|-----|---------|------|-------------|");
    for (const svc of devServers) {
      const name = svc.name || "—";
      const command = svc.command ? `\`${svc.command}\`` : "—";
      const port = svc.port ? String(svc.port) : "—";
      const requiresDb = svc.requires_db ? "yes" : "no";
      lines.push(`| ${name} | ${command} | ${port} | ${requiresDb} |`);
    }
    lines.push("");
  }

  // History
  const history = (testingDetails?.history as {
    note?: string;
    references_merged?: string[];
  } | undefined);
  if (history) {
    lines.push("## History");
    lines.push("");
    if (history.note) {
      lines.push(history.note);
      lines.push("");
    }
    if (history.references_merged && history.references_merged.length > 0) {
      lines.push("**References merged**:");
      lines.push("");
      for (const ref of history.references_merged) {
        lines.push(`- ${ref}`);
      }
      lines.push("");
    }
  }

  return {
    outputs: [{
      path: `${root}/.usm-workspace/docs/data/seed_users.md`,
      content: lines.join("\n"),
    }],
  };
}

/**
 * Generate per-app decisions index from features and services.
 */
export function generatePerAppDecisions(
  features: FeatureUsm[],
  services: ServiceUsm[],
  root: string
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const app of APP_DIRS) {
    const appFeatures = featuresOwnedByApp(features, app);
    const appServices = servicesForApp(services, app);
    if (appFeatures.length === 0 && appServices.length === 0) continue;

    const hasDecisions = appServices.some(s => s.decisions && s.decisions.length > 0) ||
      appFeatures.some(f => f.decisions && f.decisions.length > 0);

    const lines: string[] = [];
    lines.push("# Architecture Decision Records");
    lines.push("");
    lines.push(`App-specific decisions for **${app}**.`);
    lines.push("");

    if (!hasDecisions) {
      lines.push("No decisions documented in this app's .usm files yet.");
      lines.push("");
      lines.push("Use the [ADR template](0001-template.md) to add one.");
      lines.push("");
    } else {
      for (const svc of appServices) {
        if (svc.decisions && svc.decisions.length > 0) {
          lines.push(`## ${svc.$id}`);
          lines.push("");
          renderDecisionsTable(lines, svc.decisions);
        }
      }
      for (const feat of appFeatures) {
        if (feat.decisions && feat.decisions.length > 0) {
          lines.push(`## ${feat.$id}`);
          lines.push("");
          renderDecisionsTable(lines, feat.decisions);
        }
      }
    }

    outputs.push({
      path: `${root}/apps/${app}/.usm-workspace/docs/decisions/README.md`,
      content: lines.join("\n"),
    });
  }

  // Also for shared services
  const sharedServices = services.filter(s => classifyService(s) === "shared-service");
  for (const svc of sharedServices) {
    if (svc.decisions && svc.decisions.length > 0) {
      const slug = serviceSlug(svc);
      const lines: string[] = [];
      lines.push("# Architecture Decision Records");
      lines.push("");
      lines.push(`Decisions for **${slugToTitle(slug)}**.`);
      lines.push("");
      renderDecisionsTable(lines, svc.decisions);

      outputs.push({
        path: `${root}/.usm-workspace/docs/shared-services/${slug}/decisions/README.md`,
        content: lines.join("\n"),
      });
    }
  }

  return { outputs };
}

/**
 * Generate per-app api/reference.md from feature routes.
 */
export function generatePerAppApiReference(features: FeatureUsm[], root: string): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const app of APP_DIRS) {
    const appFeatures = featuresOwnedByApp(features, app);
    const apiRoutes = collectApiRoutes(appFeatures);
    if (apiRoutes.length === 0) continue;

    const lines: string[] = [];
    lines.push("# API Reference");
    lines.push("");
    lines.push(`App-specific API endpoints for **${app}**.`);
    lines.push("");

    lines.push("| Method | Path | Feature | Auth |");
    lines.push("|--------|------|---------|------|");
    for (const r of apiRoutes) {
      const methods = r.methods.length > 0 ? r.methods.join(", ") : "—";
      const auth = r.authRequired ? "required" : "none";
      lines.push(`| ${methods} | \`${r.path}\` | ${r.feature} | ${auth} |`);
    }
    lines.push("");

    outputs.push({
      path: `${root}/apps/${app}/.usm-workspace/docs/api/reference.md`,
      content: lines.join("\n"),
    });
  }

  return { outputs };
}

/**
 * Generate per-app api/contracts.md from feature contracts.
 */
export function generatePerAppApiContracts(features: FeatureUsm[], root: string): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const app of APP_DIRS) {
    const appFeatures = featuresOwnedByApp(features, app);
    const hasContracts = appFeatures.some(f => f.contracts && f.contracts.length > 0);
    if (!hasContracts) continue;

    const lines: string[] = [];
    lines.push("# API Contracts");
    lines.push("");
    lines.push(`App-specific contracts for **${app}**.`);
    lines.push("");

    for (const feat of appFeatures) {
      if (feat.contracts && feat.contracts.length > 0) {
        lines.push(`## ${feat.$id}`);
        lines.push("");
        for (const contract of feat.contracts) {
          renderContract(lines, contract);
        }
      }
    }

    outputs.push({
      path: `${root}/apps/${app}/.usm-workspace/docs/api/contracts.md`,
      content: lines.join("\n"),
    });
  }

  return { outputs };
}

/**
 * Generate per-app ui/ui-map.md from feature interfaces.
 */
export function generatePerAppUiMap(features: FeatureUsm[], root: string): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const app of APP_DIRS) {
    const appFeatures = featuresOwnedByApp(features, app);
    const hasInterfaces = appFeatures.some(f => f.interfaces && f.interfaces.length > 0);
    if (!hasInterfaces) continue;

    const lines: string[] = [];
    lines.push("# UI Map");
    lines.push("");
    lines.push(`App-specific UI pages and elements for **${app}**.`);
    lines.push("");

    const pageMap = new Map<string, Array<{ feature: string; iface: Interface }>>();
    for (const feat of appFeatures) {
      if (feat.interfaces) {
        for (const iface of feat.interfaces) {
          const page = iface.page || "/";
          if (!pageMap.has(page)) pageMap.set(page, []);
          pageMap.get(page)!.push({ feature: feat.$id, iface });
        }
      }
    }

    const sortedPages = [...pageMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [pageUrl, entries] of sortedPages) {
      const featureList = [...new Set(entries.map((e) => e.feature))];
      lines.push(`## Page: \`${pageUrl}\``);
      lines.push("");
      if (featureList.length > 1) {
        lines.push(`**Features**: ${featureList.join(", ")}`);
        lines.push("");
      }

      const mergedElements: Array<{ id: string; type: string; label: string; visible_when: string }> = [];
      for (const entry of entries) {
        if (entry.iface.elements) {
          for (const el of entry.iface.elements) {
            mergedElements.push({
              id: el.id || "—",
              type: el.type || "—",
              label: el.label || "—",
              visible_when: el.visible_when || "always",
            });
          }
        }
      }

      if (mergedElements.length > 0) {
        lines.push("| ID | Type | Label | Visible When |");
        lines.push("|----|------|-------|-------------|");
        for (const el of mergedElements) {
          lines.push(`| ${el.id} | ${el.type} | ${el.label} | ${el.visible_when} |`);
        }
        lines.push("");
      } else {
        lines.push("_No elements documented for this page._");
        lines.push("");
      }
    }

    outputs.push({
      path: `${root}/apps/${app}/.usm-workspace/docs/ui/ui-map.md`,
      content: lines.join("\n"),
    });
  }

  return { outputs };
}

/**
 * Generate per-app testing/specs.md from feature tests.
 */
export function generatePerAppTestSpecs(features: FeatureUsm[], root: string): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  for (const app of APP_DIRS) {
    const appFeatures = featuresOwnedByApp(features, app);
    const hasTests = appFeatures.some(f => f.tests && f.tests.length > 0);
    if (!hasTests) continue;

    const lines: string[] = [];
    lines.push("# Test Specifications");
    lines.push("");
    lines.push(`App-specific test specs for **${app}**.`);
    lines.push("");

    for (const feat of appFeatures) {
      if (feat.tests && feat.tests.length > 0) {
        const statusBadge = feat.status ? ` [${feat.status}]` : "";
        lines.push(`## ${feat.$id}${statusBadge}`);
        lines.push("");
        for (const test of feat.tests) {
          renderTest(lines, test);
        }
      }
    }

    outputs.push({
      path: `${root}/apps/${app}/.usm-workspace/docs/testing/specs.md`,
      content: lines.join("\n"),
    });
  }

  return { outputs };
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Get the display name for a service, preferring the `name` field (if set)
 * over the slug-derived title. This ensures "Agent X (Tenant)" appears
 * instead of "Tenant" when the .usm file has `name: Agent X (Tenant)`.
 */
function displayName(file: ServiceUsm, slug: string): string {
  return file.name || slugToTitle(slug);
}

function sectionReadme(title: string, description: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(description);
  lines.push("");
  return lines.join("\n");
}

function placeholder(title: string, file: ServiceUsm): string {
  const lines: string[] = [];
  const serviceName = file.$id.split("/").pop() || "Service";
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`_Placeholder for ${serviceName}. Populated from .usm source or hand-written._`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Build architecture/overview.md from the service USM.
 * Includes summary, identity, depends_on, and key properties.
 */
function buildArchOverview(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);
  const badge = file.status ? ` [${file.status}]` : "";

  lines.push(`# ${title} — Architecture Overview${badge}`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");

  // Identity table
  lines.push("## Identity");
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| Type | ${file.type} |`);
  lines.push(`| Runtime | ${file.runtime} |`);
  if (file.port) lines.push(`| Port | ${file.port} |`);
  if (file.status) lines.push(`| Status | ${file.status} |`);
  lines.push("");

  // Depends On
  if (file.depends_on && file.depends_on.length > 0) {
    lines.push("## Dependencies");
    lines.push("");
    for (const dep of file.depends_on) {
      const depSlug = dep.split("/").pop() || dep;
      lines.push(`- ${depSlug}`);
    }
    lines.push("");
  }

  // Paths
  if (file.paths && file.paths.length > 0) {
    lines.push("## Source Paths");
    lines.push("");
    for (const p of file.paths) {
      lines.push(`- \`${p}\``);
    }
    lines.push("");
  }

  // Cross-link to platform-level
  lines.push("## Platform-Level Docs");
  lines.push("");
  lines.push("For the full platform architecture, see [Platform System Architecture](../../../../.usm-workspace/docs/architecture/system-architecture.md).");
  lines.push("");

  return lines.join("\n");
}

/**
 * Build architecture/system-architecture.md — cross-link to platform-level.
 */
function buildArchSystemArchitecture(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — System Architecture`);
  lines.push("");
  lines.push(file.summary);
  lines.push("");
  lines.push("For the full system architecture, see:");
  lines.push("");
  lines.push("- [Platform System Architecture](../../../../.usm-workspace/docs/architecture/system-architecture.md)");
  lines.push("");

  // Modules summary
  if (file.modules && file.modules.length > 0) {
    lines.push("## Modules");
    lines.push("");
    lines.push("| Module | Purpose |");
    lines.push("|--------|---------|");
    for (const mod of file.modules) {
      lines.push(`| ${mod.name} | ${mod.purpose} |`);
    }
    lines.push("");
    lines.push("See [Modules](modules.md) for full details with source paths.");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build architecture/security.md from service USM or defaults.
 */
function buildArchSecurity(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Security Model`);
  lines.push("");

  // If the service has explicit security config, use it
  if (file.security && file.security.auth_method) {
    lines.push("## Authentication");
    lines.push("");
    lines.push(`- **Auth method**: ${file.security.auth_method}`);
    if (file.security.secrets_ref) {
      lines.push(`- **Secrets ref**: ${file.security.secrets_ref}`);
    }
    lines.push("");
  } else {
      lines.push("## Authentication");
      lines.push("");
      lines.push("See the service's .usm file for auth configuration details.");
      lines.push("");
  }

  // Cross-link to platform security
  lines.push("## Platform-Level Security");
  lines.push("");
  lines.push("For the full platform security model, see [Platform Security Model](../../../../.usm-workspace/docs/architecture/security-model.md).");
  lines.push("");

  return lines.join("\n");
}

/**
 * Build architecture/data-model.md — cross-link to platform-level Prisma schema.
 */
function buildArchDataModel(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Data Model`);
  lines.push("");
  lines.push(`This app uses the shared data model.`);
  lines.push("");
  lines.push("For the full data model documentation, see [Data Models](../../../../.usm-workspace/docs/data/models.md).");
  lines.push("");

  // List modules that reference the database
  const dbModules = (file.modules || []).filter(m =>
    m.purpose.toLowerCase().includes("database") ||
    m.purpose.toLowerCase().includes("prisma") ||
    m.purpose.toLowerCase().includes("data access") ||
    m.purpose.toLowerCase().includes("orm") ||
    (m.paths || []).some(p => p.includes("prisma") || p.includes("queries"))
  );

  if (dbModules.length > 0) {
    lines.push("## Database-Related Modules");
    lines.push("");
    lines.push("| Module | Purpose |");
    lines.push("|--------|---------|");
    for (const mod of dbModules) {
      lines.push(`| ${mod.name} | ${mod.purpose} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build deployment/local-dev.md from the service USM dev block.
 */
function buildDeployLocalDev(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Local Development`);
  lines.push("");

  if (file.dev) {
    lines.push("## Dev Server");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (file.dev.command) lines.push(`| Command | \`${file.dev.command}\` |`);
    if (file.dev.url) lines.push(`| URL | ${file.dev.url} |`);
    if (file.port) lines.push(`| Port | ${file.port} |`);
    lines.push("");

    if (file.dev.env && Object.keys(file.dev.env).length > 0) {
      lines.push("## Environment Variables");
      lines.push("");
      lines.push("| Variable | Value |");
      lines.push("|----------|-------|");
      for (const [key, val] of Object.entries(file.dev.env)) {
        lines.push(`| \`${key}\` | ${val} |`);
      }
      lines.push("");
    }
  } else {
    lines.push("## Dev Server");
    lines.push("");
    lines.push("No `dev` block in the service USM. Default commands:");
    lines.push("");
    lines.push("| Command | Description |");
    lines.push("|---------|-------------|");
    lines.push(`| \`cd apps/${slug} && npm run dev\` | Start dev server |`);
    lines.push(`| \`cd apps/${slug} && npm run build\` | Production build |`);
    lines.push(`| \`cd apps/${slug} && npm start\` | Start production server |`);
    lines.push("");
  }

  // Common commands table
  lines.push("## Common Commands");
  lines.push("");
  lines.push("| Command | Description |");
  lines.push("|---------|-------------|");
  lines.push(`| \`cd apps/${slug} && npm run lint\` | ESLint |`);
  lines.push(`| \`cd apps/${slug} && npm run typecheck\` | TypeScript type checking |`);
  if (file.port) {
    lines.push(`| \`curl -sf http://localhost:${file.port}/\` | Health check |`);
  }
  lines.push("");

  // Database
  if (file.type === "web-app" || file.type === "api") {
    lines.push("## Database");
    lines.push("");
    lines.push("See the service's .usm file for database configuration.");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build deployment/production.md — cross-link to platform-level AWS docs.
 */
function buildDeployProduction(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Production Deployment`);
  lines.push("");

  if (file.prod && file.prod.url) {
    lines.push("## Production");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (file.prod.url) lines.push(`| URL | ${file.prod.url} |`);
    if (file.prod.region) lines.push(`| Region | ${file.prod.region} |`);
    if (file.prod.deployment_ref) lines.push(`| Deployment | ${file.prod.deployment_ref} |`);
    lines.push("");
  }

  lines.push("## Platform-Level Deployment");
  lines.push("");
  lines.push("For AWS deployment documentation, see:");
  lines.push("");
  lines.push("- [AWS Deployment](../../../../.usm-workspace/docs/deployment/aws.md)");
  lines.push("- [AWS Runbook](../../../../docs/deployment/clouds/aws/runbook.md)");
  lines.push("");

  return lines.join("\n");
}

/**
 * Build operations/observability.md — cross-link to platform-level.
 */
function buildOpsObservability(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Observability`);
  lines.push("");
  lines.push("This app uses platform-level observability infrastructure.");
  lines.push("");
  lines.push("For monitoring, alerting, and dashboard details, see [Platform Observability](../../../../.usm-workspace/docs/operations/observability.md).");
  lines.push("");

  // Health check
  if (file.port) {
    lines.push("## Health Check");
    lines.push("");
    lines.push("```bash");
    lines.push(`curl -sf http://localhost:${file.port}/api/health`);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build operations/incident-response.md — cross-link to platform-level.
 */
function buildOpsIncidentResponse(file: ServiceUsm, slug: string): string {
  const lines: string[] = [];
  const title = displayName(file, slug);

  lines.push(`# ${title} — Incident Response`);
  lines.push("");
  lines.push("This app follows the platform incident response process.");
  lines.push("");
  lines.push("For runbooks and escalation procedures, see [Platform Incident Response](../../../../.usm-workspace/docs/operations/incident-response.md).");
  lines.push("");

  return lines.join("\n");
}

function adrTemplate(): string {
  const lines: string[] = [];
  lines.push("# ADR 0001: Template");
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push("Proposed | Accepted | Rejected | Superseded");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push("What is the issue that we're seeing that is motivating this decision or change?");
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push("What is the change that we're proposing and/or doing?");
  lines.push("");
  lines.push("## Consequences");
  lines.push("");
  lines.push("What becomes easier or more difficult to do because of this change?");
  lines.push("");
  return lines.join("\n");
}

function appFromService(serviceRef: string): string {
  const parts = serviceRef.split("/");
  return parts[parts.length - 1] || "unknown";
}

function appFromPaths(paths: string[]): string {
  for (const p of paths) {
    const match = p.match(/^apps\/([^/]+)/);
    if (match) return match[1];
  }
  return "unknown";
}

/**
 * Broad match: features that appear in an app (owned or cross-cutting).
 * Used by surface tables — a feature may have routes/pages in multiple apps.
 */
function featuresForApp(features: FeatureUsm[], app: string): FeatureUsm[] {
  return features.filter((f) => {
    // Check $service first
    if (appFromService(f.$service) === app) return true;
    // Also check routes[].app
    if (f.routes?.some(r => r.app === app)) return true;
    // Also check apps[] field
    if (f.apps?.includes(app)) return true;
    return false;
  });
}

/**
 * Strict match: features OWNED by an app (only $service filter).
 * Used by per-app aggregator docs (decisions, API ref, contracts, UI map,
 * test specs) to prevent cross-app feature leakage.
 *
 * Features without a $service field are excluded — they have no owner.
 */
function featuresOwnedByApp(features: FeatureUsm[], app: string): FeatureUsm[] {
  return features.filter((f) => {
    if (!f.$service) return false;
    return appFromService(f.$service) === app;
  });
}

function featuresForService(features: FeatureUsm[], serviceSlug: string): FeatureUsm[] {
  return features.filter((f) => {
    const $serviceSlug = f.$service?.split("/").pop() || "";
    return $serviceSlug === serviceSlug;
  });
}

function servicesForApp(services: ServiceUsm[], app: string): ServiceUsm[] {
  return services.filter((s) => {
    if (!s.paths) return false;
    return s.paths.some((p) => p.startsWith(`apps/${app}`));
  });
}

function collectApiRoutes(features: FeatureUsm[]): Array<{
  feature: string;
  path: string;
  methods: string[];
  file: string;
  authRequired: boolean;
}> {
  const routes: Array<{
    feature: string;
    path: string;
    methods: string[];
    file: string;
    authRequired: boolean;
  }> = [];

  for (const feat of features) {
    if (feat.routes) {
      for (const route of feat.routes) {
        if (route.type === "api") {
          routes.push({
            feature: feat.$id,
            path: route.path,
            methods: route.http_methods || [],
            file: route.file_path || "—",
            authRequired: route.auth_required || false,
          });
        }
      }
    }
  }

  return routes;
}

function renderDecisions(lines: string[], decisions: Decision[]): void {
  for (const d of decisions) {
    const statusBadge = d.status ? ` [${d.status}]` : "";
    lines.push(`### ${d.id}${statusBadge}`);
    lines.push("");
    lines.push(`**Decision**: ${d.decision}`);
    lines.push("");
    lines.push(`**Rationale**: ${d.rationale}`);
    lines.push("");

    if (d.alternatives && d.alternatives.length > 0) {
      lines.push("**Alternatives considered**:");
      lines.push("");
      for (const alt of d.alternatives) {
        lines.push(`- ${alt.option} — *rejected*: ${alt.rejected_because}`);
      }
      lines.push("");
    }

    if (d.consequences) {
      lines.push(`**Consequences**: ${d.consequences}`);
      lines.push("");
    }

    if (d.date) {
      lines.push(`*Date: ${d.date}*`);
      lines.push("");
    }
  }
}

function renderDecisionsTable(lines: string[], decisions: Decision[]): void {
  lines.push("| ID | Decision | Status | Date |");
  lines.push("|----|----------|--------|------|");
  for (const d of decisions) {
    const status = d.status || "accepted";
    const date = d.date || "—";
    lines.push(`| ${d.id} | ${d.decision} | ${status} | ${date} |`);
  }
  lines.push("");
}

function renderFlow(lines: string[], flow: Flow): void {
  lines.push(`### ${flow.name} (\`${flow.id}\`)`);
  lines.push("");
  if (flow.description) {
    lines.push(flow.description);
    lines.push("");
  }
  flow.steps.forEach((step, i) => {
    const target = step.target ? ` → ${step.target}` : "";
    lines.push(`${i + 1}. **${step.action}**${target}`);
    if (step.expect && step.expect.length > 0) {
      for (const exp of step.expect) {
        const entries = Object.entries(exp);
        const expectStr = entries.map(([k, v]) => `${k}: ${v}`).join(", ");
        lines.push(`   - *expects*: ${expectStr}`);
      }
    }
  });
  lines.push("");
}

function renderInterface(lines: string[], iface: Interface): void {
  const page = iface.page || "Unknown page";
  lines.push(`### Page: \`${page}\``);
  lines.push("");

  if (iface.elements && iface.elements.length > 0) {
    lines.push("| ID | Type | Label | Visible When |");
    lines.push("|----|------|-------|-------------|");
    for (const el of iface.elements) {
      const type = el.type || "—";
      const label = el.label || "—";
      const vis = el.visible_when || "always";
      lines.push(`| ${el.id} | ${type} | ${label} | ${vis} |`);
    }
    lines.push("");
  }

  if (iface.visibility && iface.visibility.length > 0) {
    lines.push("**Visibility rules**:");
    lines.push("");
    for (const rule of iface.visibility) {
      const entries = Object.entries(rule);
      lines.push(`- ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
    }
    lines.push("");
  }
}

function renderContract(lines: string[], contract: Contract): void {
  lines.push(`### \`${contract.id}\``);
  lines.push("");
  lines.push(contract.description);
  lines.push("");

  if (contract.applies_after && contract.applies_after.length > 0) {
    lines.push(`**Applies after**: ${contract.applies_after.join(", ")}`);
    lines.push("");
  }

  if (contract.must_have && contract.must_have.length > 0) {
    lines.push("**Acceptance criteria**:");
    lines.push("");
    for (const item of contract.must_have) {
      if (typeof item === "string") {
        lines.push(`- [ ] ${item}`);
      } else {
        const entries = Object.entries(item);
        lines.push(`- [ ] ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
      }
    }
    lines.push("");
  }
}

function renderTest(lines: string[], test: FeatureTest): void {
  lines.push(`### \`${test.id}\``);
  lines.push("");

  // Given (setup)
  if (test.setup && Object.keys(test.setup).length > 0) {
    lines.push("**Given**:");
    lines.push("");
    for (const [key, val] of Object.entries(test.setup)) {
      lines.push(`- ${key}: ${JSON.stringify(val)}`);
    }
    lines.push("");
  }

  // When (flow reference)
  if (test.flow) {
    if (typeof test.flow === "string") {
      lines.push(`**When**: ${test.flow}`);
    } else {
      let desc = test.flow.ref;
      if (test.flow.steps_until) {
        desc += ` (until step ${test.flow.steps_until})`;
      }
      lines.push(`**When**: ${desc}`);
    }
    lines.push("");
  }

  // Then (expectations)
  lines.push("**Then**:");
  lines.push("");
  for (const exp of test.expect) {
    const entries = Object.entries(exp);
    lines.push(`- ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }
  lines.push("");

  if (test.contracts && test.contracts.length > 0) {
    lines.push(`**Contracts verified**: ${test.contracts.join(", ")}`);
    lines.push("");
  }
}

// ─── New USM Field Builders ────────────────────────────────────────────────────

function buildProjectStructureDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Project Structure");
  lines.push("");
  lines.push("```text");
  lines.push(file.project_structure!);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function buildRbacDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# RBAC Model");
  lines.push("");

  if (file.rbac?.description) {
    lines.push(file.rbac.description);
    lines.push("");
  }

  if (file.rbac?.roles && file.rbac.roles.length > 0) {
    lines.push("## Roles");
    lines.push("");
    lines.push("| Role | Access Level | Auth Helper |");
    lines.push("|------|-------------|-------------|");
    for (const role of file.rbac.roles) {
      const helper = role.helper || "—";
      lines.push(`| \`${role.name}\` | ${role.level} | ${helper} |`);
    }
    lines.push("");
  }

  if (file.rbac?.helpers && file.rbac.helpers.length > 0) {
    lines.push("## Auth Helpers");
    lines.push("");
    for (const helper of file.rbac.helpers) {
      lines.push(`- **${helper.name}** — ${helper.purpose}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildTechStackDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Tech Stack");
  lines.push("");

  if (file.tech_stack) {
    lines.push("| Layer | Technology |");
    lines.push("|-------|-----------|");
    for (const [layer, tech] of Object.entries(file.tech_stack)) {
      lines.push(`| ${layer} | ${tech} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildConventionsDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Conventions");
  lines.push("");

  if (file.conventions) {
    for (const conv of file.conventions) {
      lines.push(`- ${conv}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildRuntimeDetailsDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Agent Runtime Architecture");
  lines.push("");
  lines.push(file.runtime_details!);
  lines.push("");
  return lines.join("\n");
}

function buildTestingDetailsDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Testing");
  lines.push("");

  if (file.testing_details) {
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (file.testing_details.framework) lines.push(`| Framework | ${file.testing_details.framework} |`);
    if (file.testing_details.e2e_path) lines.push(`| E2E Path | ${file.testing_details.e2e_path} |`);
    if (file.testing_details.command) lines.push(`| Command | \`${file.testing_details.command}\` |`);
    if (file.testing_details.auth_testing) lines.push(`| Auth Testing | ${file.testing_details.auth_testing} |`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildPatternsDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  lines.push("# Patterns");
  lines.push("");

  if (file.patterns) {
    for (const pattern of file.patterns) {
      lines.push(`## ${pattern.name} (\`${pattern.id}\`)`);
      lines.push("");
      lines.push(pattern.description);
      lines.push("");

      if (pattern.implementation) {
        lines.push("### Implementation");
        lines.push("");
        lines.push(pattern.implementation);
        lines.push("");
      }

      if (pattern.details && pattern.details.length > 0) {
        lines.push("### Details");
        lines.push("");
        lines.push("| Key | Value |");
        lines.push("|-----|-------|");
        for (const detail of pattern.details) {
          lines.push(`| ${detail.key} | ${detail.value} |`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function buildInfrastructureDoc(file: ServiceUsm): string {
  const lines: string[] = [];
  const title = displayName(file, serviceSlug(file));

  lines.push(`# ${title} — Infrastructure`);
  lines.push("");
  lines.push("Source: `.usm/services/${serviceSlug(file)}.usm` → `infrastructure`");
  lines.push("");

  if (file.infrastructure) {
    renderInfrastructure(lines, file.infrastructure);
  }

  return lines.join("\n");
}

// ─── Local Development Renderer ────────────────────────────────────────────────

function renderLocalDevelopment(lines: string[], ld: LocalDevelopment): void {
  lines.push("## Local Development");
  lines.push("");
  lines.push("Source: `.usm/system.usm` → `local_development`");
  lines.push("");
  lines.push("> For canonical test users and seeding commands, see [Seed Users & Test Data](data/seed_users.md).");
  lines.push("");

  // Monorepo
  if (ld.monorepo) {
    lines.push("### Monorepo");
    lines.push("");
    lines.push("| Property | Value |");
    lines.push("|----------|-------|");
    if (ld.monorepo.package_manager) lines.push(`| Package Manager | ${ld.monorepo.package_manager} |`);
    if (ld.monorepo.package_manager_version) lines.push(`| PM Version | ${ld.monorepo.package_manager_version} |`);
    if (ld.monorepo.node_version) lines.push(`| Node Version | ${ld.monorepo.node_version} |`);
    if (ld.monorepo.install_command) lines.push(`| Install Command | \`${ld.monorepo.install_command}\` |`);
    if (ld.monorepo.workspace_pattern) lines.push(`| Workspace Pattern | ${ld.monorepo.workspace_pattern} |`);
    lines.push("");
  }

  // Apps
  if (ld.apps && ld.apps.length > 0) {
    lines.push("### Apps");
    lines.push("");
    lines.push("| Name | Port | Dev Command | URL | Requires DB |");
    lines.push("|------|------|-------------|-----|-------------|");
    for (const app of ld.apps) {
      const name = app.name || "—";
      const port = app.port ? String(app.port) : "—";
      const cmd = app.dev_command ? `\`${app.dev_command}\`` : "—";
      const url = app.url_local || "—";
      const db = app.requires_db ? "yes" : "no";
      lines.push(`| ${name} | ${port} | ${cmd} | ${url} | ${db} |`);
    }
    lines.push("");
  }

  // External Services
  if (ld.external_services && ld.external_services.length > 0) {
    lines.push("### External Services");
    lines.push("");
    lines.push("| Name | Port | Purpose | Managed By |");
    lines.push("|------|------|---------|------------|");
    for (const svc of ld.external_services) {
      const name = svc.name || "—";
      const port = svc.port ? String(svc.port) : "—";
      const purpose = svc.purpose || "—";
      const managedBy = svc.managed_by || "—";
      lines.push(`| ${name} | ${port} | ${purpose} | ${managedBy} |`);
    }
    lines.push("");
  }

  // Environment
  if (ld.environment) {
    lines.push("### Environment");
    lines.push("");
    if (ld.environment.root_env) {
      lines.push(`- **Root .env**: \`${ld.environment.root_env}\``);
    }
    if (ld.environment.per_app_env && ld.environment.per_app_env.length > 0) {
      lines.push("- **Per-app env**:");
      for (const env of ld.environment.per_app_env) {
        lines.push(`  - \`${env}\``);
      }
    }
    if (ld.environment.required_vars && ld.environment.required_vars.length > 0) {
      lines.push("- **Required vars**:");
      for (const v of ld.environment.required_vars) {
        lines.push(`  - \`${v}\``);
      }
    }
    lines.push("");
  }

  // Log Locations
  if (ld.log_locations) {
    lines.push("### Log Locations");
    lines.push("");
    lines.push("| Location | Path |");
    lines.push("|----------|------|");
    if (ld.log_locations.dev_server) lines.push(`| Dev Server | \`${ld.log_locations.dev_server}\` |`);
    if (ld.log_locations.build_output) lines.push(`| Build Output | \`${ld.log_locations.build_output}\` |`);
    if (ld.log_locations.test_output) lines.push(`| Test Output | \`${ld.log_locations.test_output}\` |`);
    lines.push("");
  }

  // Known Quirks
  if (ld.known_quirks && ld.known_quirks.length > 0) {
    lines.push("### Known Quirks");
    lines.push("");
    for (const quirk of ld.known_quirks) {
      const id = quirk.id || "—";
      lines.push(`#### \`${id}\` — ${quirk.title || "Untitled"}`);
      lines.push("");
      lines.push(quirk.description || "");
      lines.push("");
      if (quirk.workaround) {
        lines.push(`> **Workaround**: ${quirk.workaround}`);
        lines.push("");
      }
      const meta: string[] = [];
      if (quirk.affected_command) meta.push(`**Affected**: \`${quirk.affected_command}\``);
      if (quirk.fixed_in) meta.push(`**Fixed in**: ${quirk.fixed_in}`);
      if (meta.length > 0) {
        lines.push(meta.join(" · "));
        lines.push("");
      }
    }
  }
}

// ─── Prisma Schema Parser ────────────────────────────────────────────────────

interface PrismaField {
  name: string;
  type: string;
  isRequired: boolean;
  description: string;
}

interface PrismaModelInfo {
  fields: PrismaField[];
  relations: string[];
  indexes: string[];
}

function parsePrismaSchema(schemaPath: string): Map<string, PrismaModelInfo> {
  const models = new Map<string, PrismaModelInfo>();

  let content: string;
  try {
    content = fs.readFileSync(schemaPath, "utf-8");
  } catch {
    return models;
  }

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

    const fields: PrismaField[] = [];
    const relations: string[] = [];
    const indexes: string[] = [];

    const lines = blockContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      if (trimmed.startsWith("@@")) {
        indexes.push(trimmed.replace(/@@\w+\s*/, "").replace(/^\(|\)$/g, ""));
        continue;
      }

      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)(?:\s+(.*))?$/);
      if (!fieldMatch) continue;

      const [, fieldName, rawType, rest] = fieldMatch;
      if (fieldName === "enum") continue;

      let description = "";
      const commentIdx = (rest || "").lastIndexOf("//");
      if (commentIdx !== -1) {
        description = (rest || "").slice(commentIdx + 2).trim();
      }

      const isRequired = !rawType.endsWith("?");
      const isArray = rawType.endsWith("[]");
      const cleanType = rawType.replace("?", "").replace("[]", "");
      const isRelation = (rest || "").includes("@relation") || isArray;

      if (isRelation && !isArray) {
        const relNameMatch = (rest || "").match(/@relation\("([^"]+)"/);
        const relName = relNameMatch ? relNameMatch[1] : cleanType;
        relations.push(`${cleanType} (via ${fieldName}${relName !== cleanType ? `, "${relName}"` : ""})`);
      } else if (isArray) {
        relations.push(`many ${cleanType} (via ${fieldName})`);
      }

      let displayType = cleanType;
      if (isArray) displayType = `${cleanType}[]`;
      if ((rest || "").includes("@id")) displayType += " (PK)";
      if ((rest || "").includes("@unique") && !(rest || "").includes("@id")) displayType += " (UQ)";
      if ((rest || "").includes("@default")) {
        const defaultMatch = (rest || "").match(/@default\((.+?)(?:\)\s*(?:\/\/|$|\s))/);
        if (defaultMatch) {
          displayType += ` = ${defaultMatch[1]}`;
        }
      }

      fields.push({ name: fieldName, type: displayType, isRequired, description });
    }

    models.set(modelName, { fields, relations, indexes });
  }

  return models;
}
