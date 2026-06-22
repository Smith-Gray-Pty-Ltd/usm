import path from "node:path";
import fs from "node:fs";
import type {
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  GenerationResult,
} from "../types.js";
import {
  findAllUsmFiles,
  parseUsmFile,
  isSystemFile,
  isServiceFile,
  isFeatureFile,
} from "../parse.js";

// ─── ArchiMate element / relationship models ────────────────────────────────────

interface XmiElement {
  id: string;
  name: string;
  type: string; // e.g., "archimate:ApplicationComponent"
  documentation?: string;
  folder: string; // ArchiMate layer folder name
  properties?: Record<string, string>;
}

interface XmiRelationship {
  id: string;
  type: string; // e.g., "archimate:ServingRelationship"
  source: string;
  target: string;
  name?: string;
  documentation?: string;
}

// ─── Main generator ──────────────────────────────────────────────────────────────

/**
 * Generate ArchiMate 3.1 Open Exchange XML from USM.
 * Output: `.usm-workspace/docs/archimate/model.xml`
 */
export function generateArchiMateModel(system: SystemUsm, root: string): GenerationResult {
  // 1. Load all .usm files (excluding system — already passed as param)
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

  // 2. Build elements & relationships
  const elements: XmiElement[] = [];
  const relationships: XmiRelationship[] = [];
  let nextId = 1;
  const genId = (prefix: string) => `id-${prefix}-${nextId++}`;

  // Map USM $id → xmi:id for cross-referencing in relationships
  const idMap = new Map<string, string>();

  // ── Application layer: services ────────────────────────────────────────────
  for (const svc of services) {
    const xmiId = genId("svc");
    idMap.set(svc.$id, xmiId);
    elements.push({
      id: xmiId,
      name: svc.name || svc.$id.split("/").pop() || svc.$id,
      type: "archimate:ApplicationComponent",
      documentation: svc.summary,
      folder: "Application",
    });
  }

  // ── Application layer: features ────────────────────────────────────────────
  for (const feat of features) {
    const xmiId = genId("feat");
    idMap.set(feat.$id, xmiId);
    const shortName = feat.summary.split(/[.!?]/)[0].trim() || feat.$id.split("/").pop() || feat.$id;
    elements.push({
      id: xmiId,
      name: shortName,
      type: "archimate:ApplicationFunction",
      documentation: feat.summary,
      folder: "Application",
    });

    // Composition: service contains its features
    const svcXmiId = idMap.get(feat.$service);
    if (svcXmiId) {
      relationships.push({
        id: genId("rel"),
        type: "archimate:CompositionRelationship",
        source: svcXmiId,
        target: xmiId,
      });
    }
  }

  // ── Application layer: data ────────────────────────────────────────────────
  for (const d of data) {
    const xmiId = genId("data");
    idMap.set(d.$id, xmiId);
    elements.push({
      id: xmiId,
      name: d.$id.split("/").pop() || d.$id,
      type: "archimate:DataObject",
      documentation: d.summary,
      folder: "Application",
      properties: {
        runtime: d.runtime || "",
        type: d.type || "",
      },
    });
  }

  // ── Technology layer: per-service infrastructure ───────────────────────────
  for (const svc of services) {
    const infra = svc.infrastructure;
    if (infra) {
      const xmiId = genId("node");
      idMap.set(`${svc.$id}-node`, xmiId);
      const region = infra.region || "—";
      const provider = infra.provider || "—";
      const computeType = infra.compute?.type || "—";
      const computeMode = infra.compute?.mode || "—";
      elements.push({
        id: xmiId,
        name: `${svc.name || svc.$id.split("/").pop()} (${provider}/${region})`,
        type: "archimate:Node",
        documentation: `Provider: ${provider}, Region: ${region}, Compute: ${computeType}/${computeMode}`,
        folder: "Technology",
        properties: {
          provider,
          region,
          compute_type: computeType,
          compute_mode: computeMode,
        },
      });

      // Aggregation: ApplicationComponent deployed on Node
      const svcXmiId = idMap.get(svc.$id);
      if (svcXmiId) {
        relationships.push({
          id: genId("rel"),
          type: "archimate:AggregationRelationship",
          source: svcXmiId,
          target: xmiId,
          name: "deployed on",
        });
      }
    }

    // Technology: auth method as Infrastructure Service
    const authMethod = svc.security?.auth_method;
    if (authMethod) {
      const xmiId = genId("authsvc");
      elements.push({
        id: xmiId,
        name: `${authMethod} (auth)`,
        type: "archimate:InfrastructureService",
        documentation: `Authentication method for ${svc.name || svc.$id}`,
        folder: "Technology",
      });
      const svcXmiId = idMap.get(svc.$id);
      if (svcXmiId) {
        relationships.push({
          id: genId("rel"),
          type: "archimate:ServingRelationship",
          source: xmiId,
          target: svcXmiId,
          name: "provides auth to",
        });
      }
    }
  }

  // ── Business layer: actors (from system.services) ──────────────────────────
  // Map well-known app services as Business Actors
  const appServiceIds = new Set<string>();
  if (system.services) {
    for (const s of system.services) {
      if (appServiceIds.has(s.id)) {
        const xmiId = genId("bactor");
        idMap.set(`actor-${s.id}`, xmiId);
        elements.push({
          id: xmiId,
          name: s.name || s.id,
          type: "archimate:BusinessActor",
          folder: "Business",
        });
      }
    }
  }

  // ── Business layer: RBAC roles ────────────────────────────────────────────
  for (const svc of services) {
    const rbac = svc.rbac;
    if (rbac?.roles) {
      for (const role of rbac.roles) {
        const xmiId = genId("brole");
        elements.push({
          id: xmiId,
          name: role.name,
          type: "archimate:BusinessRole",
          documentation: `${role.level} — ${role.helper || ""}`,
          folder: "Business",
        });
        const svcXmiId = idMap.get(svc.$id);
        if (svcXmiId) {
          relationships.push({
            id: genId("rel"),
            type: "archimate:AssignmentRelationship",
            source: xmiId,
            target: svcXmiId,
            name: role.level,
          });
        }
      }
    }
  }

  // ── Motivation layer: principles ──────────────────────────────────────────
  if (system.principles) {
    for (const p of system.principles) {
      const xmiId = genId("prin");
      idMap.set(`prin-${p.key}`, xmiId);
      elements.push({
        id: xmiId,
        name: p.name || p.key,
        type: "archimate:Principle",
        documentation: `Statement: ${p.statement}\n\nRationale: ${p.rationale}`,
        folder: "Motivation",
        properties: {
          key: p.key,
        },
      });
    }
  }

  // ── Motivation layer: drivers (from per-service decisions) ────────────────
  // SystemUsm doesn't have a `decisions` field; decisions live on ServiceUsm and FeatureUsm.
  // We gather all decisions from services here as Drivers.
  const allDecisions: Array<{ id: string; decision: string; rationale: string; status?: string; source: string }> = [];
  for (const svc of services) {
    if (svc.decisions) {
      for (const d of svc.decisions) {
        allDecisions.push({ ...d, source: svc.$id });
      }
    }
  }
  for (const feat of features) {
    if (feat.decisions) {
      for (const d of feat.decisions) {
        allDecisions.push({ ...d, source: feat.$id });
      }
    }
  }
  for (const d of allDecisions) {
    const xmiId = genId("drv");
    elements.push({
      id: xmiId,
      name: d.id || d.decision || "—",
      type: "archimate:Driver",
      documentation: `${d.decision} — ${d.rationale} (status: ${d.status || "—"}, source: ${d.source})`,
      folder: "Motivation",
    });
  }

  // ── Motivation: link decisions to their source services ──────────────────
  for (const svc of services) {
    if (svc.decisions) {
      const svcXmiId = idMap.get(svc.$id);
      if (svcXmiId) {
        for (const d of svc.decisions) {
          // Find the Driver element for this decision
          const drvElement = elements.find(e =>
            e.type === "archimate:Driver" && e.name === (d.id || d.decision)
          );
          if (drvElement) {
            relationships.push({
              id: genId("rel"),
              type: "archimate:AssociationRelationship",
              source: svcXmiId,
              target: drvElement.id,
              name: "decision",
            });
          }
        }
      }
    }
  }
  for (const feat of features) {
    if (feat.decisions) {
      const featXmiId = idMap.get(feat.$id);
      if (featXmiId) {
        for (const d of feat.decisions) {
          const drvElement = elements.find(e =>
            e.type === "archimate:Driver" && e.name === (d.id || d.decision)
          );
          if (drvElement) {
            relationships.push({
              id: genId("rel"),
              type: "archimate:AssociationRelationship",
              source: featXmiId,
              target: drvElement.id,
              name: "decision",
            });
          }
        }
      }
    }
  }

  // ── Motivation: requirements (from per-feature contracts) ─────────────────
  for (const feat of features) {
    if (feat.contracts) {
      for (const c of feat.contracts) {
        const xmiId = genId("req");
        elements.push({
          id: xmiId,
          name: c.id || "—",
          type: "archimate:Requirement",
          documentation: c.description,
          folder: "Motivation",
          properties: {
            applies_after: (c.applies_after || []).join(", "),
            must_have: (c.must_have || []).map(m => typeof m === "string" ? m : JSON.stringify(m)).join("; "),
          },
        });
        // Realization: feature realizes requirement
        const featXmiId = idMap.get(feat.$id);
        if (featXmiId) {
          relationships.push({
            id: genId("rel"),
            type: "archimate:RealizationRelationship",
            source: featXmiId,
            target: xmiId,
          });
        }
      }
    }
  }

  // ── Motivation: assessments (from system.risks) ───────────────────────────
  if (system.risks) {
    for (const r of system.risks) {
      const xmiId = genId("risk");
      idMap.set(`risk-${r.id}`, xmiId);
      elements.push({
        id: xmiId,
        name: r.title || r.id,
        type: "archimate:Assessment",
        documentation: `${r.description}\n\nSeverity: ${r.severity || "—"}, Status: ${r.status || "—"}, Mitigation: ${r.mitigation || "—"}`,
        folder: "Motivation",
        properties: {
          severity: r.severity || "",
          status: r.status || "",
        },
      });
    }
  }

  // ── Implementation layer: plateaus (from system.roadmap) ───────────────────
  if (system.roadmap) {
    for (const r of system.roadmap) {
      const xmiId = genId("plt");
      idMap.set(`plt-${r.id}`, xmiId);
      elements.push({
        id: xmiId,
        name: r.title || r.id,
        type: "archimate:Plateau",
        documentation: `${r.description}\n\nStatus: ${r.status || "—"}, Target: ${r.target_date || "—"}`,
        folder: "Implementation",
        properties: {
          status: r.status || "",
          target_date: r.target_date || "",
        },
      });
    }
  }

  // ── Relationships: depends_on → Serving ───────────────────────────────────
  // Use system.services (which has depends_on) to map between service IDs
  // and the actual service .usm file $ids
  if (system.services) {
    // Build a map from service ref id (e.g. "zitadel") → service $id
    const svcRefToId = new Map<string, string>();
    for (const svc of services) {
      const slug = svc.$id.split("/").pop() || "";
      svcRefToId.set(slug, svc.$id);
    }
    // Also support direct ID matching
    for (const svc of services) {
      svcRefToId.set(svc.$id, svc.$id);
    }

    for (const sRef of system.services) {
      const deps = sRef.depends_on || [];
      // Find the source xmi id — could be by ref id or by $id
      const sourceUsmId = svcRefToId.get(sRef.id) || sRef.id;
      const sourceXmiId = idMap.get(sourceUsmId);
      if (!sourceXmiId) continue;

      for (const dep of deps) {
        const targetUsmId = svcRefToId.get(dep) || dep;
        const targetXmiId = idMap.get(targetUsmId);
        if (targetXmiId) {
          relationships.push({
            id: genId("rel"),
            type: "archimate:UsedByRelationship",
            source: sourceXmiId,
            target: targetXmiId,
            name: "depends on",
          });
        }
      }
    }
  }

  // Also handle per-service depends_on (from .usm service files)
  for (const svc of services) {
    const deps = svc.depends_on || [];
    const svcXmiId = idMap.get(svc.$id);
    if (!svcXmiId) continue;
    for (const dep of deps) {
      const depXmiId = idMap.get(dep);
      if (depXmiId) {
        // Avoid duplicates — check if we already have this relationship
        const exists = relationships.some(
          r => r.source === svcXmiId && r.target === depXmiId && r.type === "archimate:UsedByRelationship"
        );
        if (!exists) {
          relationships.push({
            id: genId("rel"),
            type: "archimate:UsedByRelationship",
            source: svcXmiId,
            target: depXmiId,
            name: "depends on",
          });
        }
      }
    }
  }

  // ── Relationships: see_also → Association ──────────────────────────────────
  for (const feat of features) {
    const seeAlso = feat.see_also || [];
    const featXmiId = idMap.get(feat.$id);
    if (!featXmiId) continue;
    for (const ref of seeAlso) {
      const refXmiId = idMap.get(ref);
      if (refXmiId) {
        relationships.push({
          id: genId("rel"),
          type: "archimate:AssociationRelationship",
          source: featXmiId,
          target: refXmiId,
          name: "see also",
        });
      }
    }
  }

  // 3. Render XML
  const xml = renderXmi(elements, relationships, system);

  // 4. Write output
  const outPath = path.join(root, ".usm-workspace", "docs", "archimate", "model.xml");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, xml, "utf-8");

  return {
    outputs: [{ path: outPath, content: xml }],
  };
}

// ─── XML helpers ──────────────────────────────────────────────────────────────────

function xmlEscape(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── XMI renderer (ArchiMate 3.1 Open Exchange format) ───────────────────────────

/**
 * Render elements and relationships as ArchiMate 3.1 Open Exchange XML.
 *
 * The format follows the ArchiMate Open Exchange Model specification:
 * https://www.archimatetool.com/archimate-open-exchange-model/
 *
 * This produces valid XMI 2.1 that Archi and other EA tools can import.
 */
function renderXmi(
  elements: XmiElement[],
  relationships: XmiRelationship[],
  system: SystemUsm
): string {
  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // XMI root element with namespace declarations
  lines.push('<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001"');
  lines.push('          xmlns:archimate="http://www.archimatetool.com/archimate"');
  lines.push('          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');

  // Model element (root of the ArchiMate model)
  const modelName = xmlEscape(system.identity?.name || "Smith & Gray AI Platform");
  lines.push(`  <archimate:Model id="id-model" name="${modelName}">`);

  // Documentation on the model
  lines.push(`    <properties>`);
  lines.push(`      <property key="documentation" value="${xmlEscape("Generated from USM — Smith & Gray AI Platform architecture repository. ArchiMate 3.1 Open Exchange format.")}"/>`);
  lines.push(`      <property key="source" value="${xmlEscape(".usm/system.usm")}"/>`);
  lines.push(`      <property key="generator" value="${xmlEscape("usm generate:archimate")}"/>`);
  lines.push(`      <property key="generated_date" value="${xmlEscape(new Date().toISOString().split("T")[0])}"/>`);
  lines.push(`    </properties>`);

  // ── Organization: Folders ────────────────────────────────────────────────
  // ArchiMate Open Exchange uses folders for organization (layers + extensions)

  const folderOrder = ["Strategy", "Business", "Application", "Technology", "Motivation", "Implementation"];

  // Determine which folders actually have elements
  const folderElementCounts = new Map<string, number>();
  for (const e of elements) {
    const count = folderElementCounts.get(e.folder) || 0;
    folderElementCounts.set(e.folder, count + 1);
  }

  for (const folderName of folderOrder) {
    const count = folderElementCounts.get(folderName) || 0;
    if (count > 0) {
      const folderId = `id-folder-${folderName.toLowerCase()}`;
      lines.push(`    <folder id="${folderId}" name="${xmlEscape(folderName)}" type="${getFolderType(folderName)}">`);

      // Elements in this folder
      for (const e of elements) {
        if (e.folder === folderName) {
          const docLine = e.documentation
            ? `\n      <documentation>${xmlEscape(e.documentation)}</documentation>`
            : "";

          lines.push(`      <element xsi:type="${e.type}" id="${e.id}" name="${xmlEscape(e.name)}">${docLine}`);

          // Properties
          if (e.properties && Object.keys(e.properties).length > 0) {
            lines.push(`        <properties>`);
            for (const [key, value] of Object.entries(e.properties)) {
              if (value) {
                lines.push(`          <property key="${xmlEscape(key)}" value="${xmlEscape(value)}"/>`);
              }
            }
            lines.push(`        </properties>`);
          }

          lines.push(`      </element>`);
        }
      }

      lines.push(`    </folder>`);
    }
  }

  // ── Relationships ────────────────────────────────────────────────────────
  // Relationships go in a separate folder in the Open Exchange format
  if (relationships.length > 0) {
    lines.push(`    <folder id="id-folder-relations" name="Relations" type="relations">`);
    for (const r of relationships) {
      const nameAttr = r.name ? ` name="${xmlEscape(r.name)}"` : "";
      const docContent = r.documentation
        ? `\n        <documentation>${xmlEscape(r.documentation)}</documentation>\n      `
        : "";
      lines.push(`      <element xsi:type="${r.type}" id="${r.id}" source="${r.source}" target="${r.target}"${nameAttr}>${docContent}</element>`);
    }
    lines.push(`    </folder>`);
  }

  lines.push(`  </archimate:Model>`);
  lines.push("</xmi:XMI>");

  return lines.join("\n");
}

/**
 * Map ArchiMate folder names to their Open Exchange type integers.
 * See: https://www.archimatetool.com/archimate-open-exchange-model/
 */
function getFolderType(folderName: string): string {
  const types: Record<string, string> = {
    "Strategy": "0",
    "Business": "1",
    "Application": "2",
    "Technology": "3",
    "Motivation": "4",
    "Implementation": "5",
    "Other": "6",
    "relations": "7",
  };
  return types[folderName] || "6";
}
