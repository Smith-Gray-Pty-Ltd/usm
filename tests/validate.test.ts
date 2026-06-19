import { describe, it, expect } from "vitest";
import { validateUsm, validateUsmFile } from "../src/validate.js";
import { parseUsm, parseUsmFile } from "../src/parse.js";
import path from "node:path";

const FIXTURES = path.resolve(__dirname, "../examples");
// SPEC_DIR points at this repo's own .usm/ scope (dogfooding).
// Falls back to the examples/ fixtures if .usm/ doesn't exist yet (e.g. CI before first scan).
const SPEC_DIR = path.resolve(__dirname, "../.usm");
const HAS_USM_SCOPE =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("node:fs").existsSync(SPEC_DIR);

describe("validateUsm", () => {
  it("validates a correct system file", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/system
$type: system
$version: 1
summary: "A test system for validation"
identity:
  name: Test
  domain: test.com
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(true);
  });

  it("validates a correct service file", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/svc
$type: service
$version: 1
summary: "A test service for validation"
$system: test/system
type: web-app
runtime: nextjs
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(true);
  });

  it("validates a correct feature file", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/feat
$type: feature
$version: 1
summary: "A test feature for validation"
$system: test/system
$service: test/svc
intent: "Users need this feature"
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(true);
  });

  it("rejects a file with missing required fields", () => {
    const yaml = `
$type: system
summary: "Missing fields"
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors && result.errors.length > 0).toBe(true);
  });

  it("rejects a file with invalid $type", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/bad
$type: invalid-type
$version: 1
summary: "Bad type"
identity:
  name: Test
  domain: test.com
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(false);
  });

  it("rejects a system file without identity", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/system
$type: system
$version: 1
summary: "Missing identity"
`;
    const parsed = parseUsm(yaml);
    const result = validateUsm(parsed);
    expect(result.valid).toBe(false);
  });
});

describe("validateUsmFile", () => {
  it("validates the example system.usm", () => {
    const result = validateUsmFile(path.join(FIXTURES, "system.usm"));
    expect(result.valid).toBe(true);
  });

  it("validates the example service.usm", () => {
    const result = validateUsmFile(path.join(FIXTURES, "service.usm"));
    expect(result.valid).toBe(true);
  });

  it("validates the example feature.usm", () => {
    const result = validateUsmFile(path.join(FIXTURES, "feature.usm"));
    expect(result.valid).toBe(true);
  });
});

describe("validateUsmFile — real spec files (dogfooded from this repo's .usm/)", () => {
  it.skipIf(!HAS_USM_SCOPE)("validates .usm/system.usm", () => {
    const result = validateUsmFile(path.join(SPEC_DIR, "system.usm"));
    expect(result.valid).toBe(true);
  });

  it.skipIf(!HAS_USM_SCOPE)("validates .usm/features/cli/init.usm", () => {
    const result = validateUsmFile(path.join(SPEC_DIR, "features/cli/init.usm"));
    expect(result.valid).toBe(true);
  });
});
