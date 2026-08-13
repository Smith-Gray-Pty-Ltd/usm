// Structurizr import — converts a Structurizr workspace JSON into .usm specs.
//
// Mapping (conservative, reversible):
//   first softwareSystem → .usm/system.usm
//   its containers       → .usm/services/<slug>.usm (type inferred from technology)
//
// Guards: never overwrites existing files without --force; --dry-run lists
// planned writes only. Unmappable detail is preserved in summary text.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { validateUsm } from "../validate.js";
import type { SystemUsm, ServiceUsm } from "../types.js";

interface StructurizrContainer {
  id?: string;
  name: string;
  description?: string;
  technology?: string;
  tags?: string;
}

interface StructurizrSoftwareSystem {
  id?: string;
  name: string;
  description?: string;
  containers?: StructurizrContainer[];
}

interface StructurizrWorkspace {
  model?: {
    softwareSystems?: StructurizrSoftwareSystem[];
  };
}

type ServiceType = ServiceUsm["type"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "service";
}

/**
 * Infer a USM service type from Structurizr technology/tags.
 */
function inferServiceType(container: StructurizrContainer): ServiceType {
  const haystack = `${container.technology ?? ""} ${container.tags ?? ""}`.toLowerCase();
  if (/database|postgres|mysql|mongo|sql|mariadb/.test(haystack)) return "database";
  if (/redis|memcached|cache/.test(haystack)) return "cache";
  if (/queue|kafka|rabbit|sqs|pubsub/.test(haystack)) return "queue";
  if (/identity|auth|keycloak|zitadel|oauth/.test(haystack)) return "idp";
  if (/web|frontend|next|react|vue|browser/.test(haystack)) return "web-app";
  return "api";
}

export interface ImportPlanEntry {
  path: string;
  type: "system" | "service";
  name: string;
  wouldOverwrite: boolean;
}

export interface ImportOptions {
  root: string;
  /** $id org prefix (defaults to slugified system name). */
  idPrefix?: string;
  /** identity.domain for the system file. */
  domain?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface ImportResult {
  planned: ImportPlanEntry[];
  written: ImportPlanEntry[];
  skipped: ImportPlanEntry[];
  valid: boolean;
  errors: string[];
}

/**
 * Parse and validate a Structurizr workspace JSON payload.
 * Throws a descriptive Error when the payload isn't a workspace.
 */
export function parseStructurizrWorkspace(raw: string): StructurizrWorkspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("File is not valid JSON — expected a Structurizr workspace export");
  }
  const workspace = parsed as StructurizrWorkspace;
  if (!workspace?.model?.softwareSystems || workspace.model.softwareSystems.length === 0) {
    throw new Error("JSON has no model.softwareSystems — not a Structurizr workspace export?");
  }
  return workspace;
}

/**
 * Plan the import: map the workspace to .usm specs and check what exists.
 */
export function planStructurizrImport(workspace: StructurizrWorkspace, opts: ImportOptions): ImportPlanEntry[] {
  const system = workspace.model!.softwareSystems![0];

  const planned: ImportPlanEntry[] = [];
  const systemPath = path.join(opts.root, ".usm", "system.usm");
  planned.push({
    path: systemPath,
    type: "system",
    name: system.name,
    wouldOverwrite: fs.existsSync(systemPath),
  });

  for (const container of system.containers ?? []) {
    const svcPath = path.join(opts.root, ".usm", "services", `${slugify(container.name)}.usm`);
    planned.push({
      path: svcPath,
      type: "service",
      name: container.name,
      wouldOverwrite: fs.existsSync(svcPath),
    });
  }

  return planned;
}

/**
 * Import a Structurizr workspace JSON into .usm specs under <root>/.usm/.
 */
export function importStructurizrWorkspace(raw: string, opts: ImportOptions): ImportResult {
  const workspace = parseStructurizrWorkspace(raw);
  const system = workspace.model!.softwareSystems![0];
  const prefix = opts.idPrefix ?? slugify(system.name);
  const domain = opts.domain ?? "example.com";
  const today = new Date().toISOString().slice(0, 10);

  const planned = planStructurizrImport(workspace, opts);

  // Guard: blocked files that exist and no --force
  const blocked = planned.filter((p) => p.wouldOverwrite && !opts.force);
  if (opts.dryRun || blocked.length > 0) {
    return { planned, written: [], skipped: blocked, valid: true, errors: [] };
  }

  const written: ImportPlanEntry[] = [];
  const errors: string[] = [];

  // system.usm
  const systemUsm: SystemUsm = {
    $schema: "https://usm.dev/schema/v1.json",
    $id: `${prefix}/system`,
    $type: "system",
    $version: 1,
    $last_updated: today,
    summary: system.description?.split("\n")[0] || `Imported from Structurizr workspace (${system.name})`,
    identity: {
      name: system.name,
      domain,
    },
  };
  const systemValidation = validateUsm(systemUsm);
  if (!systemValidation.valid) {
    errors.push(`system.usm invalid: ${JSON.stringify(systemValidation.errors?.[0]?.message ?? "unknown")}`);
  } else {
    fs.mkdirSync(path.dirname(planned[0].path), { recursive: true });
    writeAtomic(planned[0].path, serializeYaml(systemUsm));
    written.push(planned[0]);
  }

  // services
  let index = 1;
  for (const container of system.containers ?? []) {
    const entry = planned[index++];
    const summaryParts = [
      container.description?.split("\n")[0],
      container.tags ? `(structurizr tags: ${container.tags})` : undefined,
    ].filter((p): p is string => !!p);
    const serviceUsm: ServiceUsm = {
      $schema: "https://usm.dev/schema/v1.json",
      $id: `${prefix}/${slugify(container.name)}`,
      $type: "service",
      $version: 1,
      $last_updated: today,
      summary: summaryParts.join(" — ") || `Imported from Structurizr container ${container.name}`,
      $system: `${prefix}/system`,
      name: container.name,
      type: inferServiceType(container),
      runtime: container.technology || "unknown",
    };
    const validation = validateUsm(serviceUsm);
    if (!validation.valid) {
      errors.push(`${path.basename(entry.path)} invalid: ${JSON.stringify(validation.errors?.[0]?.message ?? "unknown")}`);
      continue;
    }
    fs.mkdirSync(path.dirname(entry.path), { recursive: true });
    writeAtomic(entry.path, serializeYaml(serviceUsm));
    written.push(entry);
  }

  return { planned, written, skipped: [], valid: errors.length === 0, errors };
}

function serializeYaml(obj: unknown): string {
  return yaml.dump(obj, { indent: 2, lineWidth: 100, noRefs: true, quotingType: '"' });
}

function writeAtomic(filePath: string, content: string): void {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}
