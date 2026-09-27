import { describe, it, expect, beforeEach } from "vitest";
import { updateFeatureTool } from "../src/mcp/write.js";
import { parseUsmFile } from "../src/parse.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_FEATURE = `$schema: https://usm.dev/schema/v1.json
$id: test-org/my-feature
$type: feature
$version: 1
status: in-progress
summary: A feature with contracts
$system: test-org/system
$service: test-org/service
intent: Testing contract preservation
contracts:
  - id: keep-data
    description: This contract must survive updates
    must_have:
      - contracts preserved
  - id: second-contract
    description: Another one
    must_have:
      - also preserved
flows:
  - id: main-flow
    name: Main flow
    steps: []
tests: []
`;

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-write-test-"));
  file = path.join(dir, "test-feature.usm");
  fs.writeFileSync(file, BASE_FEATURE, "utf-8");
});

function readFeature() {
  return parseUsmFile(file) as {
    contracts?: Array<{ id: string; description: string }>;
    flows?: Array<{ id: string; name: string }>;
    status?: string;
    summary?: string;
  };
}

function resultJson(res: { content: Array<{ text: string }> }) {
  return JSON.parse(res.content[0].text);
}

describe("usm_update_feature", () => {
  it("preserves contracts on a scalar-only update (issue #14 regression)", async () => {
    const res = await updateFeatureTool({ path: file, fields: JSON.stringify({ status: "built" }) });
    const body = resultJson(res);
    expect(body.updated).toBe(true);
    const feature = readFeature();
    expect(feature.contracts?.map((c) => c.id)).toEqual(["keep-data", "second-contract"]);
    expect(feature.status).toBe("built");
  });

  it("merges a partial contracts array by id instead of replacing (issue #14 regression)", async () => {
    // The exact incident vector: agent passes ONLY the new contract, intending to add it.
    const res = await updateFeatureTool({
      path: file,
      fields: JSON.stringify({
        contracts: [{ id: "new-contract", description: "The new one", must_have: ["new thing"] }],
      }),
    });
    const body = resultJson(res);
    expect(body.updated).toBe(true);
    expect(body.merge_details.contracts).toMatchObject({ mode: "upsert-by-id", added: 1, updated: 0, preserved: 2 });

    const feature = readFeature();
    expect(feature.contracts?.map((c) => c.id)).toEqual(["keep-data", "second-contract", "new-contract"]);
  });

  it("updates an existing contract by id and preserves its siblings", async () => {
    const res = await updateFeatureTool({
      path: file,
      fields: JSON.stringify({
        contracts: [{ id: "keep-data", description: "Revised description", must_have: ["revised"] }],
      }),
    });
    const body = resultJson(res);
    expect(body.merge_details.contracts).toMatchObject({ mode: "upsert-by-id", added: 0, updated: 1, preserved: 1 });

    const feature = readFeature();
    expect(feature.contracts?.map((c) => c.id)).toEqual(["keep-data", "second-contract"]);
    expect(feature.contracts?.[0].description).toBe("Revised description");
  });

  it("replaces an array wholesale only when the replace param names it", async () => {
    const res = await updateFeatureTool({
      path: file,
      fields: JSON.stringify({
        contracts: [{ id: "only-one", description: "Replacement set", must_have: ["x"] }],
      }),
      replace: JSON.stringify(["contracts"]),
    });
    const body = resultJson(res);
    expect(body.updated).toBe(true);
    expect(body.merge_details.contracts.mode).toBe("replaced");

    const feature = readFeature();
    expect(feature.contracts?.map((c) => c.id)).toEqual(["only-one"]);
  });

  it("merges flows and tests by id as well", async () => {
    await updateFeatureTool({
      path: file,
      fields: JSON.stringify({
        flows: [{ id: "extra-flow", name: "Extra", steps: [] }],
        tests: [{ id: "t1", setup: {}, expect: [] }],
      }),
    });
    const feature = readFeature();
    expect(feature.flows?.map((f) => f.id)).toEqual(["main-flow", "extra-flow"]);
  });

  it("rejects replace listing a non-id-bearing field", async () => {
    const res = await updateFeatureTool({
      path: file,
      fields: JSON.stringify({ summary: "x" }),
      replace: JSON.stringify(["summary"]),
    });
    const body = resultJson(res);
    expect(res.isError).toBe(true);
    expect(body.error).toMatch(/replace/);
  });

  it("rejects immutable fields and leaves the file untouched", async () => {
    const before = fs.readFileSync(file, "utf-8");
    const res = await updateFeatureTool({
      path: file,
      fields: JSON.stringify({ $id: "evil/new-id" }),
    });
    expect(res.isError).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
  });

  it("still replaces non-id-bearing arrays like see_also directly", async () => {
    await updateFeatureTool({
      path: file,
      fields: JSON.stringify({ see_also: ["usm/mcp-write"] }),
    });
    const feature = readFeature() as { see_also?: string[] };
    expect(feature.see_also).toEqual(["usm/mcp-write"]);
  });
});

// ─── usm_update_system / usm_update_service merge semantics (issue #48) ──────

const BASE_SYSTEM = `$schema: https://usm.dev/schema/v1.json
$id: test-org/system
$type: system
$version: 1
summary: Test system
identity:
  name: Test
  domain: testing
index: []
services:
  - id: svc-1
    name: One
    ref: apps/one
    type: api
  - id: svc-2
    name: Two
    ref: apps/two
    type: api
local_development:
  package_manager: pnpm
  known_quirks:
    - id: q1
      title: Existing quirk
      description: keep me
`;

describe("usm_update_system merge semantics (issue #48)", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-sys-update-"));
    file = path.join(dir, "system.usm");
    fs.writeFileSync(file, BASE_SYSTEM, "utf-8");
  });

  function readSystem() {
    return parseUsmFile(file) as {
      services?: Array<{ id: string; name: string }>;
      local_development?: { package_manager?: string; known_quirks?: unknown[]; test_framework?: string };
    };
  }

  it("merges a partial services array by id — existing entries survive", async () => {
    const { updateSystemTool } = await import("../src/mcp/write.js");
    const res = await updateSystemTool({
      path: file,
      fields: JSON.stringify({ services: [{ id: "svc-3", name: "Three", ref: "apps/three", type: "api" }] }),
    });
    const body = JSON.parse(res.content[0].text);
    const system = readSystem();
    expect((system.services ?? []).map((s) => s.id)).toEqual(["svc-1", "svc-2", "svc-3"]);
    expect(body.merge_details.services).toMatchObject({ mode: "upsert-by-id", added: 1, updated: 0, preserved: 2 });
  });

  it("updates an existing service by id without duplicating", async () => {
    const { updateSystemTool } = await import("../src/mcp/write.js");
    await updateSystemTool({
      path: file,
      fields: JSON.stringify({ services: [{ id: "svc-1", name: "One Renamed", ref: "apps/one", type: "api" }] }),
    });
    const system = readSystem();
    expect((system.services ?? []).length).toBe(2);
    expect((system.services ?? []).find((s) => s.id === "svc-1")?.name).toBe("One Renamed");
  });

  it("supports replace for services when explicitly requested", async () => {
    const { updateSystemTool } = await import("../src/mcp/write.js");
    const res = await updateSystemTool({
      path: file,
      fields: JSON.stringify({ services: [{ id: "svc-x", name: "X", ref: "apps/x", type: "api" }] }),
      replace: JSON.stringify(["services"]),
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.merge_details.services.mode).toBe("replaced");
    const system = readSystem();
    expect((system.services ?? []).map((s) => s.id)).toEqual(["svc-x"]);
  });

  it("deep-merges a partial local_development object — siblings survive", async () => {
    const { updateSystemTool } = await import("../src/mcp/write.js");
    const res = await updateSystemTool({
      path: file,
      fields: JSON.stringify({ local_development: { test_framework: "vitest" } }),
    });
    const body = JSON.parse(res.content[0].text);
    const system = readSystem();
    expect(system.local_development?.package_manager).toBe("pnpm");
    expect(system.local_development?.test_framework).toBe("vitest");
    expect((system.local_development?.known_quirks ?? []).length).toBe(1);
    expect(body.merge_details.local_development.mode).toBe("deep-merged");
  });
});

describe("usm_update_service merge semantics (issue #48)", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-svc-update-"));
    file = path.join(dir, "test-service.usm");
    fs.writeFileSync(
      file,
      `$schema: https://usm.dev/schema/v1.json
$id: test-org/my-service
$type: service
$version: 1
summary: Test service
$system: test-org/system
name: My Service
type: web-app
runtime: node
testing:
  framework: vitest
patterns: []
`,
      "utf-8",
    );
  });

  function readService() {
    return parseUsmFile(file) as {
      testing?: { framework?: string; coverage_target?: string };
      patterns?: Array<{ id: string; name: string }>;
    };
  }

  it("deep-merges a partial testing object — framework survives", async () => {
    const { updateServiceTool } = await import("../src/mcp/write.js");
    const res = await updateServiceTool({
      path: file,
      fields: JSON.stringify({ testing: { coverage_target: "80%" } }),
    });
    const body = JSON.parse(res.content[0].text);
    const svc = readService();
    expect(svc.testing?.framework).toBe("vitest");
    expect(svc.testing?.coverage_target).toBe("80%");
    expect(body.merge_details.testing.mode).toBe("deep-merged");
  });

  it("merges patterns by id — appends new, preserves existing", async () => {
    const { updateServiceTool } = await import("../src/mcp/write.js");
    await updateServiceTool({
      path: file,
      fields: JSON.stringify({ patterns: [{ id: "p-1", name: "Existing", description: "first" }] }),
    });
    await updateServiceTool({
      path: file,
      fields: JSON.stringify({ patterns: [{ id: "p-2", name: "Second", description: "next" }] }),
    });
    const svc = readService();
    expect((svc.patterns ?? []).map((p) => p.id)).toEqual(["p-1", "p-2"]);
  });

  it("modules merge by name (no id in schema)", async () => {
    const { updateServiceTool } = await import("../src/mcp/write.js");
    await updateServiceTool({
      path: file,
      fields: JSON.stringify({ modules: [{ name: "auth", purpose: "Auth handling" }] }),
    });
    await updateServiceTool({
      path: file,
      fields: JSON.stringify({ modules: [{ name: "billing", purpose: "Billing" }] }),
    });
    const svc = readService();
    const modules = (svc as unknown as { modules?: Array<{ name: string }> }).modules ?? [];
    expect(modules.map((m) => m.name)).toEqual(["auth", "billing"].slice(0, 2).map((n, i) => ["auth", "billing"][i]) as string[]).toEqual(["auth", "billing"]);
  });
});
