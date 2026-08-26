/**
 * Update-notifier wrapper — checks npm registry in the background for a newer
 * @smithgray/usm version, cached for 24h, renders a one-line hint in TTY.
 *
 * Uses update-notifier v5 (last CJS-compatible major; v7+ is ESM-only).
 * The notify() call is non-blocking and auto-suppressed in non-TTY.
 */
import fs from "node:fs";
import path from "node:path";

// Resolve package.json relative to compiled location (dist/cli/updateCheck.js
// → ../../package.json). We use fs.readFileSync (not JSON import attribute)
// to match the existing pattern in cli/index.ts and stay compatible with the
// CJS build under Node16 module resolution.
const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
  name: string;
  version: string;
};

/**
 * Run the update check. Should be called early in the CLI lifecycle, but it's
 * non-blocking — the check happens in the background and the hint (if any) is
 * rendered asynchronously when ready.
 *
 * update-notifier v5 is imported dynamically because its package.json exports
 * field is typed as ESM in @types/update-notifier@6, which conflicts with our
 * CJS build. The dynamic require at runtime works fine for the CJS v5 package.
 */
export async function checkForUpdates(): Promise<void> {
  try {
    // Dynamic require to avoid the @types/update-notifier ESM-only type error.
    // update-notifier v5 ships as CJS so this works at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updateNotifier: (opts: {
      pkg: { name: string; version: string };
      updateCheckInterval: number;
    }) => { notify: (opts?: { isGlobal?: boolean }) => void } =
      require("update-notifier");

    // 1000 * 60 * 60 * 24 = 24h cache interval.
    const notifier = updateNotifier({
      pkg: { name: pkg.name, version: pkg.version },
      updateCheckInterval: 1000 * 60 * 60 * 24,
    });

    // notify() renders the hint if an update is available, in TTY only.
    notifier.notify({ isGlobal: true });
  } catch {
    // Silently ignore — update checks are non-critical.
  }
}