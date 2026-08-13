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
