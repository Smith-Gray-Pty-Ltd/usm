/**
 * Integration tests for the docs watch mode (issue #25.3).
 *
 * `watchUsmDir` (extracted from `startWatchMode`) watches the .usm/ tree and
 * invokes a debounced `regenerate` callback on `.usm` file changes — including
 * NEW files in NEWLY-CREATED subdirectories, which the previous per-directory
 * walk-and-watch approach missed.
 *
 * These tests drive `watchUsmDir` directly with a mock `regenerate` (no docs
 * server, no subprocess) and assert that:
 *   - editing an existing `.usm` file triggers regeneration
 *   - adding a `.usm` file to an EXISTING subdirectory triggers regeneration
 *   - adding a `.usm` file to a NEWLY-CREATED subdirectory triggers regeneration
 *     (the #25.3 regression — the old walk-and-watch only watched dirs that
 *     existed at startup, so a new `.usm/features/new-area/x.usm` was missed)
 *   - a non-.usm file change does NOT trigger regeneration
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { watchUsmDir } from "../src/cli/docs.js";

let tmpDir: string;

function makeUsmDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-watch-"));
  const usmDir = path.join(tmpDir, ".usm");
  // Seed with an existing features/ area containing one file.
  const featuresDir = path.join(usmDir, "features", "existing-area");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.writeFileSync(
    path.join(featuresDir, "existing.usm"),
    [
      "$schema: https://usm.dev/schema/v1.json",
      "$id: test/existing",
      "$type: feature",
      "$version: 1",
      "summary: Existing feature.",
      "$system: test/system",
      "$service: test/svc",
      "intent: x",
    ].join("\n"),
    "utf-8",
  );
  // Seed a non-.usm file (e.g. a notes file) so a later EDIT doesn't register
  // as a structural change that the recursive watcher might surface.
  fs.writeFileSync(path.join(usmDir, "notes.md"), "notes\n", "utf-8");
  return usmDir;
}

/**
 * Wait until `regenerate` has been called at least `n` times, or timeout.
 * `watchUsmDir` debounces by 500ms, so we allow generous polling.
 */
function waitForCalls(count: { value: number }, target: number, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (count.value >= target) return resolve();
      if (Date.now() > deadline) {
        return reject(new Error(`Timed out waiting for regenerate (got ${count.value}, wanted ${target})`));
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Small helper: resolve a promise the next time `fn` is invoked, regardless of
 * debounce timing. We pair this with a manual flush of timers is unnecessary —
 * the real debounce (500ms) fires in real time, so tests just wait for it.
 */
function makeCounter() {
  const count = { value: 0 };
  const regenerate = () => { count.value++; };
  return { count, regenerate };
}

/**
 * `fs.watch({ recursive: true })` on macOS emits a burst of discovery events
 * (including for existing `.usm` files) right after the watcher starts. Let
 * that settle and reset the counter so each test measures only the increment
 * from the action under test, not the startup burst.
 */
async function settleAndReset(count: { value: number }): Promise<void> {
  // 800ms covers the 500ms debounce plus the discovery burst.
  await new Promise((r) => setTimeout(r, 800));
  count.value = 0;
}

describe("watchUsmDir (docs watch mode — issue #25.3)", () => {
  let stop: () => void;

  beforeEach(() => {
    stop = () => {};
  });
  afterEach(() => {
    stop();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("regenerates when an existing .usm file is edited", async () => {
    const usmDir = makeUsmDir();
    const { count, regenerate } = makeCounter();
    stop = watchUsmDir(usmDir, regenerate);

    await settleAndReset(count);
    const existing = path.join(usmDir, "features", "existing-area", "existing.usm");
    fs.appendFileSync(existing, "\n# edited\n");

    await waitForCalls(count, 1);
    expect(count.value).toBe(1);
  });

  it("regenerates when a new .usm file is added to an EXISTING subdirectory", async () => {
    const usmDir = makeUsmDir();
    const { count, regenerate } = makeCounter();
    stop = watchUsmDir(usmDir, regenerate);

    await settleAndReset(count);
    fs.writeFileSync(
      path.join(usmDir, "features", "existing-area", "second.usm"),
      [
        "$id: test/second",
        "$type: feature",
        "$version: 1",
        "summary: Second.",
        "$system: test/system",
        "$service: test/svc",
        "intent: x",
      ].join("\n"),
      "utf-8",
    );

    await waitForCalls(count, 1);
    expect(count.value).toBe(1);
  });

  it("regenerates when a new .usm file is added to a NEWLY-CREATED subdirectory (#25.3 regression)", async () => {
    const usmDir = makeUsmDir();
    const { count, regenerate } = makeCounter();
    stop = watchUsmDir(usmDir, regenerate);

    await settleAndReset(count);
    // Create a brand-new subdirectory AND a .usm file inside it — the exact
    // scenario the old walk-and-watch missed (the new dir had no watcher).
    const newAreaDir = path.join(usmDir, "features", "brand-new-area");
    fs.mkdirSync(newAreaDir, { recursive: true });
    fs.writeFileSync(
      path.join(newAreaDir, "new-feature.usm"),
      [
        "$id: test/new-feature",
        "$type: feature",
        "$version: 1",
        "summary: New feature in a new directory.",
        "$system: test/system",
        "$service: test/svc",
        "intent: x",
      ].join("\n"),
      "utf-8",
    );

    await waitForCalls(count, 1);
    expect(count.value).toBe(1);
  });

  it("does NOT regenerate when a non-.usm file is edited", async () => {
    const usmDir = makeUsmDir();
    const { count, regenerate } = makeCounter();
    stop = watchUsmDir(usmDir, regenerate);

    await settleAndReset(count);
    fs.appendFileSync(path.join(usmDir, "notes.md"), "more notes\n");

    // Wait beyond the debounce window to confirm no regeneration fires.
    await new Promise((r) => setTimeout(r, 800));
    expect(count.value).toBe(0);
  });

  it("stops watching when the cleanup function is called", async () => {
    const usmDir = makeUsmDir();
    const { count, regenerate } = makeCounter();
    stop = watchUsmDir(usmDir, regenerate);

    // Let the startup burst settle, THEN stop, then edit — no regen.
    await settleAndReset(count);
    stop();
    await new Promise((r) => setTimeout(r, 150));
    const existing = path.join(usmDir, "features", "existing-area", "existing.usm");
    fs.appendFileSync(existing, "\n# edited after stop\n");

    await new Promise((r) => setTimeout(r, 800));
    expect(count.value).toBe(0);
  });
});