import { describe, it, expect } from "vitest";
import { parseUsm, findMissingListIds, parseUsmFileWithWarnings } from "../src/parse.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("findMissingListIds (issue #13 parse-integrity check)", () => {
  it("reports nothing for a well-formed feature", () => {
    const yaml = `$schema: https://usm.dev/schema/v1.json
$id: test-org/ok
$type: feature
$version: 1
summary: Fine
$system: test-org/system
$service: test-org/svc
intent: Fine
contracts:
  - id: one
    description: First
    must_have: [a]
  - id: two
    description: >-
      A long folded description that spans multiple lines and mentions
      id: not-a-real-entry inside the text — should not false-positive
      because it is inside an indented block scalar.
    must_have: [b]
flows:
  - id: main
    name: Main
    steps:
      - id: s1
        action: do
`;
    const parsed = parseUsm(yaml);
    expect(findMissingListIds(yaml, parsed)).toEqual([]);
  });

  it("detects a list entry absorbed into a block scalar", () => {
    // A pasted-in entry indented at/inside the description's block-scalar
    // indent becomes description TEXT — it never parses as a contract.
    const yaml = `$schema: https://usm.dev/schema/v1.json
$id: test-org/swallowed
$type: feature
$version: 1
summary: Swallowed contract
$system: test-org/system
$service: test-org/svc
intent: Test
contracts:
  - id: big-one
    description: >-
      A very long description with a tree diagram.
      taxonomy-tree
      - id: taxonomy-tree-current-state
        description: pasted at the wrong indent, absorbed into the scalar
    must_have: [x]
  - id: real-second
    description: >-
      A properly indented second contract.
    must_have: [y]
`;
    const parsed = parseUsm(yaml);
    const parsedIds = (parsed.contracts as Array<{ id: string }>).map((c) => c.id);
    // Confirm the swallow actually happened in this fixture
    expect(parsedIds).toEqual(["big-one", "real-second"]);
    expect(parsedIds).not.toContain("taxonomy-tree-current-state");
    const missing = findMissingListIds(yaml, parsed);
    expect(missing).toContainEqual({ field: "contracts", id: "taxonomy-tree-current-state" });
    expect(missing).not.toContainEqual({ field: "contracts", id: "real-second" });
  });

  it("parseUsmFileWithWarnings surfaces a human-readable warning", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-parse-warn-"));
    const file = path.join(dir, "swallowed.usm");
    fs.writeFileSync(file, `$id: test-org/swallowed2
$type: feature
$version: 1
summary: Swallowed
$system: test-org/system
$service: test-org/svc
intent: Test
contracts:
  - id: keep
    description: >-
      base
      swallowed:
      - id: ghost-entry
    must_have: [x]
`);
    const { warnings } = parseUsmFileWithWarnings(file);
    expect(warnings.some((w) => w.includes("ghost-entry") && w.includes("contracts"))).toBe(true);
  });
});
