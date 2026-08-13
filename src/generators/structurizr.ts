// Structurizr export generator — projects .usm data into Structurizr DSL.
//
// Mapping (C4 hierarchy):
//   system.usm   → softwareSystem
//   services     → containers (technology from runtime)
//   features     → components inside their $service container
//
// One more notation projected from the single .usm source of truth.

import path from "node:path";
import type { SystemUsm, ServiceUsm, FeatureUsm } from "../types.js";
import type { GenerationResult } from "../types.js";

function escapeDsl(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function firstLine(text: string | undefined, max = 100): string {
  if (!text) return "";
  return escapeDsl(text.split("\n")[0].slice(0, max));
}

function slugToTitle(slug: string): string {
  return slug
    .split(/[-_/]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Generate the Structurizr DSL workspace text from parsed .usm files.
 */
export function generateStructurizrDslContent(
  system: SystemUsm,
  services: ServiceUsm[],
  features: FeatureUsm[],
): string {
  const systemName = system.identity?.name || system.$id || "System";

  // Group features by their $service id
  const featuresByService = new Map<string, FeatureUsm[]>();
  for (const feature of features) {
    const serviceId = feature.$service;
    if (!serviceId) continue;
    if (!featuresByService.has(serviceId)) featuresByService.set(serviceId, []);
    featuresByService.get(serviceId)!.push(feature);
  }

  const lines: string[] = [];
  lines.push("workspace {");
  lines.push("");
  lines.push(`    model {`);
  lines.push(`        softwareSystem "${escapeDsl(systemName)}" {`);

  for (const svc of services) {
    const svcSlug = svc.$id?.split("/").pop() ?? "service";
    const containerName = svc.name || svcSlug;
    const technology = svc.runtime || "technology";
    const description = firstLine(svc.summary);
    const svcFeatures = featuresByService.get(svc.$id) ?? [];

    lines.push("");
    lines.push(`            container "${escapeDsl(containerName)}" {`);
    lines.push(`                description "${description}"`);
    lines.push(`                technology "${escapeDsl(technology)}"`);
    for (const feature of svcFeatures) {
      const featSlug = feature.$id?.split("/").pop() ?? "feature";
      const componentName = slugToTitle(featSlug);
      const status = feature.status ? ` [${feature.status}]` : "";
      lines.push("");
      lines.push(`                component "${escapeDsl(componentName)}" {`);
      lines.push(`                    description "${firstLine(feature.summary)}${status}"`);
      lines.push(`                    technology "feature"`);
      lines.push(`                }`);
    }
    lines.push(`            }`);
  }

  lines.push(`        }`);
  lines.push(`    }`);
  lines.push("");
  lines.push(`    views {`);
  lines.push(`        systemLandscape "Landscape" {`);
  lines.push(`            include *`);
  lines.push(`            autoLayout Layered`);
  lines.push(`        }`);
  lines.push("");
  lines.push(`        container "${escapeDsl(systemName)}" {`);
  lines.push(`            include *`);
  lines.push(`            autoLayout Layered`);
  lines.push(`        }`);
  lines.push(`    }`);
  lines.push("");
  lines.push(`    configuration {`);
  lines.push(`        scope "landscape"`);
  lines.push(`    }`);
  lines.push(`}`);

  return lines.join("\n") + "\n";
}

/**
 * Generate the .usm-workspace/structurizr/workspace.dsl output.
 */
export function generateStructurizrDsl(
  system: SystemUsm,
  services: ServiceUsm[],
  features: FeatureUsm[],
  root: string,
): GenerationResult {
  const content = generateStructurizrDslContent(system, services, features);
  return {
    outputs: [{
      path: path.join(root, ".usm-workspace", "structurizr", "workspace.dsl"),
      content,
    }],
  };
}
