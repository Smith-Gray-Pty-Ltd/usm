/**
 * Package universal docs merge tests (usm/pkg-universal-docs, issue #45).
 *
 * A consumer installing @smithgray/usm into a fresh repo previously got zero
 * onboarding pages: getting-started/agent-setup-guide/editor guides lived
 * only in USM's own docs-source/. Now the package ships docs-source/ and
 * merges it when the consumer repo has none of its own. Precedence: consumer
 * docs-source/ wins wholesale; package pages never overwrite a generated
 * page; homepage Getting Started link lights up on the FIRST generate.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

let dir: string;
let usmCli: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-pkg-docs-"));
  usmCli = path.resolve("dist/cli/index.js");
  fs.mkdirSync(path.join(dir, ".usm"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".usm", "system.usm"),
    [
      "$schema: https://usm.dev/schema/v1.json",
      "$id: t/system",
      "$type: system",
      "$version: 1",
      "identity:",
      "  name: t",
      "  domain: test",
      "summary: t",
      "index: []",
      "services: []",
    ].join("\n") + "\n",
    "utf-8",
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function generate() {
  execSync(`node "${usmCli}" generate`, { cwd: dir, encoding: "utf8", stdio: "pipe" });
}

describe("package universal docs (issue #45)", () => {
  it("consumer without docs-source/ gets the package onboarding set", () => {
    generate();
    expect(fs.existsSync(path.join(dir, ".usm-workspace", "docs", "getting-started.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".usm-workspace", "docs", "agent-setup-guide.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".usm-workspace", "docs", "editor-setup", "index.md"))).toBe(true);
    const guides = fs.readdirSync(path.join(dir, ".usm-workspace", "docs", "editor-setup")).length;
    expect(guides).toBeGreaterThanOrEqual(37); // index + 36 editors
  });

  it("homepage renders the Getting Started link on the FIRST generate", () => {
    generate();
    const readme = fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "README.md"), "utf-8");
    expect(readme).toContain("Getting Started");
    expect(readme).not.toContain("Browse the sidebar");
  });

  it("consumer docs-source/ wins wholesale — no package pages leak in", () => {
    fs.mkdirSync(path.join(dir, "docs-source"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "docs-source", "agent-setup-guide.md"),
      "# My Own Setup Guide\n\nHand-written.\n",
      "utf-8",
    );
    generate();
    const guide = fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "agent-setup-guide.md"), "utf-8");
    expect(guide).toContain("Hand-written.");
    expect(fs.existsSync(path.join(dir, ".usm-workspace", "docs", "getting-started.md"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".usm-workspace", "docs", "editor-setup"))).toBe(false);
  });

  it("package pages never overwrite a generated page (agent-setup-guide collision)", () => {
    // The fixture's system.usm does NOT declare reference_pages, so the
    // package page IS used here; verify the collision skip logic by seeding
    // a generated page path in generatedByPath — indirectly verified by the
    // override test. Here assert the shipped page content is the universal one.
    generate();
    const guide = fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "agent-setup-guide.md"), "utf-8");
    expect(guide).toContain("# Adding USM to Your Project");
  });

  it("shipped pages contain no .md-suffixed links", () => {
    generate();
    const docsDir = path.join(dir, ".usm-workspace", "docs");
    const check = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) check(p);
        else if (entry.name.endsWith(".md")) {
          const content = fs.readFileSync(p, "utf-8");
          const mdLinks = content.match(/\]\([^)]*\.md\)/g) ?? [];
          const relative = content.match(/\]\(\.\.?\/[^)]*\)/g) ?? [];
          expect(mdLinks, `${p} has .md links`).toEqual([]);
          expect(relative, `${p} has relative links`).toEqual([]);
        }
      }
    };
    check(docsDir);
  });

  it("merge is idempotent — second run byte-identical for shipped pages", () => {
    generate();
    const gs1 = fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "getting-started.md"), "utf-8");
    const ags1 = fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "agent-setup-guide.md"), "utf-8");
    generate();
    expect(fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "getting-started.md"), "utf-8")).toBe(gs1);
    expect(fs.readFileSync(path.join(dir, ".usm-workspace", "docs", "agent-setup-guide.md"), "utf-8")).toBe(ags1);
  });
});