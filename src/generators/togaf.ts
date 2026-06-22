import path from "node:path";
import fs from "node:fs";
import type {
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  GenerationResult,
  Contract,
  Decision,
} from "../types.js";
import { findAllUsmFiles, parseUsmFile, isSystemFile, isServiceFile, isFeatureFile } from "../parse.js";

/**
 * Generate all TOGAF ADM phase deliverables.
 * Output: `.agents-workspace/docs/togaf/{phase}-{name}.md`
 */
export function generateAllTogafDeliverables(system: SystemUsm, root: string): GenerationResult {
  const files = findAllUsmFiles(root);
  const services: ServiceUsm[] = [];
  const features: FeatureUsm[] = [];
  const data: DataUsm[] = [];

  for (const f of files) {
    try {
      const parsed = parseUsmFile(f);
      if (isSystemFile(parsed)) continue; // already passed as parameter
      else if (isServiceFile(parsed)) services.push(parsed);
      else if (isFeatureFile(parsed)) features.push(parsed);
      else if (parsed.$type === "data") data.push(parsed as DataUsm);
    } catch {
      // skip unparseable files
    }
  }

  const outputs: GenerationResult["outputs"] = [];

  const phaseGenerators: Array<{ name: string; fn: () => GenerationResult }> = [
    { name: "A", fn: () => generatePhaseAVision(system, root) },
    { name: "B", fn: () => generatePhaseBBusiness(system, features, root) },
    { name: "C1", fn: () => generatePhaseC1Data(system, data, root) },
    { name: "C2", fn: () => generatePhaseC2Application(system, services, features, root) },
    { name: "D", fn: () => generatePhaseDTechnology(system, services, root) },
    { name: "E", fn: () => generatePhaseESolutions(system, root) },
    { name: "G", fn: () => generatePhaseGGovernance(system, features, root) },
    { name: "H", fn: () => generatePhaseHChange(system, services, features, root) },
  ];

  for (const gen of phaseGenerators) {
    try {
      const result = gen.fn();
      outputs.push(...result.outputs);
    } catch (err) {
      console.error(`Error generating TOGAF phase ${gen.name}: ${(err as Error).message}`);
    }
  }

  return { outputs };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────

function writeDoc(root: string, relativePath: string, content: string): string {
  const fullPath = path.join(root, ".agents-workspace", "docs", "togaf", relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

function frontmatter(title: string, phase: string): string {
  return `---\ntitle: "${title}"\nphase: ${phase}\ngenerated: 2026-06-19\n---\n\n`;
}

// ─── Phase A: Architecture Vision ───────────────────────────────────────────────

function generatePhaseAVision(system: SystemUsm, root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Architecture Vision", "A"));
  lines.push("# Architecture Vision (TOGAF Phase A)\n\n");
  lines.push(`> Auto-generated from USM. Source: \`.usm/system.usm\`\n\n`);

  // Identity
  if (system.identity) {
    lines.push("## System Identity\n\n");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| Name | ${system.identity.name} |`);
    lines.push(`| Domain | ${system.identity.domain} |`);
    if (system.identity.contact) {
      lines.push(`| Contact | ${system.identity.contact} |`);
    }
    lines.push("");
  }

  // Summary
  if (system.summary) {
    lines.push("## Summary\n\n");
    lines.push(`${system.summary}\n\n`);
  }

  // Architecture Principles
  if (system.principles && system.principles.length > 0) {
    lines.push("## Architecture Principles\n\n");
    for (const p of system.principles) {
      lines.push(`### ${p.name} (\`${p.key}\`)\n\n`);
      lines.push(`**Statement**: ${p.statement}\n\n`);
      lines.push(`**Rationale**: ${p.rationale}\n\n`);
      if (p.implications && p.implications.length > 0) {
        lines.push("**Implications**:\n\n");
        for (const impl of p.implications) {
          lines.push(`- ${impl}\n`);
        }
        lines.push("\n");
      }
    }
  }

  // Roadmap
  if (system.roadmap && system.roadmap.length > 0) {
    lines.push("## Roadmap\n\n");
    lines.push("| ID | Title | Status | Target Date |");
    lines.push("|----|-------|--------|-------------|");
    for (const r of system.roadmap) {
      lines.push(`| ${r.id} | ${r.title} | ${r.status || "—"} | ${r.target_date || "—"} |`);
    }
    lines.push("\n");
  }

  // Feature Index
  if (system.index && system.index.length > 0) {
    lines.push("## Feature Index\n\n");
    lines.push("| ID | Name | Status | Tags |");
    lines.push("|----|------|--------|------|");
    for (const i of system.index) {
      const tags = (i.tags || []).join(", ");
      lines.push(`| ${i.id} | ${i.name} | ${i.status || "—"} | ${tags} |`);
    }
    lines.push("\n");
  }

  // Services overview diagram
  if (system.services && system.services.length > 0) {
    lines.push("## Services Overview\n\n");
    lines.push("```mermaid");
    lines.push("graph TD");

    const appServices = system.services.filter(s => s.ref?.includes("apps/"));
    const sharedServices = system.services.filter(s => ["idp", "llm-gateway", "agent-flows", "database"].includes(s.id));
    const packageServices = system.services.filter(s => !appServices.some(a => a.id === s.id) && !sharedServices.some(ss => ss.id === s.id));

    if (appServices.length > 0) {
      lines.push("    subgraph \"App Services\"");
      for (const s of appServices) {
        const nodeId = s.id.replace(/-/g, "_");
        const portStr = s.port ? ` &lt;port ${s.port}&gt;` : "";
        lines.push(`        ${nodeId}["${s.name}${portStr}"]`);
      }
      lines.push("    end");
    }
    if (sharedServices.length > 0) {
      lines.push("    subgraph \"Shared Services\"");
      for (const s of sharedServices) {
        const nodeId = s.id.replace(/-/g, "_");
        if (s.id === "postgres") {
          lines.push(`        ${nodeId}[("${s.name}")]`);
        } else {
          lines.push(`        ${nodeId}["${s.name}"]`);
        }
      }
      lines.push("    end");
    }
    if (packageServices.length > 0) {
      lines.push("    subgraph \"Packages\"");
      for (const s of packageServices.slice(0, 10)) {
        const nodeId = s.id.replace(/-/g, "_");
        lines.push(`        ${nodeId}["${s.name || s.id}"]`);
      }
      if (packageServices.length > 10) {
        lines.push(`        more["+${packageServices.length - 10} more"]`);
      }
      lines.push("    end");
    }

    // Edges from depends_on
    for (const s of system.services) {
      const deps = s.depends_on || [];
      const fromId = s.id.replace(/-/g, "_");
      for (const dep of deps) {
        const toId = dep.replace(/-/g, "_");
        lines.push(`    ${fromId} --> ${toId}`);
      }
    }
    lines.push("```");
    lines.push("\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "A-architecture-vision.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase B: Business Architecture ────────────────────────────────────────────

function generatePhaseBBusiness(system: SystemUsm, features: FeatureUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Business Architecture", "B"));
  lines.push("# Business Architecture (TOGAF Phase B)\n\n");
  lines.push("> Auto-generated from USM features and system.usm.\n\n");

  // Features grouped by service
  lines.push("## Features by Service\n\n");
  const serviceGroups = new Map<string, FeatureUsm[]>();
  for (const f of features) {
    const svc = f.$service || "unknown";
    if (!serviceGroups.has(svc)) serviceGroups.set(svc, []);
    serviceGroups.get(svc)!.push(f);
  }

  for (const [svc, feats] of serviceGroups) {
    lines.push(`### ${svc}\n\n`);
    lines.push("| Feature | Summary | Status | Flows | Contracts |");
    lines.push("|---------|---------|--------|-------|-----------|");
    for (const f of feats) {
      const flowCount = f.flows?.length || 0;
      const contractCount = f.contracts?.length || 0;
      const status = f.status || "—";
      const summary = f.summary.substring(0, 80).replace(/\n/g, " ").trim();
      lines.push(`| ${f.$id} | ${summary} | ${status} | ${flowCount} | ${contractCount} |`);
    }
    lines.push("\n");
  }

  // User Flows summary
  const featuresWithFlows = features.filter(f => f.flows && f.flows.length > 0);
  if (featuresWithFlows.length > 0) {
    lines.push("## User Flows\n\n");
    for (const f of featuresWithFlows) {
      lines.push(`### ${f.$id}\n\n`);
      for (const flow of f.flows!) {
        lines.push(`- **${flow.name}** (${flow.steps.length} steps)`);
        if (flow.description) lines.push(`  — ${flow.description}`);
        lines.push("\n");
      }
    }
  }

  // Actors (services as business actors)
  if (system.services && system.services.length > 0) {
    lines.push("## Actors\n\n");
    lines.push("| Actor | Type |");
    lines.push("|-------|------|");
    const appIds = new Set<string>();
    const sharedIds = new Set<string>();
    for (const s of system.services) {
      const role = appIds.has(s.id)
        ? "Application"
        : sharedIds.has(s.id)
          ? "Shared Service"
          : "Package";
      lines.push(`| ${s.name || s.id} | ${role} |`);
    }
    lines.push("\n");
  }

  // Business capability map (Mermaid)
  if (serviceGroups.size > 0) {
    lines.push("## Business Capability Map\n\n");
    lines.push("```mermaid");
    lines.push("graph TD");
    for (const [svc, feats] of serviceGroups) {
      const svcId = svc.replace(/[-/]/g, "_");
      lines.push(`    subgraph "${svc}"`);
      for (const f of feats.slice(0, 8)) {
        const fId = (f.$id.split("/").pop() || f.$id).replace(/-/g, "_");
        lines.push(`        ${svcId}_${fId}["${f.$id.split("/").pop() || f.$id}"]`);
      }
      if (feats.length > 8) {
        lines.push(`        ${svcId}_more["+${feats.length - 8} more"]`);
      }
      lines.push("    end");
    }
    lines.push("```");
    lines.push("\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "B-business-architecture.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase C1: Data Architecture ──────────────────────────────────────────────

function generatePhaseC1Data(system: SystemUsm, dataFiles: DataUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Data Architecture", "C1"));
  lines.push("# Data Architecture (TOGAF Phase C1)\n\n");
  lines.push("> Auto-generated from USM data files and Prisma schema.\n\n");

  // Data files from USM
  if (dataFiles.length > 0) {
    lines.push("## Data Files\n\n");
    lines.push("| ID | Summary | Type | Runtime | Models |");
    lines.push("|----|---------|------|---------|--------|");
    for (const d of dataFiles) {
      const models = (d.models || []).join(", ") || "—";
      const summary = d.summary.substring(0, 60).replace(/\n/g, " ").trim();
      lines.push(`| ${d.$id} | ${summary} | ${d.type || "—"} | ${d.runtime || "—"} | ${models} |`);
    }
    lines.push("\n");
  }

  // Also collect database-type service files (like models.usm which is $type: service but type: database)
  // Check system.usm data refs
  if (system.data && system.data.length > 0) {
    lines.push("## Data References\n\n");
    lines.push("| ID | Name | Source |");
    lines.push("|----|------|--------|");
    for (const d of system.data) {
      lines.push(`| ${d.id} | ${d.name} | ${d.ref} |`);
    }
    lines.push("\n");
  }

  // Prisma models (from schema file)
  const schemaPath = path.join(root, "packages", "db", "prisma", "schema.prisma");
  if (fs.existsSync(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const modelNames = extractPrismaModelNames(schemaContent);
    if (modelNames.length > 0) {
      lines.push(`## Prisma Data Models (${modelNames.length})\n\n`);
      lines.push(`Source: \`packages/db/prisma/schema.prisma\`\n\n`);
      lines.push("| # | Model |");
      lines.push("|---|-------|");
      for (let i = 0; i < modelNames.length; i++) {
        lines.push(`| ${i + 1} | ${modelNames[i]} |`);
      }
      lines.push("\n");
    }

    // Enums
    const enumNames = extractPrismaEnumNames(schemaContent);
    if (enumNames.length > 0) {
      lines.push("## Prisma Enums\n\n");
      lines.push("| Enum |");
      lines.push("|------|");
      for (const name of enumNames) {
        lines.push(`| ${name} |`);
      }
      lines.push("\n");
    }
  }

  // ER diagram (simplified)
  if (fs.existsSync(schemaPath)) {
    lines.push("## Entity-Relationship Overview\n\n");
    lines.push("> For the full ER diagram, see `.agents-workspace/docs/data/models.md`.\n\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "C1-data-architecture.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase C2: Application Architecture ──────────────────────────────────────

function generatePhaseC2Application(system: SystemUsm, services: ServiceUsm[], features: FeatureUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Application Architecture", "C2"));
  lines.push("# Application Architecture (TOGAF Phase C2)\n\n");
  lines.push("> Auto-generated from USM service and feature files.\n\n");

  // Application service map
  lines.push("## Application Service Map\n\n");
  lines.push("```mermaid");
  lines.push("graph TD");

  const appServices = services.filter(s => {
    return s.type === "web-app" || s.paths?.some(p => p.startsWith("apps/"));
  });
  const sharedServices = services.filter(s => {
    return ["idp", "llm-gateway", "agent-flows", "database"].includes(s.type);
  });

  if (appServices.length > 0) {
    lines.push("    subgraph \"Application Services\"");
    for (const s of appServices) {
      const id = (s.$id.split("/").pop() || s.$id).replace(/-/g, "_");
      const portStr = s.port ? ` :${s.port}` : "";
      lines.push(`        ${id}["${s.name || s.$id.split("/").pop()}${portStr}"]`);
    }
    lines.push("    end");
  }

  if (sharedServices.length > 0) {
    lines.push("    subgraph \"Shared Services\"");
    for (const s of sharedServices) {
      const id = (s.$id.split("/").pop() || s.$id).replace(/-/g, "_");
      if (s.type === "database") {
        lines.push(`        ${id}[("${s.name || s.$id.split("/").pop()}")]`);
      } else {
        lines.push(`        ${id}["${s.name || s.$id.split("/").pop()}"]`);
      }
    }
    lines.push("    end");
  }

  // Edges from depends_on
  for (const s of services) {
    const deps = s.depends_on || [];
    const fromId = (s.$id.split("/").pop() || s.$id).replace(/-/g, "_");
    for (const dep of deps) {
      const toId = dep.replace(/-/g, "_");
      lines.push(`    ${fromId} --> ${toId}`);
    }
  }

  lines.push("```");
  lines.push("\n");

  // Per-service breakdown
  lines.push("## Per-Service Breakdown\n\n");
  for (const s of services) {
    const slug = s.$id.split("/").pop() || s.$id;
    lines.push(`### ${s.name || slug}\n\n`);
    lines.push(`- **Type**: ${s.type}`);
    lines.push(`- **Runtime**: ${s.runtime}`);
    if (s.port) lines.push(`- **Port**: ${s.port}`);
    if (s.depends_on && s.depends_on.length > 0) {
      lines.push(`- **Depends on**: ${s.depends_on.join(", ")}`);
    }
    const svcFeatures = features.filter(f => {
      const svcSlug = f.$service.split("/").pop() || "";
      return f.$service === s.$id || svcSlug === slug;
    });
    if (svcFeatures.length > 0) {
      lines.push(`- **Features** (${svcFeatures.length}): ${svcFeatures.map(f => f.$id.split("/").pop()).join(", ")}`);
    }
    lines.push("");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "C2-application-architecture.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase D: Technology Architecture ──────────────────────────────────────────

function generatePhaseDTechnology(system: SystemUsm, services: ServiceUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Technology Architecture", "D"));
  lines.push("# Technology Architecture (TOGAF Phase D)\n\n");
  lines.push("> Auto-generated from USM service infrastructure and system.usm.\n\n");

  // System-level infrastructure
  if (system.infrastructure) {
    lines.push("## System Infrastructure\n\n");
    lines.push("| Field | Value |");
    lines.push("|------|-------|");
    lines.push(`| Cloud | ${system.infrastructure.cloud || "—"} |`);
    lines.push(`| Region | ${system.infrastructure.region || "—"} |`);
    lines.push(`| Terraform | ${system.infrastructure.terraform_ref || "—"} |`);
    lines.push(`| DNS | ${system.infrastructure.dns || "—"} |`);
    lines.push(`| SSL | ${system.infrastructure.ssl || "—"} |`);
    lines.push("");
  }

  // Deployment environments
  if (system.deployment && system.deployment.environments) {
    lines.push("## Deployment Environments\n\n");
    lines.push("| Name | URL | Type | Notes |");
    lines.push("|------|-----|------|-------|");
    for (const env of system.deployment.environments) {
      lines.push(`| ${env.name} | ${env.url || "—"} | ${env.type || "—"} | ${env.notes || "—"} |`);
    }
    lines.push("\n");
  }

  // Operations
  if (system.operations) {
    lines.push("## Operations\n\n");
    lines.push("| Field | Value |");
    lines.push("|------|-------|");
    if (system.operations.monitoring) lines.push(`| Monitoring | ${system.operations.monitoring} |`);
    if (system.operations.alerts) lines.push(`| Alerts | ${system.operations.alerts} |`);
    if (system.operations.on_call) lines.push(`| On-Call | ${system.operations.on_call} |`);
    lines.push("");
  }

  // Per-service infrastructure
  const servicesWithInfra = services.filter(s => s.infrastructure);
  if (servicesWithInfra.length > 0) {
    lines.push("## Per-Service Infrastructure\n\n");
    for (const s of servicesWithInfra) {
      const slug = s.$id.split("/").pop() || s.$id;
      lines.push(`### ${s.name || slug}\n\n`);
      const infra = s.infrastructure!;

      lines.push("| Property | Value |");
      lines.push("|----------|-------|");
      lines.push(`| Provider | ${infra.provider || "—"} |`);
      if (infra.region) lines.push(`| Region | ${infra.region} |`);

      if (infra.compute) {
        lines.push(`| Compute Type | ${infra.compute.type || "—"} |`);
        if (infra.compute.cpu) lines.push(`| CPU | ${infra.compute.cpu} units |`);
        if (infra.compute.memory_mb) lines.push(`| Memory | ${infra.compute.memory_mb} MB |`);
        if (infra.compute.desired_count) lines.push(`| Desired Count | ${infra.compute.desired_count} |`);
      }
      if (infra.networking) {
        if (infra.networking.port) lines.push(`| Port | ${infra.networking.port} |`);
        if (infra.networking.protocol) lines.push(`| Protocol | ${infra.networking.protocol} |`);
        if (infra.networking.tls_termination) lines.push(`| TLS Termination | ${infra.networking.tls_termination} |`);
        if (infra.networking.hostnames) lines.push(`| Hostnames | ${infra.networking.hostnames.join(", ")} |`);
      }
      if (infra.cost?.monthly_estimate_usd !== undefined) {
        lines.push(`| Monthly Cost | $${infra.cost.monthly_estimate_usd.toFixed(2)} |`);
      }
      lines.push("");
    }
  } else {
    lines.push("## Per-Service Infrastructure\n\n");
    lines.push("No services have `infrastructure` data yet. Run `usm scan infrastructure` to populate.\n\n");
  }

  // Technology stack diagram
  lines.push("## Technology Stack Overview\n\n");
  lines.push("```mermaid");
  lines.push("graph TD");
  const providerGroups = new Map<string, string[]>();
  for (const s of servicesWithInfra) {
    const provider = s.infrastructure!.provider || "unknown";
    const slug = s.name || s.$id.split("/").pop() || s.$id;
    if (!providerGroups.has(provider)) providerGroups.set(provider, []);
    providerGroups.get(provider)!.push(slug);
  }
  for (const s of services) {
    if (!s.infrastructure) {
      if (!providerGroups.has("local")) providerGroups.set("local", []);
      providerGroups.get("local")!.push(s.name || s.$id.split("/").pop() || s.$id);
    }
  }
  for (const [provider, svcNames] of providerGroups) {
    const pId = provider.replace(/-/g, "_");
    lines.push(`    subgraph "${provider}"`);
    for (const name of svcNames.slice(0, 6)) {
      const sId = name.replace(/[^a-zA-Z0-9]/g, "_");
      lines.push(`        ${pId}_${sId}["${name}"]`);
    }
    if (svcNames.length > 6) {
      lines.push(`        ${pId}_more["+${svcNames.length - 6} more"]`);
    }
    lines.push("    end");
  }
  lines.push("```");
  lines.push("\n");

  const content = lines.join("");
  const filePath = writeDoc(root, "D-technology-architecture.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase E: Opportunities & Solutions ──────────────────────────────────────

function generatePhaseESolutions(system: SystemUsm, root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Opportunities & Solutions", "E"));
  lines.push("# Opportunities & Solutions (TOGAF Phase E)\n\n");
  lines.push("> Auto-generated from USM roadmap and principles.\n\n");

  // Roadmap
  if (system.roadmap && system.roadmap.length > 0) {
    lines.push("## Roadmap\n\n");
    for (const r of system.roadmap) {
      lines.push(`### ${r.title}\n\n`);
      lines.push(`- **ID**: ${r.id}`);
      lines.push(`- **Status**: ${r.status || "—"}`);
      lines.push(`- **Description**: ${r.description}`);
      if (r.target_date) lines.push(`- **Target Date**: ${r.target_date}`);
      lines.push("\n");
    }
  }

  // Principles as architecture decisions
  if (system.principles && system.principles.length > 0) {
    lines.push("## Architecture Decisions (from Principles)\n\n");
    for (const p of system.principles) {
      lines.push(`- **${p.name}**: ${p.statement}`);
    }
    lines.push("\n");
  }

  // Opportunities alignment diagram
  if (system.roadmap && system.roadmap.length > 0) {
    lines.push("## Roadmap Timeline\n\n");
    lines.push("```mermaid");
    lines.push("graph LR");
    for (let i = 0; i < system.roadmap.length; i++) {
      const r = system.roadmap[i];
      const rId = r.id.replace(/-/g, "_");
      lines.push(`    ${rId}["${r.title}<br/>${r.status || "—"}"]`);
      if (i > 0) {
        const prevId = system.roadmap[i - 1].id.replace(/-/g, "_");
        lines.push(`    ${prevId} --> ${rId}`);
      }
    }
    lines.push("```");
    lines.push("\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "E-opportunities-and-solutions.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase G: Implementation Governance ──────────────────────────────────────────

function generatePhaseGGovernance(system: SystemUsm, features: FeatureUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Implementation Governance", "G"));
  lines.push("# Implementation Governance (TOGAF Phase G)\n\n");
  lines.push("> Auto-generated from USM feature contracts and system risks.\n\n");

  // Contracts from features
  type ContractWithSource = Contract & { _featureId: string };
  const allContracts: ContractWithSource[] = [];
  for (const f of features) {
    if (f.contracts) {
      for (const c of f.contracts) {
        allContracts.push({ ...c, _featureId: f.$id });
      }
    }
  }

  if (allContracts.length > 0) {
    lines.push(`## Feature Contracts (${allContracts.length})\n\n`);
    lines.push("| Feature | Contract ID | Description | Applies After | Must Have |");
    lines.push("|---------|-------------|-------------|---------------|-----------|");
    for (const c of allContracts) {
      const appliesAfter = (c.applies_after || []).join(", ") || "—";
      const mustHave = (c.must_have || []).map(m => typeof m === "string" ? m : JSON.stringify(m)).join("; ") || "—";
      lines.push(`| ${c._featureId} | ${c.id} | ${c.description} | ${appliesAfter} | ${mustHave} |`);
    }
    lines.push("\n");
  } else {
    lines.push("## Feature Contracts\n\n");
    lines.push("No contracts defined in feature files yet.\n\n");
  }

  // Risks from system.usm
  if (system.risks && system.risks.length > 0) {
    lines.push("## System Risks\n\n");
    lines.push("| ID | Title | Severity | Status | Mitigation |");
    lines.push("|----|-------|----------|--------|------------|");
    for (const r of system.risks) {
      lines.push(`| ${r.id} | ${r.title} | ${r.severity || "—"} | ${r.status || "—"} | ${r.mitigation || "—"} |`);
    }
    lines.push("\n");
  }

  // Risk severity summary
  if (system.risks && system.risks.length > 0) {
    const bySeverity = new Map<string, number>();
    for (const r of system.risks) {
      const sev = r.severity || "unspecified";
      bySeverity.set(sev, (bySeverity.get(sev) || 0) + 1);
    }
    lines.push("### Risk Summary\n\n");
    lines.push("| Severity | Count |");
    lines.push("|----------|-------|");
    for (const [sev, count] of bySeverity) {
      lines.push(`| ${sev} | ${count} |`);
    }
    lines.push("\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "G-implementation-governance.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Phase H: Architecture Change Management ─────────────────────────────────────

function generatePhaseHChange(system: SystemUsm, services: ServiceUsm[], features: FeatureUsm[], root: string): GenerationResult {
  const lines: string[] = [];
  lines.push(frontmatter("Architecture Change Management", "H"));
  lines.push("# Architecture Change Management (TOGAF Phase H)\n\n");
  lines.push("> Auto-generated from USM decisions, risks, and future items.\n\n");

  // Decisions from features and services
  type DecisionWithSource = Decision & { _source: string };
  const allDecisions: DecisionWithSource[] = [];
  for (const f of features) {
    if (f.decisions) {
      for (const d of f.decisions) {
        allDecisions.push({ ...d, _source: f.$id });
      }
    }
  }
  for (const s of services) {
    if (s.decisions) {
      for (const d of s.decisions) {
        allDecisions.push({ ...d, _source: s.$id });
      }
    }
  }

  if (allDecisions.length > 0) {
    lines.push(`## Architecture Decisions (${allDecisions.length})\n\n`);
    lines.push("| ID | Decision | Status | Source |");
    lines.push("|----|----------|--------|--------|");
    for (const d of allDecisions) {
      lines.push(`| ${d.id} | ${d.decision} | ${d.status || "—"} | ${d._source} |`);
    }
    lines.push("\n");
  } else {
    lines.push("## Architecture Decisions\n\n");
    lines.push("No decisions recorded in feature or service files.\n\n");
  }

  // Risks from system.usm
  if (system.risks && system.risks.length > 0) {
    lines.push("## System Risks\n\n");
    lines.push("| ID | Title | Severity | Status | Mitigation |");
    lines.push("|----|-------|----------|--------|------------|");
    for (const r of system.risks) {
      lines.push(`| ${r.id} | ${r.title} | ${r.severity || "—"} | ${r.status || "—"} | ${r.mitigation || "—"} |`);
    }
    lines.push("\n");
  }

  // Future items from services
  const allFutureItems: Array<{ item: string; source: string }> = [];
  for (const s of services) {
    if (s.future) {
      for (const item of s.future) {
        allFutureItems.push({ item, source: s.$id });
      }
    }
  }

  if (allFutureItems.length > 0) {
    lines.push(`## Future Items (${allFutureItems.length})\n\n`);
    lines.push("| Item | Source |");
    lines.push("|------|--------|");
    for (const f of allFutureItems) {
      lines.push(`| ${f.item} | ${f.source} |`);
    }
    lines.push("\n");
  }

  // Principles as change drivers
  if (system.principles && system.principles.length > 0) {
    lines.push("## Change Governance Principles\n\n");
    for (const p of system.principles) {
      lines.push(`- **${p.name}**: ${p.statement}`);
    }
    lines.push("\n");
  }

  const content = lines.join("");
  const filePath = writeDoc(root, "H-architecture-change-management.md", content);
  return { outputs: [{ path: filePath, content }] };
}

// ─── Prisma Helpers ────────────────────────────────────────────────────────────

function extractPrismaModelNames(content: string): string[] {
  const modelRegex = /^model\s+(\w+)\s*\{/gm;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function extractPrismaEnumNames(content: string): string[] {
  const enumRegex = /^enum\s+(\w+)\s*\{/gm;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = enumRegex.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}
