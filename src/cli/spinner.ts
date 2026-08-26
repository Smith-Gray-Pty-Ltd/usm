/**
 * Spinner wrapper around ora v5 (last CJS-compatible major).
 *
 * ora v5 auto-disables in non-TTY environments (pipes, redirects, CI), so we
 * don't need manual guards. The spinner clears itself on success/failure.
 *
 * Usage:
 *   const spinner = startSpinner("Scanning codebase...");
 *   // ... do async work ...
 *   spinner.succeed("Scan complete");
 *   // or: spinner.fail("Scan failed");
 *   // or: spinner.warn("Nothing to scan");
 */
import ora, { type Ora } from "ora";

/** Start a spinner with the given message. Returns the Ora instance. */
export function startSpinner(message: string): Ora {
  return ora({
    text: message,
    spinner: "dots",
    // ora auto-detects non-TTY and silently disables itself; we don't need
    // an explicit isTTY check here.
  }).start();
}

/** Convenience: run an async fn under a spinner, auto-succeed/fail. */
export async function withSpinner<T>(
  message: string,
  fn: (spinner: Ora) => Promise<T>,
): Promise<T> {
  const spinner = startSpinner(message);
  try {
    const result = await fn(spinner);
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}