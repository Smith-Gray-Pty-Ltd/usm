import path from "node:path";
import fs from "node:fs";
import type {
  FeatureUsm,
  GenerationResult,
  Flow,
  FlowStep,
  FeatureTest,
} from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_APP_DIRS = ["the-architect", "tenant", "platform", "marketing", "mobile", "desktop"];

// ─── Utility helpers ──────────────────────────────────────────────────────────

function inferAppName(feature: FeatureUsm): string {
  if (feature.apps && feature.apps.length > 0) return feature.apps[0];
  if (feature.$service) {
    const slug = feature.$service.split("/").pop() || "";
    if (KNOWN_APP_DIRS.includes(slug)) return slug;
  }
  return "unknown";
}

function inferFeatureSlugFromId(featureId: string): string {
  const parts = featureId.split("/");
  return parts.slice(1).join("/");
}

function inferArea(featureId: string): string {
  const parts = featureId.split("/");
  const afterSystem = parts.slice(1);
  if (afterSystem.length === 1) {
    return afterSystem[0];
  }
  return afterSystem[0];
}

/** Sanitize an id string into a valid JS identifier */
function toValidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Format an expect object as a comment line */
function formatExpectAsComment(expect: Record<string, unknown>): string {
  const entries = Object.entries(expect);
  if (entries.length === 0) return "";
  const key = entries[0][0];
  const value = entries[0][1];
  if (typeof value === "boolean") return `${key}: ${value}`;
  if (typeof value === "string") return `${key}: ${value}`;
  return `${key}: ${JSON.stringify(value)}`;
}

/** Format setup object as comment lines */
function formatSetupAsComment(setup: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(setup)) {
    lines.push(`// setup: ${key} = ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  return lines;
}

// ─── Generate Vitest spec for a single feature ───────────────────────────────

export function generateTestSpec(
  feature: FeatureUsm,
  root: string,
  sourceFilePath?: string,
): GenerationResult {
  const hasTests = feature.tests && feature.tests.length > 0;
  const hasFlows = feature.flows && feature.flows.length > 0;

  if (!hasTests && !hasFlows) {
    return { outputs: [] };
  }

  const appName = inferAppName(feature);
  const featureSlug = sourceFilePath
    ? inferSlugFromPath(sourceFilePath, root)
    : inferFeatureSlugFromId(feature.$id);
  const area = inferArea(feature.$id);

  const lines: string[] = [];

  // Header
  const usmSource = sourceFilePath
    ? path.relative(root, sourceFilePath)
    : `.usm/features/${featureSlug}.usm`;
  lines.push(`/**`);
  lines.push(` * Auto-generated Vitest spec from ${usmSource}`);
  lines.push(` * DO NOT EDIT — regenerate with: pnpm --filter usm generate`);
  lines.push(` */`);
  lines.push("");
  lines.push(`import { describe, it, expect, beforeEach } from 'vitest';`);
  lines.push("");

  // Describe block
  const describeSlug = featureSlug.replace(/\//g, "/");
  lines.push(`describe('${describeSlug}', () => {`);

  // From flows[].steps
  if (feature.flows) {
    for (const flow of feature.flows) {
      for (const step of flow.steps) {
        const stepId = toValidId(step.id);
        const action = step.action;
        const target = step.target || "";
        const expectDescs = (step.expect || [])
          .map((e) => formatExpectAsComment(e as Record<string, unknown>))
          .filter(Boolean);

        lines.push(`  it('${stepId}: ${action}${target ? " " + target : ""}', async () => {`);
        lines.push(`    // TODO: implement — action: ${action}, target: ${target}`);
        for (const desc of expectDescs) {
          lines.push(`    // expect: ${desc}`);
        }
        lines.push(`  });`);
        lines.push("");
      }
    }
  }

  // From tests[]
  if (feature.tests) {
    for (const test of feature.tests) {
      const testId = toValidId(test.id);

      lines.push(`  it('${testId}', async () => {`);

      // Setup
      if (test.setup && Object.keys(test.setup).length > 0) {
        for (const setupLine of formatSetupAsComment(test.setup as Record<string, unknown>)) {
          lines.push(`    ${setupLine}`);
        }
      }

      // Flow reference
      if (test.flow) {
        if (typeof test.flow === "string") {
          lines.push(`    // flow: ${test.flow}`);
        } else {
          lines.push(`    // flow: ${test.flow.ref}${test.flow.steps_until ? ` (until ${test.flow.steps_until})` : ""}`);
        }
      }

      // Contracts
      if (test.contracts && test.contracts.length > 0) {
        lines.push(`    // contracts: ${test.contracts.join(", ")}`);
      }

      // Expectations
      for (const exp of test.expect) {
        const desc = formatExpectAsComment(exp as Record<string, unknown>);
        if (desc) {
          lines.push(`    // expect: ${desc}`);
        }
      }

      lines.push(`  });`);
      lines.push("");
    }
  }

  lines.push("});");

  // Output path — mirror the .usm source tree structure
  // e.g. .usm/features/agent/events.usm → apps/the-architect/__tests__/features/agent/events.spec.ts
  const outputPath = `${root}/apps/${appName}/__tests__/features/${featureSlug}.spec.ts`;

  return {
    outputs: [{ path: outputPath, content: lines.join("\n") }],
  };
}

// ─── Generate all test specs ──────────────────────────────────────────────────

export function generateAllTestSpecs(
  features: FeatureUsm[],
  root: string,
): GenerationResult {
  const outputs: GenerationResult["outputs"] = [];

  // We need source file paths to derive correct output paths
  const usmFeaturesDir = path.resolve(root, ".usm", "features");
  const usmFiles = fs.existsSync(usmFeaturesDir) ? findUsmFilesRecursive(usmFeaturesDir) : [];

  for (const feat of features) {
    const hasTests = feat.tests && feat.tests.length > 0;
    const hasFlows = feat.flows && feat.flows.length > 0;
    if (!hasTests && !hasFlows) continue;

    // Find source file path for this feature
    const sourceFilePath = usmFiles.find((fp) => {
      try {
        const content = fs.readFileSync(fp, "utf-8");
        return content.includes(`$id: ${feat.$id}`) || content.includes(`$id: '${feat.$id}'`) || content.includes(`$id: "${feat.$id}"`);
      } catch {
        return false;
      }
    });

    const result = generateTestSpec(feat, root, sourceFilePath);
    outputs.push(...result.outputs);
  }

  return { outputs };
}

// ─── Generate aggregated specs.md ─────────────────────────────────────────────

export function generateAggregatedSpecs(
  features: FeatureUsm[],
  root: string,
): GenerationResult {
  const lines: string[] = [];

  lines.push("# Test Specifications");
  lines.push("");
  lines.push("Auto-generated from .usm/features/*.usm `tests[]` and `flows[]`.");
  lines.push("");

  for (const feat of features) {
    const hasTests = feat.tests && feat.tests.length > 0;
    const hasFlows = feat.flows && feat.flows.length > 0;
    if (!hasTests && !hasFlows) continue;

    const featureSlug = inferFeatureSlugFromId(feat.$id);
    const status = feat.status ? ` [${feat.status}]` : "";
    const appName = inferAppName(feat);

    lines.push(`## ${feat.$id}${status}`);
    lines.push("");

    // From flows
    if (hasFlows) {
      lines.push("### From flows:");
      lines.push("");
      for (const flow of feat.flows!) {
        lines.push(`- **${flow.id}**: ${flow.name}`);
        if (flow.description) {
          lines.push(`  _${flow.description}_`);
        }
        for (const step of flow.steps) {
          const target = step.target ? ` → \`${step.target}\`` : "";
          lines.push(`  - ${step.action}${target}`);
          for (const exp of step.expect || []) {
            const desc = formatExpectAsComment(exp as Record<string, unknown>);
            if (desc) lines.push(`    - expect: ${desc}`);
          }
        }
      }
      lines.push("");
    }

    // From tests
    if (hasTests) {
      lines.push("### From tests:");
      lines.push("");
      for (const test of feat.tests!) {
        const typeStr = (test.expect as Array<Record<string, unknown>>)
          ?.map((e) => e.type || e.assertion ? "assertion" : "")
          .filter(Boolean)[0] as string | undefined;
        const typeLabel = typeStr && typeof typeStr === "string" ? ` (type: ${typeStr})` : "";
        lines.push(`- **${test.id}**${typeLabel}`);

        if (test.setup && Object.keys(test.setup).length > 0) {
          for (const [key, value] of Object.entries(test.setup as Record<string, unknown>)) {
            lines.push(`  - setup: ${key} = ${typeof value === "string" ? value : JSON.stringify(value)}`);
          }
        }

        for (const exp of test.expect) {
          const entries = Object.entries(exp as Record<string, unknown>);
          for (const [key, value] of entries) {
            lines.push(`  - assert: ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
          }
        }
      }
      lines.push("");
    }

    // Link to spec file
    const specPath = `apps/${appName}/__tests__/features/${featureSlug}.spec.ts`;
    lines.push(`_Spec file: \`${specPath}\`_`);
    lines.push("");
  }

  return {
    outputs: [
      {
        path: `${root}/.agents-workspace/docs/testing/specs.md`,
        content: lines.join("\n"),
      },
    ],
  };
}

// ─── Helper: find .usm files recursively ──────────────────────────────────────

function findUsmFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findUsmFilesRecursive(fullPath));
    } else if (entry.name.endsWith(".usm")) {
      results.push(fullPath);
    }
  }
  return results;
}

function inferSlugFromPath(sourceFilePath: string, root: string): string {
  const usmFeaturesDir = path.resolve(root, ".usm", "features");
  const relFromFeatures = path.relative(usmFeaturesDir, sourceFilePath);
  return relFromFeatures.replace(/\.usm$/, "");
}
