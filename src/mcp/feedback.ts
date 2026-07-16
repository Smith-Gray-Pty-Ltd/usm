// usm_report_feedback — MCP write tool for structured agent feedback.
//
// Records a bug, improvement, or question as a first-class $type: feedback
// .usm file in .usm/feedback/. Respects the configured system.feedback.policy:
//   - human-gate        → returns a draft preview, does NOT write (show the human)
//   - direct-to-feedback → validates and writes to disk
//   - direct-to-github  → writes a record entry + returns a gh issue command
// An explicit `write: true` overrides human-gate (for after human approval).

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { validateUsm } from "../validate.js";
import { allUsmFilesInMonorepo } from "../mcp-utils.js";
import { parseUsmFile, isSystemFile } from "../parse.js";
import type { FeedbackUsm, SystemUsm } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find the system.usm file in the monorepo and return its parsed object.
 * Returns null if not found.
 */
function findSystemFile(): SystemUsm | null {
  const files = allUsmFilesInMonorepo();
  for (const filePath of files) {
    try {
      const parsed = parseUsmFile(filePath);
      if (isSystemFile(parsed)) return parsed;
    } catch {
      // skip unparseable
    }
  }
  return null;
}

/**
 * Derive a kebab-case slug from a title or summary.
 * "Scan drops empty dirs" → "scan-drops-empty-dirs"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Resolve the feedback $id. If `id` is provided, use it; otherwise derive
 * `<system-id-prefix>/<slug>` from the title/summary.
 */
function resolveFeedbackId(id: string | undefined, title: string | undefined, summary: string, system: SystemUsm | null): string {
  if (id && id.includes("/")) return id;
  const prefix = system?.$id?.split("/")[0] || "feedback";
  const slug = slugify(title || summary.split(/[.:;]/)[0]) || "untitled";
  return `${prefix}/${slug}`;
}

/**
 * Resolve the feedback directory: system.feedback.feedback_dir or `.usm/feedback`.
 */
function resolveFeedbackDir(system: SystemUsm | null): string {
  return system?.feedback?.feedback_dir ?? ".usm/feedback";
}

/**
 * Resolve the active policy: system.feedback.policy or `human-gate`.
 */
function resolvePolicy(system: SystemUsm | null): "human-gate" | "direct-to-feedback" | "direct-to-github" {
  return system?.feedback?.policy ?? "human-gate";
}

/**
 * Resolve the issue tracker URL: system.feedback.tracker or
 * identity.repository + /issues.
 */
function resolveTracker(system: SystemUsm | null): string | undefined {
  if (system?.feedback?.tracker) return system.feedback.tracker;
  const repo = system?.identity?.repository?.replace(/\/$/, "");
  return repo ? `${repo}/issues` : undefined;
}

/**
 * Write a file atomically (write to temp, then rename).
 */
function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

/**
 * Serialize a feedback object to YAML.
 */
function feedbackToYaml(feedback: FeedbackUsm): string {
  return yaml.dump(feedback, { indent: 2, lineWidth: 100, noRefs: true, quotingType: '"' });
}

/**
 * Build a `gh issue create` command string for direct-to-github mode.
 */
function buildGhCommand(feedback: FeedbackUsm, tracker: string | undefined): string {
  const title = feedback.title || feedback.summary.split("\n")[0].slice(0, 80);
  const labels = feedback.kind === "bug" ? "bug" : feedback.kind === "improvement" ? "enhancement" : "question";
  const bodyParts: string[] = [];
  bodyParts.push(`**Severity:** ${feedback.severity}`);
  bodyParts.push(`**Summary:** ${feedback.summary}`);
  if (feedback.reproduction) bodyParts.push(`\n### Reproduction\n${feedback.reproduction}`);
  if (feedback.suggested_fix) bodyParts.push(`\n### Suggested fix\n${feedback.suggested_fix}`);
  if (feedback.feature) bodyParts.push(`\nRelated feature: \`${feedback.feature}\``);
  bodyParts.push(`\n_Reported by ${feedback.reported_by}_`);
  const body = bodyParts.join("\n").replace(/"/g, '\\"');
  const repoFlag = tracker ? ` --repo ${tracker.replace(/\/issues\/?$/, "")}` : "";
  return `gh issue create --title "${title.replace(/"/g, '\\"')}" --body "${body}" --label "${labels}"${repoFlag}`;
}

// ─── Tool: usm_report_feedback ──────────────────────────────────────────────

export const reportFeedbackSchema = {
  kind: z.enum(["bug", "improvement", "question"]).describe("The nature of the feedback"),
  severity: z.enum(["low", "medium", "high", "critical"]).describe("How severe this is"),
  summary: z.string().describe("Description of the issue or suggestion (min 10 chars)"),
  reported_by: z.string().describe("Who reported this — e.g. 'agent:glm-5.2' or 'human:james'"),
  title: z.string().optional().describe("Short one-line title (optional, derived from summary if omitted)"),
  feature: z.string().optional().describe("Related feature $id (optional)"),
  reproduction: z.string().optional().describe("Steps to reproduce (for bugs)"),
  suggested_fix: z.string().optional().describe("Proposed resolution (optional)"),
  id: z.string().optional().describe("Override the $id (e.g. 'usm/my-bug'). Auto-derived if omitted."),
  write: z.boolean().optional().describe("Force writing to disk even under human-gate policy (use after human approval). Default: false."),
};

export async function reportFeedbackTool(args: {
  kind: "bug" | "improvement" | "question";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  reported_by: string;
  title?: string;
  feature?: string;
  reproduction?: string;
  suggested_fix?: string;
  id?: string;
  write?: boolean;
}) {
  try {
    const system = findSystemFile();
    const policy = resolvePolicy(system);
    const feedbackDir = resolveFeedbackDir(system);
    const tracker = resolveTracker(system);

    // Construct the feedback object
    const today = new Date().toISOString().split("T")[0];
    const feedback: FeedbackUsm = {
      $schema: "https://usm.dev/schema/v1.json",
      $id: resolveFeedbackId(args.id, args.title, args.summary, system),
      $type: "feedback",
      $version: 1,
      $last_updated: today,
      kind: args.kind,
      severity: args.severity,
      title: args.title,
      summary: args.summary,
      status: "open",
      reported_by: args.reported_by,
      feature: args.feature,
      reproduction: args.reproduction,
      suggested_fix: args.suggested_fix,
      created: today,
    };

    // Validate against schema
    const validation = validateUsm(feedback);
    if (!validation.valid) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            action: "rejected",
            errors: validation.errors,
          }, null, 2),
        }],
        isError: true,
      };
    }

    const yamlContent = feedbackToYaml(feedback);
    const slug = feedback.$id.split("/").pop();
    const targetPath = path.resolve(process.cwd(), feedbackDir, `${slug}.usm`);

    // Decide action based on policy (contract: policy-respected / mcp-tool-respects-policy)
    const forceWrite = args.write === true;

    if (policy === "direct-to-feedback" || forceWrite) {
      // Write to disk
      atomicWrite(targetPath, yamlContent);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            action: forceWrite && policy !== "direct-to-feedback" ? "written-forced" : "written",
            path: targetPath,
            policy,
            yaml: yamlContent,
          }, null, 2),
        }],
      };
    }

    if (policy === "direct-to-github") {
      // Record a local entry AND surface the gh command
      atomicWrite(targetPath, yamlContent);
      const ghCommand = buildGhCommand(feedback, tracker);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            action: "recorded-and-suggest-github",
            path: targetPath,
            policy,
            tracker,
            gh_command: ghCommand,
            note: tracker
              ? `Policy is direct-to-github. A record was written and a GitHub issue is suggested at ${tracker}. Run the gh_command to file it.`
              : "Policy is direct-to-github but no tracker is configured (set identity.repository or feedback.tracker). A local record was written.",
          }, null, 2),
        }],
      };
    }

    // human-gate — return a draft preview, do NOT write
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          action: "drafted",
          policy,
          yaml: yamlContent,
          note: "Active policy is human-gate: this feedback was NOT written to disk. Show it to the human and ask whether to record it. Re-call with write=true after approval to persist.",
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: `Report feedback failed: ${(err as Error).message}` }, null, 2),
      }],
      isError: true,
    };
  }
}
