// Capability registry — the extensible list of optional system.usm capabilities
// that `usm upgrade` can detect and set up.
//
// Each capability self-describes:
//   - detect():  returns true if the capability is already configured on a system
//   - setup():   configures it (interactive prompts OR defaults for --apply)
//   - introducedIn: the USM version that added it (used to flag "new since your version")
//
// Adding a future capability = one entry here (or a registerCapability call).
// `usm upgrade` itself never hardcodes capability names.

import type { SystemUsm } from "../types.js";
import { promptFeedbackPolicy, applyFeedbackToSystem, DEFAULT_FEEDBACK_POLICY } from "./feedback.js";

/** Result of setting up a single capability. */
export interface CapabilitySetupResult {
  applied: boolean;
  message: string;
}

/** A self-describing optional capability of a USM project. */
export interface Capability {
  id: string;
  name: string;
  description: string;
  /** Semver version this capability was introduced in (e.g. "0.1.0"). */
  introducedIn: string;
  /** Whether upgrade should recommend it by default. */
  recommended: boolean;
  /** Returns true if the capability is already configured on the system. */
  detect: (system: SystemUsm) => boolean;
  /** Configures the capability on the system.usm at the given path. */
  setup: (systemPath: string, opts: { interactive: boolean }) => Promise<CapabilitySetupResult>;
}

// ─── Built-in capabilities ───────────────────────────────────────────────────

/** The Agent Feedback Protocol — the first registered capability. */
const feedbackCapability: Capability = {
  id: "feedback",
  name: "Agent Feedback Protocol",
  description: "Governs how AI agents report bugs and improvements (policy + .usm/feedback).",
  introducedIn: "0.1.0",
  recommended: true,
  detect: (system) => !!system.feedback,
  async setup(systemPath, opts) {
    if (opts.interactive && process.stdin.isTTY) {
      const policy = await promptFeedbackPolicy();
      const resolved = policy ?? DEFAULT_FEEDBACK_POLICY;
      const result = applyFeedbackToSystem(systemPath, resolved);
      return {
        applied: result.applied,
        message: result.applied
          ? `Configured feedback policy: ${resolved.policy}`
          : `Failed: ${(result.errors || []).map((e) => e.message).join("; ")}`,
      };
    }
    // Non-interactive (--apply) — use the safe default
    const result = applyFeedbackToSystem(systemPath, DEFAULT_FEEDBACK_POLICY);
    return {
      applied: result.applied,
      message: result.applied
        ? `Configured feedback policy: human-gate (default). Run 'usm feedback' to customise.`
        : `Failed: ${(result.errors || []).map((e) => e.message).join("; ")}`,
    };
  },
};

/**
 * The registry of known capabilities. Exported as a mutable array so external
 * modules/packages can append via registerCapability(); the built-in set is
 * seeded here.
 */
export const CAPABILITIES: Capability[] = [feedbackCapability];

/**
 * Register an additional capability (for plugins/extended builds).
 */
export function registerCapability(capability: Capability): void {
  if (!CAPABILITIES.some((c) => c.id === capability.id)) {
    CAPABILITIES.push(capability);
  }
}
