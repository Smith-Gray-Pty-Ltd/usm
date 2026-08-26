/**
 * Verbosity control — global --quiet and --verbose flags that route output
 * through a single log helper so every command respects the level.
 *
 * Levels:
 *   --quiet   → only errors and the final summary line per command
 *   default   → current output (info, warnings, success lines)
 *   --verbose → timestamps, full paths, debug info
 *
 * The flags are parsed by Commander as global options; this module reads them
 * from the parsed opts and exposes a `level` and a set of log helpers.
 */
import pc from "picocolors";

export type VerbosityLevel = "quiet" | "normal" | "verbose";

let level: VerbosityLevel = "normal";

/** Set the verbosity level from parsed Commander options. */
export function setVerbosity(opts: { quiet?: boolean; verbose?: boolean }): void {
  if (opts.quiet) level = "quiet";
  else if (opts.verbose) level = "verbose";
  else level = "normal";
}

/** Get the current verbosity level. */
export function getLevel(): VerbosityLevel {
  return level;
}

function timestamp(): string {
  if (level !== "verbose") return "";
  const now = new Date();
  return pc.dim(now.toISOString().split("T")[1]!.replace("Z", "")) + " ";
}

// ─── Log helpers ─────────────────────────────────────────────────────────────
// In quiet mode, only error and summary are shown. In normal, all. In verbose,
// timestamps are prepended.

/** Log an info line. Suppressed in --quiet. */
export function logInfo(message: string): void {
  if (level === "quiet") return;
  console.log(timestamp() + message);
}

/** Log a success line. Suppressed in --quiet. */
export function logSuccess(message: string): void {
  if (level === "quiet") return;
  console.log(timestamp() + message);
}

/** Log a warning line. Suppressed in --quiet (use logError for critical). */
export function logWarning(message: string): void {
  if (level === "quiet") return;
  console.log(timestamp() + message);
}

/** Log an error. Always shown, even in --quiet. */
export function logError(message: string): void {
  console.error(timestamp() + message);
}

/** Log a summary line — always shown (the final result of a command). */
export function logSummary(message: string): void {
  console.log(timestamp() + message);
}

/** Log a debug line — only shown in --verbose. */
export function logDebug(message: string): void {
  if (level !== "verbose") return;
  console.log(timestamp() + pc.dim("[debug] " + message));
}