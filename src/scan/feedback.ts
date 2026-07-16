// Agent feedback policy — setup, resolution, and persistence.
//
// The feedback policy lives in system.usm under the `feedback` block and drives
// the Feedback Protocol rendered into every agent-facing rules file. This
// module provides: a pure resolver (testable), a system.usm merger, and an
// interactive prompt (TTY only).

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { FeedbackPolicy, SystemUsm } from "../types.js";

/** The three supported feedback policies, in display order. */
export const FEEDBACK_POLICIES = [
  "human-gate",
  "direct-to-feedback",
  "direct-to-github",
] as const;

/** Default policy applied when none is configured or the user skips setup. */
export const DEFAULT_FEEDBACK_POLICY: FeedbackPolicy = {
  policy: "human-gate",
};

/**
 * Map raw setup answers to a validated FeedbackPolicy.
 *
 * Pure function — no I/O. Enforces the rule that `direct-to-github` requires
 * GitHub auth: if the agent lacks auth, it downgrades to `human-gate`.
 *
 * @param answers.githubAuth   — whether the dev agent has `gh` CLI auth
 * @param answers.policyChoice — one of FEEDBACK_POLICIES
 * @param answers.tracker      — optional override issue-tracker URL
 */
export function resolveFeedbackPolicy(answers: {
  githubAuth: boolean;
  policyChoice: string;
  tracker?: string;
}): FeedbackPolicy {
  let policy = answers.policyChoice;

  // Guard: direct-to-github requires GitHub auth (contract: policy-respected)
  if (policy === "direct-to-github" && !answers.githubAuth) {
    policy = "human-gate";
  }

  const result: FeedbackPolicy = {
    policy: policy as FeedbackPolicy["policy"],
    github_auth: answers.githubAuth,
  };

  if (answers.tracker && answers.tracker.trim()) {
    result.tracker = answers.tracker.trim();
  }

  return result;
}

/**
 * Default the feedback directory from a system.usm's feedback_dir, or
 * `.usm/feedback` if unset. Used by both the CLI and MCP tool.
 */
export function resolveFeedbackDir(system: SystemUsm): string {
  return system.feedback?.feedback_dir ?? ".usm/feedback";
}

/**
 * Read a system.usm file and return its parsed object, or null if missing /
 * unparseable.
 */
function readSystemUsm(systemPath: string): SystemUsm | null {
  if (!fs.existsSync(systemPath)) return null;
  try {
    const content = fs.readFileSync(systemPath, "utf-8");
    return yaml.load(content) as SystemUsm;
  } catch {
    return null;
  }
}

/**
 * Merge a feedback policy into an existing system.usm file.
 *
 * Preserves every other field — only adds/updates the top-level `feedback`
 * block and bumps `$last_updated`. Validates the result against the schema
 * before writing; returns an error list instead of writing if invalid.
 *
 * @returns `{ applied, path }` on success, or `{ applied: false, errors }`
 */
export function applyFeedbackToSystem(
  systemPath: string,
  policy: FeedbackPolicy,
): { applied: boolean; path?: string; errors?: Array<{ path: string; message: string }> } {
  const system = readSystemUsm(systemPath);
  if (!system) {
    return {
      applied: false,
      errors: [{ path: systemPath, message: "system.usm not found or unparseable. Create it with 'usm init-file' first." }],
    };
  }

  // Apply the feedback block
  system.feedback = policy;
  system.$last_updated = new Date().toISOString().split("T")[0];

  // Lazy import to avoid a circular module-load dependency at import time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateUsm } = require("../validate.js") as typeof import("../validate.js");
  const validation = validateUsm(system);
  if (!validation.valid) {
    return { applied: false, errors: validation.errors };
  }

  const yamlContent = yaml.dump(system, { indent: 2, lineWidth: 100, noRefs: true, quotingType: '"' });

  // Atomic write
  const dir = path.dirname(systemPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = systemPath + ".tmp";
  fs.writeFileSync(tmp, yamlContent, "utf-8");
  fs.renameSync(tmp, systemPath);

  return { applied: true, path: systemPath };
}

/**
 * Interactive prompt for the feedback policy (TTY only).
 *
 * Asks the two setup questions: GitHub auth presence, and policy choice.
 * Downgrades direct-to-github to human-gate if the agent lacks auth.
 *
 * @returns the resolved policy, or null if stdin is not a TTY or the user
 *          skipped (in which case the default human-gate applies implicitly).
 */
export async function promptFeedbackPolicy(): Promise<FeedbackPolicy | null> {
  if (!process.stdin.isTTY) {
    return null; // non-interactive — default policy applies
  }

  const rl = readline.createInterface({ input, output });

  try {
    // Q1: GitHub auth
    const ghAnswer = (await rl.question(
      "Does your dev agent have GitHub auth? (gh CLI authenticated) [y/N] ",
    )).trim().toLowerCase();
    const githubAuth = ghAnswer === "y" || ghAnswer === "yes";

    // Q2: policy choice
    console.log("\nHow should agents report bugs/improvements?");
    console.log("  1) human-gate        — ask the human before filing (default)");
    console.log("  2) direct-to-feedback — write structured .usm/feedback entries");
    if (githubAuth) {
      console.log("  3) direct-to-github   — file a GitHub issue via gh");
    } else {
      console.log("  3) direct-to-github   — (requires GitHub auth, which you don't have)");
    }
    const choiceRaw = (await rl.question("\nChoice [1] ")).trim();
    const choiceNum = Number.parseInt(choiceRaw || "1", 10);
    let policyChoice: string;
    if (choiceNum === 2) policyChoice = "direct-to-feedback";
    else if (choiceNum === 3 && githubAuth) policyChoice = "direct-to-github";
    else policyChoice = "human-gate";

    // Optional tracker override
    const tracker = (await rl.question("Issue tracker URL (blank = use identity.repository/issues) ")).trim() || undefined;

    return resolveFeedbackPolicy({ githubAuth, policyChoice, tracker });
  } finally {
    rl.close();
  }
}
