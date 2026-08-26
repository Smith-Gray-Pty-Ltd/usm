/**
 * Color helpers for the USM CLI — wraps picocolors with NO_COLOR and non-TTY guards.
 *
 * picocolors already respects NO_COLOR and auto-disables colors when stdout is
 * not a TTY, but we expose semantic helpers (success/error/warning/info/skip/dim)
 * so command handlers don't hardcode color names. This keeps the palette in one
 * place and makes it trivial to retheme.
 */
import pc from "picocolors";

// Re-export the underlying picocolors for ad-hoc use where the semantic helpers
// below don't fit (e.g. cyan for a path, magenta for a count).
export { pc };

// ─── Semantic palette ────────────────────────────────────────────────────────
// Conventional mapping: green=success, red=error, yellow=warning, cyan=info,
// dim=secondary values. Reads correctly in light and dark terminals.

/** Green text — success states, ✓ checks, completed operations. */
export function success(text: string): string {
  return pc.green(text);
}

/** Red text — errors, ✗ failures, invalid results. */
export function error(text: string): string {
  return pc.red(text);
}

/** Yellow text — warnings, ⚠ caution, deprecations. */
export function warning(text: string): string {
  return pc.yellow(text);
}

/** Cyan text — info, → arrows, neutral progress markers. */
export function info(text: string): string {
  return pc.cyan(text);
}

/** Dim text — file paths, counts, secondary info that should not compete with the primary message. */
export function dim(text: string): string {
  return pc.dim(text);
}

/** Bold text — emphasis for headers and key values. */
export function bold(text: string): string {
  return pc.bold(text);
}

/** Magenta text — counts, metrics, stat values. */
export function metric(text: string): string {
  return pc.magenta(text);
}

// ─── Symbol+message helpers ──────────────────────────────────────────────────
// The CLI uses a small set of status symbols everywhere. These helpers prepend
// the colored symbol so command handlers stay one-liners.

/** "✓ <message>" with green check. */
export function ok(message: string): string {
  return `${pc.green("✓")} ${message}`;
}

/** "✗ <message>" with red cross. */
export function fail(message: string): string {
  return `${pc.red("✗")} ${message}`;
}

/** "⚠ <message>" with yellow warning. */
export function warn(message: string): string {
  return `${pc.yellow("⚠")} ${message}`;
}

/** "⊘ <message>" with dim/yellow skip marker. */
export function skip(message: string): string {
  return `${pc.dim(pc.yellow("⊘"))} ${message}`;
}

/** "→ <message>" with cyan arrow. */
export function arrow(message: string): string {
  return `${pc.cyan("→")} ${message}`;
}