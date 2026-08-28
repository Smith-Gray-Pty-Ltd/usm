// Technical Design Document generator — renders a 13-section detailed design
// document from .usm specs. The universal "how is this system designed
// end-to-end" reading path. Each section is its own page, rendered only when
// data exists. Adapts to any project type (CLI tool, SaaS platform, library,
// monorepo).
//
// See: .usm/features/generators/technical-design.usm

import path from "node:path";
import fs from "node:fs";
import type {
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  GenerationResult,
  Risk,
  RoadmapItem,
  Principle,
  Decision,
} from "../types.js";
import { findAllUsmFiles, parseUsmFile } from "../parse.js";
import { escapeProse } from "./markdown.js";
import {
  renderContentBlocks,
  type ContentBlock,
} from "./contentBlocks.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** New system.usm fields (schema additions pending). */
interface SystemDesignFields {
  stakeholders?: Array<{ name: string; role: string; contact?: string }>;
  assumptions?: string[];
  non_functional?: {
    performance?: { target: string; description?: string };
    scalability?: { target: string; description?: string };
    security?: { target: string; description?: string };
    reliability?: { target: string; description?: string };
    maintainability?: { target: string; description?: string };
  };
  testing_strategy?: {
    performance_testing?: string;
    security_testing?: string;
    automated_testing?: string;
    ci_integration?: string;
  };
  error_tracking?: { tool: string; config_ref?: string; dsn?: string };
  backup_recovery?: {
    backup_strategy?: string;
    disaster_recovery?: string;
    rto_minutes?: number;
    rpo_minutes?: number;
  };
  security_stack?: {
    first_line?: string;
    last_line?: string;
    notes?: string;
  };
  design_pages?: Array<{
    id: string;
    title?: string;
    audience?: string;
    content?: ContentBlock[];
    source?: string;
  }>;
}

type SystemWithDesign = SystemUsm & SystemDesignFields;

// ─── Helpers ────────────────────────────────────────────────────────────────

function writeDoc(root: string, relativePath: string, content: string): string {
  const fullPath = path.join(root, ".usm-workspace", "docs", "design", relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

function frontmatter(title: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `---\ntitle: "${title}"\ngenerated: ${date}\n---\n\n`;
}

/** Escape table cell — angle brackets and pipes. */
function esc(text: string | undefined | null): string {
  return (text || "—").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Section renderers ───────────────────────────────────────────────────────

/**
 * Section 1: Project Overview
 * Data: system.identity, system.summary, system.roles, system.stakeholders,
 *       system.assumptions, system.index (use-cases)
 */
function renderProjectOverview(
  system: SystemWithDesign,
  features: FeatureUsm[],
): string | null {
  const hasIdentity = !!system.identity;
  const hasSummary = !!system.summary;
  const hasRoles = system.roles && system.roles.length > 0;
  const hasStakeholders = system.stakeholders && system.stakeholders.length > 0;
  const hasAssumptions = system.assumptions && system.assumptions.length > 0;
  const hasIndex = system.index && system.index.length > 0;

  if (!hasIdentity && !hasSummary && !hasRoles && !hasStakeholders && !hasAssumptions && !hasIndex) {
    return null;
  }

  const lines: string[] = [];
  lines.push(frontmatter("Project Overview"));
  lines.push("# Project Overview\n");

  // Project Name
  if (system.identity?.name) {
    lines.push(`**Project Name**: ${escapeProse(system.identity.name)}\n`);
  }
  if (system.identity?.domain) {
    lines.push(`**Domain**: ${escapeProse(system.identity.domain)}\n`);
  }
  if (system.identity?.repository) {
    lines.push(`**Repository**: ${escapeProse(system.identity.repository)}\n`);
  }

  // Project Description
  if (system.summary) {
    lines.push("## Project Description\n");
    lines.push(escapeProse(system.summary) + "\n");
  }

  // Stakeholders
  if (hasStakeholders) {
    lines.push("## Stakeholders\n");
    lines.push("| Name | Role | Contact |");
    lines.push("|------|------|---------|");
    for (const s of system.stakeholders!) {
      lines.push(`| ${esc(s.name)} | ${esc(s.role)} | ${esc(s.contact || "—")} |`);
    }
    lines.push("");
  } else if (hasRoles) {
    // Fallback: use system.roles as stakeholders
    lines.push("## Stakeholders\n");
    lines.push("| Name | Description | Needs |");
    lines.push("|------|-------------|-------|");
    for (const r of system.roles!) {
      const needs = (r.needs || []).map(escapeProse).join("; ");
      lines.push(`| ${esc(r.name)} | ${esc(r.description || "—")} | ${esc(needs)} |`);
    }
    lines.push("");
  }

  // Assumptions
  if (hasAssumptions) {
    lines.push("## Assumptions\n");
    for (const a of system.assumptions!) {
      lines.push(`- ${escapeProse(a)}`);
    }
    lines.push("");
  }

  // Use-cases (core features from index)
  if (hasIndex) {
    lines.push("## Use-cases\n");
    lines.push("Core features and capabilities of the system:\n");
    lines.push("| Feature | Name | Status |");
    lines.push("|---------|------|--------|");
    for (const f of system.index!) {
      lines.push(`| ${esc(f.id)} | ${esc(f.name || f.id)} | ${esc(f.status || "—")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 2: Requirements
 * Data: features (functional), system.non_functional (NFRs)
 */
function renderRequirements(
  system: SystemWithDesign,
  features: FeatureUsm[],
): string | null {
  const hasFeatures = features.length > 0;
  const hasNfrs = !!system.non_functional;

  if (!hasFeatures && !hasNfrs) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Requirements"));
  lines.push("# Requirements\n");

  // Functional Requirements
  if (hasFeatures) {
    lines.push("## Functional Requirements\n");
    lines.push("| Feature | Summary | Intent | Status |");
    lines.push("|---------|---------|--------|--------|");
    for (const f of features) {
      const summary = (f.summary || "").substring(0, 80);
      const intent = (f.intent || "").substring(0, 80);
      lines.push(`| ${esc(f.$id)} | ${esc(summary)} | ${esc(intent)} | ${esc(f.status || "—")} |`);
    }
    lines.push("");
  }

  // Non-Functional Requirements
  if (hasNfrs) {
    const nfr = system.non_functional!;
    lines.push("## Non-Functional Requirements\n");

    const nfrCategories: Array<{ key: string; label: string; val?: { target: string; description?: string } }> = [
      { key: "performance", label: "Performance", val: nfr.performance },
      { key: "scalability", label: "Scalability", val: nfr.scalability },
      { key: "security", label: "Security", val: nfr.security },
      { key: "reliability", label: "Reliability", val: nfr.reliability },
      { key: "maintainability", label: "Maintainability", val: nfr.maintainability },
    ];

    const hasAnyNfr = nfrCategories.some((c) => c.val);
    if (hasAnyNfr) {
      lines.push("| Category | Target | Description |");
      lines.push("|----------|--------|-------------|");
      for (const cat of nfrCategories) {
        if (cat.val) {
          lines.push(`| ${cat.label} | ${esc(cat.val.target)} | ${esc(cat.val.description || "—")} |`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Section 3: System Architecture
 * Data: system.services, service.tech_stack, system.apis, Mermaid diagram
 */
function renderSystemArchitecture(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasServices = services.length > 0;
  const hasApis = system.apis && system.apis.length > 0;

  if (!hasServices && !hasApis) return null;

  const lines: string[] = [];
  lines.push(frontmatter("System Architecture"));
  lines.push("# System Architecture\n");

  // High-Level Diagram
  if (hasServices) {
    lines.push("## High-Level Diagram\n");
    lines.push("```mermaid");
    lines.push("graph TB");
    for (const s of services) {
      const slug = s.$id.split("/").pop() || s.$id;
      const label = s.name || slug;
      lines.push(`    ${slug.replace(/[-/]/g, "_")}["${label.replace(/"/g, "'")}"]`);
    }
    // Dependencies
    for (const s of services) {
      const slug = s.$id.split("/").pop() || s.$id;
      const nodeId = slug.replace(/[-/]/g, "_");
      if (s.depends_on) {
        for (const dep of s.depends_on) {
          const depSlug = dep.split("/").pop() || dep;
          const depId = depSlug.replace(/[-/]/g, "_");
          lines.push(`    ${nodeId} --> ${depId}`);
        }
      }
    }
    lines.push("```\n");
  }

  // Technology Stack
  if (hasServices) {
    lines.push("## Technology Stack\n");
    lines.push("| Service | Type | Runtime | Tech Stack |");
    lines.push("|---------|------|---------|------------|");
    for (const s of services) {
      const stack = s.tech_stack
        ? Object.entries(s.tech_stack).map(([k, v]) => `${k}: ${v}`).join(", ")
        : "—";
      lines.push(`| ${esc(s.name || s.$id)} | ${esc(s.type || "—")} | ${esc(s.runtime || "—")} | ${esc(stack)} |`);
    }
    lines.push("");
  }

  // System Components
  if (hasServices) {
    lines.push("## System Components\n");
    for (const s of services) {
      const slug = s.$id.split("/").pop() || s.$id;
      lines.push(`### ${escapeProse(s.name || slug)}\n`);
      lines.push(`- **Type**: ${escapeProse(s.type || "—")}`);
      lines.push(`- **Runtime**: ${escapeProse(s.runtime || "—")}`);
      if (s.port) lines.push(`- **Port**: ${s.port}`);
      if (s.summary) lines.push(`- **Summary**: ${escapeProse(s.summary)}`);
      if (s.depends_on && s.depends_on.length > 0) {
        lines.push(`- **Depends on**: ${escapeProse(s.depends_on.join(", "))}`);
      }
      lines.push("");
    }
  }

  // Third-party services
  if (hasApis) {
    lines.push("## Third-Party Services\n");
    lines.push("| ID | Name | Reference |");
    lines.push("|----|------|-----------|");
    for (const a of system.apis!) {
      lines.push(`| ${esc(a.id)} | ${esc(a.name || "—")} | ${esc(a.ref || "—")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 4: Module Design
 * Data: service.modules[], features matched via implementation.primary
 */
function renderModuleDesign(
  services: ServiceUsm[],
  features: FeatureUsm[],
): string | null {
  const hasModules = services.some((s) => s.modules && s.modules.length > 0);
  if (!hasModules) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Module Design"));
  lines.push("# Module Design\n");

  for (const s of services) {
    if (!s.modules || s.modules.length === 0) continue;
    const svcSlug = s.$id.split("/").pop() || s.$id;
    lines.push(`## ${escapeProse(s.name || svcSlug)}\n`);

    for (const m of s.modules) {
      lines.push(`### ${escapeProse(m.name)}\n`);

      if (m.purpose) {
        lines.push(`**Purpose**: ${escapeProse(m.purpose)}\n`);
      }
      if (m.paths && m.paths.length > 0) {
        lines.push(`**Paths**: ${escapeProse(m.paths.join(", "))}\n`);
      }

      // Match features to this module via implementation.primary
      const moduleFeatures = features.filter((f) => {
        const impl = (f as FeatureUsm & { implementation?: { primary?: string } }).implementation;
        return impl?.primary && m.name && impl.primary.includes(m.name);
      });
      if (moduleFeatures.length > 0) {
        lines.push("**Related features**:\n");
        for (const f of moduleFeatures) {
          lines.push(`- ${escapeProse(f.$id)} — ${escapeProse((f.summary || "").substring(0, 80))}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Section 5: Database Design
 * Data: data .usm files, system.data, ER diagram
 */
function renderDatabaseDesign(
  dataFiles: DataUsm[],
  system: SystemWithDesign,
): string | null {
  const hasDataFiles = dataFiles.length > 0;
  const hasSystemData = system.data && system.data.length > 0;
  if (!hasDataFiles && !hasSystemData) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Database Design"));
  lines.push("# Database Design\n");

  // ER Diagram
  if (hasDataFiles) {
    lines.push("## ER Diagram\n");
    lines.push("```mermaid");
    lines.push("erDiagram");
    for (const d of dataFiles) {
      if (d.models) {
        for (const model of d.models) {
          lines.push(`    ${model.replace(/[^a-zA-Z0-9_]/g, "_")} {`);
          lines.push(`        string id`);
          lines.push(`    }`);
        }
      }
    }
    lines.push("```\n");
  }

  // Schema Design
  if (hasDataFiles) {
    lines.push("## Schema Design\n");
    for (const d of dataFiles) {
      const slug = d.$id.split("/").pop() || d.$id;
      lines.push(`### ${escapeProse(slug)}\n`);
      lines.push(`- **Runtime**: ${escapeProse(d.runtime || "—")}`);
      lines.push(`- **Type**: ${escapeProse(d.type || "—")}`);
      if (d.models && d.models.length > 0) {
        lines.push(`- **Models**: ${escapeProse(d.models.join(", "))}`);
      }
      if (d.summary) {
        lines.push(`\n${escapeProse(d.summary)}\n`);
      }
      lines.push("");
    }
  }

  // Data references from system
  if (hasSystemData) {
    lines.push("## Data References\n");
    lines.push("| ID | Name | Reference |");
    lines.push("|----|------|-----------|");
    for (const d of system.data!) {
      lines.push(`| ${esc(d.id)} | ${esc(d.name || "—")} | ${esc(d.ref || "—")} |`);
    }
    lines.push("");
  }

  // Indexes (from data files if available)
  if (hasDataFiles) {
    const hasIndexes = dataFiles.some(
      (d) => (d as DataUsm & { indexes?: unknown[] }).indexes,
    );
    if (hasIndexes) {
      lines.push("## Indexes\n");
      for (const d of dataFiles) {
        const indexes = (d as DataUsm & { indexes?: Array<{ name: string; fields: string[]; purpose?: string }> }).indexes;
        if (indexes && indexes.length > 0) {
          lines.push(`### ${escapeProse(d.$id.split("/").pop() || d.$id)}\n`);
          lines.push("| Name | Fields | Purpose |");
          lines.push("|------|--------|---------|");
          for (const idx of indexes) {
            lines.push(`| ${esc(idx.name)} | ${esc(idx.fields.join(", "))} | ${esc(idx.purpose || "—")} |`);
          }
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Section 6: API Design
 * Data: feature.routes[], system.auth_schemes, service.rbac, service.security
 */
function renderApiDesign(
  features: FeatureUsm[],
  services: ServiceUsm[],
  system: SystemWithDesign,
): string | null {
  const hasRoutes = features.some((f) => f.routes && f.routes.length > 0);
  const hasAuthSchemes = system.auth_schemes && system.auth_schemes.length > 0;
  const hasRbac = services.some((s) => s.rbac);
  const hasSecurity = services.some((s) => s.security);

  if (!hasRoutes && !hasAuthSchemes && !hasRbac && !hasSecurity) return null;

  const lines: string[] = [];
  lines.push(frontmatter("API Design"));
  lines.push("# API Design\n");

  // Endpoints
  if (hasRoutes) {
    lines.push("## Endpoints\n");
    lines.push("| Method | Path | Auth | Service | Feature |");
    lines.push("|--------|------|------|---------|---------|");
    for (const f of features) {
      if (!f.routes) continue;
      const featSlug = f.$id.split("/").pop() || f.$id;
      for (const r of f.routes) {
        const method = (r as { method?: string }).method || "—";
        const routePath = (r as { path?: string }).path || (r as { url?: string }).url || "—";
        const auth = (r as { auth?: string }).auth || "—";
        lines.push(`| ${esc(method)} | ${esc(routePath)} | ${esc(auth)} | ${esc(f.$service || "—")} | ${esc(featSlug)} |`);
      }
    }
    lines.push("");
  }

  // Authentication
  if (hasAuthSchemes) {
    lines.push("## Authentication\n");
    lines.push("| Scheme ID | Type | Description |");
    lines.push("|-----------|------|-------------|");
    for (const a of system.auth_schemes!) {
      const type = (a as { type?: string }).type || "—";
      const desc = (a as { description?: string }).description || "—";
      lines.push(`| ${esc(a.id)} | ${esc(type)} | ${esc(desc)} |`);
    }
    lines.push("");
  }

  // Authorization (RBAC)
  if (hasRbac) {
    lines.push("## Authorization\n");
    for (const s of services) {
      if (!s.rbac) continue;
      const slug = s.$id.split("/").pop() || s.$id;
      lines.push(`### ${escapeProse(s.name || slug)}\n`);
      if (s.rbac.description) {
        lines.push(`${escapeProse(s.rbac.description)}\n`);
      }
      if (s.rbac.roles && s.rbac.roles.length > 0) {
        lines.push("| Role | Level | Helper |");
        lines.push("|------|-------|--------|");
        for (const role of s.rbac.roles) {
          lines.push(`| ${esc(role.name)} | ${esc(role.level || "—")} | ${esc(role.helper || "—")} |`);
        }
        lines.push("");
      }
    }
  }

  // Rate Limiting & Error Handling
  if (hasSecurity) {
    lines.push("## Service Security Configuration\n");
    lines.push("| Service | Auth Method | Secrets Reference |");
    lines.push("|---------|-------------|-------------------|");
    for (const s of services) {
      if (!s.security) continue;
      lines.push(`| ${esc(s.name || s.$id)} | ${esc(s.security.auth_method || "—")} | ${esc(s.security.secrets_ref || "—")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 7: Security Design
 * Data: system.auth_schemes, service.rbac, service.security, service.infrastructure,
 *       system.risks (high/critical), system.security_stack
 */
function renderSecurityDesign(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasAuth = system.auth_schemes && system.auth_schemes.length > 0;
  const hasRbac = services.some((s) => s.rbac);
  const hasInfra = services.some((s) => s.infrastructure);
  const hasRisks = system.risks && system.risks.length > 0;
  const hasSecurityStack = !!system.security_stack;

  if (!hasAuth && !hasRbac && !hasInfra && !hasRisks && !hasSecurityStack) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Security Design"));
  lines.push("# Security Design\n");

  // Authentication / Authorization
  if (hasAuth) {
    lines.push("## Authentication / Authorization\n");
    lines.push("| Scheme | Type | Description |");
    lines.push("|--------|------|-------------|");
    for (const a of system.auth_schemes!) {
      const type = (a as { type?: string }).type || "—";
      const desc = (a as { description?: string }).description || "—";
      lines.push(`| ${esc(a.id)} | ${esc(type)} | ${esc(desc)} |`);
    }
    lines.push("");
  }

  // Data Encryption
  if (hasInfra) {
    const hasTls = services.some((s) => s.infrastructure?.networking?.tls_termination);
    const hasSecrets = services.some((s) => s.infrastructure?.secrets && s.infrastructure.secrets.length > 0);
    if (hasTls || hasSecrets) {
      lines.push("## Data Encryption\n");
      lines.push("| Service | TLS Termination | Secrets Manager |");
      lines.push("|---------|-----------------|-----------------|");
      for (const s of services) {
        if (!s.infrastructure) continue;
        const tls = s.infrastructure.networking?.tls_termination || "—";
        const secrets = (s.infrastructure.secrets || []).map((sec) => sec.source).join(", ") || "—";
        lines.push(`| ${esc(s.name || s.$id)} | ${esc(tls)} | ${esc(secrets)} |`);
      }
      lines.push("");
    }
  }

  // Security Auditing
  if (system.operations) {
    lines.push("## Security Auditing\n");
    lines.push(`- **Monitoring**: ${escapeProse(system.operations.monitoring || "—")}`);
    lines.push(`- **Alerts**: ${escapeProse(system.operations.alerts || "—")}`);
    lines.push(`- **On-call**: ${escapeProse(system.operations.on_call || "—")}`);
    lines.push("");
  }

  // Vulnerabilities (risks with high/critical severity)
  if (hasRisks) {
    const vulns = system.risks!.filter(
      (r) => r.severity === "high" || r.severity === "critical",
    );
    if (vulns.length > 0) {
      lines.push("## Vulnerabilities\n");
      lines.push("| ID | Title | Severity | Mitigation |");
      lines.push("|----|-------|----------|------------|");
      for (const v of vulns) {
        lines.push(`| ${esc(v.id)} | ${esc(v.title)} | ${esc(v.severity)} | ${esc(v.mitigation || "—")} |`);
      }
      lines.push("");
    }
  }

  // Security Stack
  if (hasSecurityStack) {
    lines.push("## Security Stack\n");
    const ss = system.security_stack!;
    if (ss.first_line) lines.push(`- **First line of defense**: ${escapeProse(ss.first_line)}`);
    if (ss.last_line) lines.push(`- **Last line of defense**: ${escapeProse(ss.last_line)}`);
    if (ss.notes) lines.push(`- **Notes**: ${escapeProse(ss.notes)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 8: Deployment Architecture
 * Data: system.infrastructure, system.deployment, service.infrastructure,
 *       system.operations, service.infrastructure.monitoring
 */
function renderDeploymentArchitecture(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasInfra = !!system.infrastructure;
  const hasDeployment = !!system.deployment;
  const hasServiceInfra = services.some((s) => s.infrastructure);
  const hasOperations = !!system.operations;

  if (!hasInfra && !hasDeployment && !hasServiceInfra && !hasOperations) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Deployment Architecture"));
  lines.push("# Deployment Architecture\n");

  // Deployment Diagram
  if (hasInfra || hasServiceInfra) {
    lines.push("## Deployment Diagram\n");
    lines.push("```mermaid");
    lines.push("graph TB");
    if (hasInfra) {
      lines.push(`    cloud["${escapeProse(system.infrastructure!.cloud || "Cloud")}"]`);
    }
    for (const s of services) {
      if (!s.infrastructure) continue;
      const slug = s.$id.split("/").pop() || s.$id;
      const nodeId = slug.replace(/[-/]/g, "_");
      lines.push(`    ${nodeId}["${escapeProse(s.name || slug)}"]`);
      if (hasInfra) {
        lines.push(`    cloud --> ${nodeId}`);
      }
    }
    lines.push("```\n");
  }

  // Environment Setup
  if (hasDeployment && system.deployment!.environments) {
    lines.push("## Environment Setup\n");
    lines.push("| Name | URL | Type | Notes |");
    lines.push("|------|-----|------|-------|");
    for (const env of system.deployment!.environments) {
      lines.push(`| ${esc(env.name)} | ${esc(env.url || "—")} | ${esc(env.type || "—")} | ${esc(env.notes || "—")} |`);
    }
    lines.push("");
  }

  // Scaling Strategy
  if (hasServiceInfra) {
    const hasScaling = services.some((s) => s.infrastructure?.scaling);
    if (hasScaling) {
      lines.push("## Scaling Strategy\n");
      lines.push("| Service | Min | Max | Target CPU % |");
      lines.push("|---------|-----|-----|-------------|");
      for (const s of services) {
        if (!s.infrastructure?.scaling) continue;
        const sc = s.infrastructure.scaling;
        lines.push(`| ${esc(s.name || s.$id)} | ${sc.min ?? "—"} | ${sc.max ?? "—"} | ${sc.target_cpu_percent ?? "—"} |`);
      }
      lines.push("");
    }
  }

  // Monitoring Stack
  if (hasOperations || hasServiceInfra) {
    const hasMonitoring = services.some((s) => s.infrastructure?.monitoring);
    if (system.operations || hasMonitoring) {
      lines.push("## Monitoring Stack\n");
      if (system.operations) {
        lines.push(`- **Monitoring**: ${escapeProse(system.operations.monitoring || "—")}`);
        lines.push(`- **Alerts**: ${escapeProse(system.operations.alerts || "—")}`);
      }
      for (const s of services) {
        if (!s.infrastructure?.monitoring) continue;
        const mon = s.infrastructure.monitoring;
        lines.push(`\n**${escapeProse(s.name || s.$id)}**:`);
        if (mon.logs) lines.push(`- Logs: ${escapeProse(mon.logs)}`);
        if (mon.metrics) lines.push(`- Metrics: ${escapeProse(mon.metrics)}`);
        if (mon.alarms && mon.alarms.length > 0) {
          lines.push(`- Alarms: ${escapeProse(mon.alarms.join(", "))}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Section 9: Testing Strategy
 * Data: service.testing, service.testing_details, feature.tests[],
 *       system.testing_strategy
 */
function renderTestingStrategy(
  system: SystemWithDesign,
  services: ServiceUsm[],
  features: FeatureUsm[],
): string | null {
  const hasServiceTesting = services.some((s) => s.testing);
  const hasServiceTestingDetails = services.some((s) => s.testing_details);
  const hasFeatureTests = features.some((f) => f.tests && f.tests.length > 0);
  const hasStrategy = !!system.testing_strategy;

  if (!hasServiceTesting && !hasServiceTestingDetails && !hasFeatureTests && !hasStrategy) {
    return null;
  }

  const lines: string[] = [];
  lines.push(frontmatter("Testing Strategy"));
  lines.push("# Testing Strategy\n");

  // Unit Testing
  if (hasServiceTesting) {
    lines.push("## Unit Testing\n");
    lines.push("| Service | Framework | Command | Coverage Target |");
    lines.push("|---------|-----------|---------|-----------------|");
    for (const s of services) {
      if (!s.testing) continue;
      const t = s.testing;
      lines.push(`| ${esc(s.name || s.$id)} | ${esc(t.framework || "—")} | ${esc(t.command || "—")} | ${esc(t.coverage_target || "—")} |`);
    }
    lines.push("");
  }

  // Integration Testing
  if (hasServiceTestingDetails) {
    lines.push("## Integration Testing\n");
    lines.push("| Service | Framework | E2E Path | Command |");
    lines.push("|---------|-----------|----------|---------|");
    for (const s of services) {
      if (!s.testing_details) continue;
      const t = s.testing_details;
      lines.push(`| ${esc(s.name || s.$id)} | ${esc(t.framework || "—")} | ${esc(t.e2e_path || "—")} | ${esc(t.command || "—")} |`);
    }
    lines.push("");
  }

  // Acceptance Testing
  if (hasFeatureTests) {
    lines.push("## Acceptance Testing\n");
    let totalTests = 0;
    for (const f of features) {
      if (f.tests) totalTests += f.tests.length;
    }
    lines.push(`Features declare ${totalTests} acceptance test(s) across ${features.filter((f) => f.tests && f.tests.length > 0).length} feature(s).\n`);
    lines.push("| Feature | Test Count |");
    lines.push("|---------|------------|");
    for (const f of features) {
      if (!f.tests || f.tests.length === 0) continue;
      lines.push(`| ${esc(f.$id)} | ${f.tests.length} |`);
    }
    lines.push("");
  }

  // Performance / Security / Automated Testing
  if (hasStrategy) {
    const ts = system.testing_strategy!;
    lines.push("## Additional Testing Policies\n");
    if (ts.performance_testing) {
      lines.push(`- **Performance Testing**: ${escapeProse(ts.performance_testing)}`);
    }
    if (ts.security_testing) {
      lines.push(`- **Security Testing**: ${escapeProse(ts.security_testing)}`);
    }
    if (ts.automated_testing) {
      lines.push(`- **Automated Testing**: ${escapeProse(ts.automated_testing)}`);
    }
    if (ts.ci_integration) {
      lines.push(`- **CI Integration**: ${escapeProse(ts.ci_integration)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 10: Maintenance & Monitoring
 * Data: system.operations, service.infrastructure.monitoring, system.error_tracking
 */
function renderMaintenanceMonitoring(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasOperations = !!system.operations;
  const hasMonitoring = services.some((s) => s.infrastructure?.monitoring);
  const hasErrorTracking = !!system.error_tracking;

  if (!hasOperations && !hasMonitoring && !hasErrorTracking) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Maintenance & Monitoring"));
  lines.push("# Maintenance & Monitoring\n");

  // Logging
  if (hasMonitoring) {
    const hasLogs = services.some((s) => s.infrastructure?.monitoring?.logs);
    if (hasLogs) {
      lines.push("## Logging\n");
      lines.push("| Service | Log Provider |");
      lines.push("|---------|---------------|");
      for (const s of services) {
        if (!s.infrastructure?.monitoring?.logs) continue;
        lines.push(`| ${esc(s.name || s.$id)} | ${esc(s.infrastructure.monitoring.logs)} |`);
      }
      lines.push("");
    }
  }

  // Alerting
  if (hasOperations) {
    lines.push("## Alerting\n");
    lines.push(`- **Alerts**: ${escapeProse(system.operations!.alerts || "—")}`);
    lines.push(`- **On-call**: ${escapeProse(system.operations!.on_call || "—")}`);
    lines.push("");
  }

  // System Health Monitoring
  if (hasMonitoring) {
    const hasMetrics = services.some((s) => s.infrastructure?.monitoring?.metrics);
    if (hasMetrics) {
      lines.push("## System Health Monitoring\n");
      lines.push("| Service | Metrics Provider | Alarms |");
      lines.push("|---------|-------------------|--------|");
      for (const s of services) {
        if (!s.infrastructure?.monitoring) continue;
        const mon = s.infrastructure.monitoring;
        const alarms = (mon.alarms || []).join(", ") || "—";
        lines.push(`| ${esc(s.name || s.$id)} | ${esc(mon.metrics || "—")} | ${esc(alarms)} |`);
      }
      lines.push("");
    }
  }

  // Error Tracking
  if (hasErrorTracking) {
    lines.push("## Error Tracking\n");
    const et = system.error_tracking!;
    lines.push(`- **Tool**: ${escapeProse(et.tool)}`);
    if (et.config_ref) lines.push(`- **Config**: ${escapeProse(et.config_ref)}`);
    if (et.dsn) lines.push(`- **DSN**: ${escapeProse(et.dsn)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Section 11: Backup & Recovery
 * Data: service.infrastructure.data, service.infrastructure.disaster_recovery,
 *       system.backup_recovery
 */
function renderBackupRecovery(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasBackupData = services.some((s) => s.infrastructure?.data?.backup_retention_days !== undefined);
  const hasDr = services.some((s) => s.infrastructure?.disaster_recovery);
  const hasSystemBackup = !!system.backup_recovery;

  if (!hasBackupData && !hasDr && !hasSystemBackup) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Backup & Recovery"));
  lines.push("# Backup & Recovery\n");

  // Backup Strategy
  if (hasBackupData) {
    lines.push("## Backup Strategy\n");
    lines.push("| Service | Engine | Backup Retention (days) |");
    lines.push("|---------|--------|------------------------|");
    for (const s of services) {
      if (s.infrastructure?.data?.backup_retention_days === undefined) continue;
      const data = s.infrastructure.data;
      lines.push(`| ${esc(s.name || s.$id)} | ${esc(data.engine || "—")} | ${data.backup_retention_days ?? "—"} |`);
    }
    lines.push("");
  }

  // Disaster Recovery
  if (hasDr) {
    lines.push("## Disaster Recovery\n");
    lines.push("| Service | RTO (minutes) | RPO (minutes) | Strategy |");
    lines.push("|---------|----------------|----------------|----------|");
    for (const s of services) {
      if (!s.infrastructure?.disaster_recovery) continue;
      const dr = s.infrastructure.disaster_recovery;
      lines.push(`| ${esc(s.name || s.$id)} | ${dr.rto_minutes ?? "—"} | ${dr.rpo_minutes ?? "—"} | ${esc(dr.backup_strategy || "—")} |`);
    }
    lines.push("");
  }

  // System-level backup & recovery
  if (hasSystemBackup) {
    const br = system.backup_recovery!;
    if (br.backup_strategy) {
      lines.push("## System Backup Strategy\n");
      lines.push(escapeProse(br.backup_strategy) + "\n");
    }
    if (br.disaster_recovery) {
      lines.push("## System Disaster Recovery Plan\n");
      lines.push(escapeProse(br.disaster_recovery) + "\n");
    }
    if (br.rto_minutes !== undefined || br.rpo_minutes !== undefined) {
      lines.push("## Recovery Targets\n");
      lines.push(`- **RTO**: ${br.rto_minutes ?? "—"} minutes`);
      lines.push(`- **RPO**: ${br.rpo_minutes ?? "—"} minutes`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Section 12: Risks & Mitigation
 * Data: system.risks, service.risks
 */
function renderRisksMitigation(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasSystemRisks = system.risks && system.risks.length > 0;
  const hasServiceRisks = services.some((s) => s.risks && s.risks.length > 0);

  if (!hasSystemRisks && !hasServiceRisks) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Risks & Mitigation"));
  lines.push("# Risks & Mitigation\n");

  // System Risks
  if (hasSystemRisks) {
    lines.push("## System Risks\n");
    lines.push("| ID | Title | Severity | Status | Mitigation |");
    lines.push("|----|-------|----------|--------|------------|");
    for (const r of system.risks!) {
      lines.push(`| ${esc(r.id)} | ${esc(r.title)} | ${esc(r.severity)} | ${esc(r.status || "—")} | ${esc(r.mitigation || "—")} |`);
    }
    lines.push("");

    // Severity summary
    const severityCounts = new Map<string, number>();
    for (const r of system.risks!) {
      const sev = r.severity || "unknown";
      severityCounts.set(sev, (severityCounts.get(sev) || 0) + 1);
    }
    lines.push("### Severity Summary\n");
    for (const [sev, count] of [...severityCounts.entries()].sort()) {
      lines.push(`- **${sev}**: ${count}`);
    }
    lines.push("");
  }

  // Service Risks
  if (hasServiceRisks) {
    lines.push("## Service Risks\n");
    for (const s of services) {
      if (!s.risks || s.risks.length === 0) continue;
      lines.push(`### ${escapeProse(s.name || s.$id)}\n`);
      for (const risk of s.risks) {
        lines.push(`- ${escapeProse(risk)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Section 13: Future Enhancements
 * Data: system.roadmap, service.future, service.infrastructure.scaling
 */
function renderFutureEnhancements(
  system: SystemWithDesign,
  services: ServiceUsm[],
): string | null {
  const hasRoadmap = system.roadmap && system.roadmap.length > 0;
  const hasFuture = services.some((s) => s.future && s.future.length > 0);
  const hasScaling = services.some((s) => s.infrastructure?.scaling);

  if (!hasRoadmap && !hasFuture && !hasScaling) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Future Enhancements"));
  lines.push("# Future Enhancements\n");

  // Roadmap
  if (hasRoadmap) {
    lines.push("## Roadmap\n");
    lines.push("| ID | Title | Status | Target Date |");
    lines.push("|----|-------|--------|-------------|");
    for (const r of system.roadmap!) {
      lines.push(`| ${esc(r.id)} | ${esc(r.title)} | ${esc(r.status || "—")} | ${esc(r.target_date || "—")} |`);
    }
    lines.push("");

    // Planned / in-progress items with descriptions
    const upcoming = system.roadmap!.filter(
      (r) => r.status === "planned" || r.status === "in-progress",
    );
    if (upcoming.length > 0) {
      lines.push("### Upcoming Items\n");
      for (const r of upcoming) {
        lines.push(`#### ${escapeProse(r.title)} [${r.status || "planned"}]\n`);
        if (r.description) {
          lines.push(escapeProse(r.description) + "\n");
        }
      }
    }
  }

  // Future items by service
  if (hasFuture) {
    lines.push("## Future Items by Service\n");
    for (const s of services) {
      if (!s.future || s.future.length === 0) continue;
      lines.push(`### ${escapeProse(s.name || s.$id)}\n`);
      for (const item of s.future) {
        lines.push(`- ${escapeProse(item)}`);
      }
      lines.push("");
    }
  }

  // Scalability Considerations
  if (hasScaling) {
    lines.push("## Scalability Considerations\n");
    lines.push("| Service | Min | Max | Target CPU % |");
    lines.push("|---------|-----|-----|-------------|");
    for (const s of services) {
      if (!s.infrastructure?.scaling) continue;
      const sc = s.infrastructure.scaling;
      lines.push(`| ${esc(s.name || s.$id)} | ${sc.min ?? "—"} | ${sc.max ?? "—"} | ${sc.target_cpu_percent ?? "—"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Decision Register — consolidates all decisions from features, services,
 * and system principles into one page.
 */
function renderDecisionRegister(
  features: FeatureUsm[],
  services: ServiceUsm[],
  system: SystemWithDesign,
): string | null {
  const featureDecisions: Array<Decision & { _source: string }> = [];
  for (const f of features) {
    if (!f.decisions) continue;
    for (const d of f.decisions) {
      featureDecisions.push({ ...d, _source: f.$id });
    }
  }

  const serviceDecisions: Array<Decision & { _source: string }> = [];
  for (const s of services) {
    if (!s.decisions) continue;
    for (const d of s.decisions) {
      serviceDecisions.push({ ...d, _source: s.$id });
    }
  }

  const principleDecisions: Array<{ id: string; decision: string; status?: string; _source: string }> = [];
  if (system.principles) {
    for (const p of system.principles) {
      principleDecisions.push({
        id: p.key,
        decision: p.statement,
        status: "accepted",
        _source: "system.principles",
      });
    }
  }

  const total = featureDecisions.length + serviceDecisions.length + principleDecisions.length;
  if (total === 0) return null;

  const lines: string[] = [];
  lines.push(frontmatter("Decision Register"));
  lines.push("# Decision Register\n");
  lines.push(`Consolidated decisions from ${featureDecisions.length} feature(s), ${serviceDecisions.length} service(s), and ${principleDecisions.length} principle(s).\n`);

  // Summary table
  lines.push("## Summary\n");
  lines.push("| ID | Decision | Status | Source |");
  lines.push("|----|----------|--------|--------|");
  for (const d of featureDecisions) {
    const decisionText = (d.decision || "").substring(0, 80);
    lines.push(`| ${esc(d.id)} | ${esc(decisionText)} | ${esc(d.status || "—")} | ${esc(d._source)} |`);
  }
  for (const d of serviceDecisions) {
    const decisionText = (d.decision || "").substring(0, 80);
    lines.push(`| ${esc(d.id)} | ${esc(decisionText)} | ${esc(d.status || "—")} | ${esc(d._source)} |`);
  }
  for (const d of principleDecisions) {
    const decisionText = (d.decision || "").substring(0, 80);
    lines.push(`| ${esc(d.id)} | ${esc(decisionText)} | ${esc(d.status || "—")} | ${esc(d._source)} |`);
  }
  lines.push("");

  // Detailed view
  lines.push("## Details\n");

  if (featureDecisions.length > 0) {
    lines.push("### Feature Decisions\n");
    for (const d of featureDecisions) {
      lines.push(`#### ${esc(d.id)} [${esc(d.status || "—")}]\n`);
      lines.push(`**Source**: ${escapeProse(d._source)}\n`);
      lines.push(`**Decision**: ${escapeProse(d.decision)}`);
      if (d.rationale) {
        lines.push(`\n**Rationale**: ${escapeProse(d.rationale)}`);
      }
      if (d.alternatives && d.alternatives.length > 0) {
        lines.push("\n**Alternatives**:");
        for (const alt of d.alternatives) {
          lines.push(`- ${escapeProse(alt.option)} — *rejected*: ${escapeProse(alt.rejected_because)}`);
        }
      }
      if (d.consequences) {
        lines.push(`\n**Consequences**: ${escapeProse(d.consequences)}`);
      }
      lines.push("");
    }
  }

  if (serviceDecisions.length > 0) {
    lines.push("### Service Decisions\n");
    for (const d of serviceDecisions) {
      lines.push(`#### ${esc(d.id)} [${esc(d.status || "—")}]\n`);
      lines.push(`**Source**: ${escapeProse(d._source)}\n`);
      lines.push(`**Decision**: ${escapeProse(d.decision)}`);
      if (d.rationale) {
        lines.push(`\n**Rationale**: ${escapeProse(d.rationale)}`);
      }
      lines.push("");
    }
  }

  if (principleDecisions.length > 0) {
    lines.push("### Architecture Principles (as decisions)\n");
    for (const d of principleDecisions) {
      lines.push(`#### ${esc(d.id)}\n`);
      lines.push(`**Decision**: ${escapeProse(d.decision)}\n`);
    }
  }

  return lines.join("\n");
}

// ─── Content-block enrichment ───────────────────────────────────────────────

/**
 * Append inline content blocks from system.usm design_pages[] to a section
 * page. Content blocks render AFTER the structured data.
 */
function appendContentBlocks(
  content: string,
  designPages: SystemWithDesign["design_pages"],
  sectionId: string,
): string {
  if (!designPages) return content;
  const page = designPages.find((p) => p.id === sectionId);
  if (!page || !page.content || page.content.length === 0) return content;

  const blockContent = renderContentBlocks(page.content as ContentBlock[]);
  return content + "\n## Additional Notes\n\n" + blockContent + "\n";
}

// ─── Main generator ────────────────────────────────────────────────────────

/**
 * Generate the 13-section technical design document.
 * Each section is its own page, rendered only when data exists.
 * Returns a GenerationResult with one output per rendered section.
 */
export function generateTechnicalDesign(
  system: SystemUsm,
  root: string,
  services: ServiceUsm[],
  features: FeatureUsm[],
  dataFiles: DataUsm[],
): GenerationResult {
  const sys = system as SystemWithDesign;
  const outputs: Array<{ path: string; content: string }> = [];

  function addSection(id: string, content: string | null): void {
    if (!content) return;
    const enriched = appendContentBlocks(content, sys.design_pages, id);
    const filePath = writeDoc(root, `${id}.md`, enriched);
    outputs.push({ path: filePath, content: enriched });
  }

  // 13 sections + decision register
  addSection("project-overview", renderProjectOverview(sys, features));
  addSection("requirements", renderRequirements(sys, features));
  addSection("system-architecture", renderSystemArchitecture(sys, services));
  addSection("module-design", renderModuleDesign(services, features));
  addSection("database-design", renderDatabaseDesign(dataFiles, sys));
  addSection("api-design", renderApiDesign(features, services, sys));
  addSection("security-design", renderSecurityDesign(sys, services));
  addSection("deployment-architecture", renderDeploymentArchitecture(sys, services));
  addSection("testing-strategy", renderTestingStrategy(sys, services, features));
  addSection("maintenance-monitoring", renderMaintenanceMonitoring(sys, services));
  addSection("backup-recovery", renderBackupRecovery(sys, services));
  addSection("risks-mitigation", renderRisksMitigation(sys, services));
  addSection("future-enhancements", renderFutureEnhancements(sys, services));

  // Decision Register (under Project Management, not Design)
  addSection("decision-register", renderDecisionRegister(features, services, sys));

  return { outputs };
}

/**
 * Determine which design section pages will be rendered.
 * Used by the sidebar generator to know which links to include.
 */
export function getDesignSections(
  system: SystemUsm,
  services: ServiceUsm[],
  features: FeatureUsm[],
  dataFiles: DataUsm[],
): string[] {
  const sys = system as SystemWithDesign;
  const sections: string[] = [];

  const checks: Array<{ id: string; has: () => boolean }> = [
    { id: "project-overview", has: () => renderProjectOverview(sys, features) !== null },
    { id: "requirements", has: () => renderRequirements(sys, features) !== null },
    { id: "system-architecture", has: () => renderSystemArchitecture(sys, services) !== null },
    { id: "module-design", has: () => renderModuleDesign(services, features) !== null },
    { id: "database-design", has: () => renderDatabaseDesign(dataFiles, sys) !== null },
    { id: "api-design", has: () => renderApiDesign(features, services, sys) !== null },
    { id: "security-design", has: () => renderSecurityDesign(sys, services) !== null },
    { id: "deployment-architecture", has: () => renderDeploymentArchitecture(sys, services) !== null },
    { id: "testing-strategy", has: () => renderTestingStrategy(sys, services, features) !== null },
    { id: "maintenance-monitoring", has: () => renderMaintenanceMonitoring(sys, services) !== null },
    { id: "backup-recovery", has: () => renderBackupRecovery(sys, services) !== null },
    { id: "risks-mitigation", has: () => renderRisksMitigation(sys, services) !== null },
    { id: "future-enhancements", has: () => renderFutureEnhancements(sys, services) !== null },
  ];

  for (const check of checks) {
    if (check.has()) sections.push(check.id);
  }

  return sections;
}

/**
 * Design section metadata for sidebar labels.
 */
export const DESIGN_SECTION_LABELS: Record<string, string> = {
  "project-overview": "Project Overview",
  "requirements": "Requirements",
  "system-architecture": "System Architecture",
  "module-design": "Module Design",
  "database-design": "Database Design",
  "api-design": "API Design",
  "security-design": "Security Design",
  "deployment-architecture": "Deployment Architecture",
  "testing-strategy": "Testing Strategy",
  "maintenance-monitoring": "Maintenance & Monitoring",
  "backup-recovery": "Backup & Recovery",
  "risks-mitigation": "Risks & Mitigation",
  "future-enhancements": "Future Enhancements",
};