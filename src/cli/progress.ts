/**
 * Progress bar wrapper around cli-progress v3 (CJS-compatible).
 *
 * cli-progress auto-disables in non-TTY environments when we check isTTY before
 * creating the bar. In non-TTY we fall back to plain count logging.
 *
 * Usage:
 *   const bar = startProgress("Generating docs", files.length);
 *   for (const f of files) { write(f); bar.increment(); }
 *   bar.finish();
 */
import cliProgress from "cli-progress";
import { dim } from "./colors.js";

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

/** A handle returned by startProgress. No-op when non-TTY. */
export interface ProgressHandle {
  increment(n?: number): void;
  update(current: number, total?: number): void;
  finish(): void;
}

const noopHandle: ProgressHandle = {
  increment() {},
  update() {},
  finish() {},
};

/** Start a single progress bar. Returns a no-op handle in non-TTY. */
export function startProgress(label: string, total: number): ProgressHandle {
  if (!isTTY) return noopHandle;

  const bar = new cliProgress.SingleBar({
    format: `${label} |{bar}| {percentage}% | {value}/{total}`,
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
    clearOnComplete: false,
  });

  bar.start(total, 0);
  return {
    increment(n = 1) { bar.increment(n); },
    update(current: number, total?: number) { bar.update(current, { total }); },
    finish() { bar.stop(); },
  };
}

/** Log a count update in non-TTY mode (used as fallback). */
export function logCount(label: string, current: number, total: number): void {
  if (!isTTY) console.log(dim(`${label}: ${current}/${total}`));
}