import { describe, it, expect } from "vitest";
import { validateUsm } from "../src/validate.js";
import { parseUsm, parseUsmFile } from "../src/parse.js";
import path from "node:path";
import { existsSync } from "node:fs";

const FIXTURES = path.resolve(__dirname, "../examples");
// SPEC_DIR points at this repo's own .usm/ scope (dogfooding).
// Falls back to the examples/ fixtures if .usm/ doesn't exist yet (e.g. CI before first scan).
const SPEC_DIR = path.resolve(__dirname, "../.usm");
const HAS_USM_SCOPE = existsSync(SPEC_DIR);

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

  // Regression test for issue #33: `$type: data` was advertised by the
  // TypeScript type surface (UsmFileType / DataUsm) but missing from the
  // schema, so validate rejected any file that declared it.
  describe("$type: data (issue #33)", () => {
    it("validates a minimal data file", () => {
      const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/models
$type: data
$version: 1
$system: test/system
summary: "A test data source for validation"
`;
      const result = validateUsm(parseUsm(yaml));
      expect(result.valid).toBe(true);
    });

    it("validates a fully-populated data file", () => {
      const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/models
$type: data
$version: 1
$system: test/system
name: Platform DB
summary: "The platform Postgres database accessed via Prisma"
type: postgres
runtime: prisma
port: 5432
schema_source: packages/db/prisma/schema.prisma
models:
  - User
modules:
  - name: User
    purpose: Account records
`;
      const result = validateUsm(parseUsm(yaml));
      expect(result.valid).toBe(true);
    });

    it("rejects a data file missing $system", () => {
      const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/models
$type: data
$version: 1
summary: "Missing the required $system field"
`;
      const result = validateUsm(parseUsm(yaml));
      expect(result.valid).toBe(false);
    });
  });

  // Anti-drift: every $type advertised by the schema's commonFields enum must
  // have a matching branch in oneOf, so the type surface and validator agree.
  it("every $type in the schema discriminator enum is accepted", () => {
    const discriminatorTypes = ["system", "service", "feature", "data", "feedback"];
    const minimalByType: Record<string, string> = {
      system: "identity:\n  name: T\n  domain: t.com",
      service: "$system: test/system\ntype: web-app\nruntime: node",
      feature: "$system: test/system\n$service: test/svc\nintent: Because.",
      data: "$system: test/system",
      feedback: "kind: bug\nseverity: low\nstatus: open\nreported_by: agent:test",
    };
    for (const t of discriminatorTypes) {
      const yaml = [
        "$schema: https://usm.dev/schema/v1.json",
        `$id: test/${t}`,
        `$type: ${t}`,
        "$version: 1",
        "summary: A generated minimal file for validation",
        minimalByType[t],
      ].join("\n");
      const result = validateUsm(parseUsm(yaml));
      expect(result.valid, `${t} should validate: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });
});

describe("validateUsmFile", () => {
  it("validates the example system.usm", () => {
    const result = validateUsm(parseUsmFile(path.join(FIXTURES, "system.usm")));
    expect(result.valid).toBe(true);
  });

  it("validates the example service.usm", () => {
    const result = validateUsm(parseUsmFile(path.join(FIXTURES, "service.usm")));
    expect(result.valid).toBe(true);
  });

  it("validates the example feature.usm", () => {
    const result = validateUsm(parseUsmFile(path.join(FIXTURES, "feature.usm")));
    expect(result.valid).toBe(true);
  });
});

describe("validateUsmFile — real spec files (dogfooded from this repo's .usm/)", () => {
  it.skipIf(!HAS_USM_SCOPE)("validates .usm/system.usm", () => {
    const result = validateUsm(parseUsmFile(path.join(SPEC_DIR, "system.usm")));
    expect(result.valid).toBe(true);
  });

  it.skipIf(!HAS_USM_SCOPE)("validates .usm/features/cli/init.usm", () => {
    const result = validateUsm(parseUsmFile(path.join(SPEC_DIR, "features/cli/init.usm")));
    expect(result.valid).toBe(true);
  });
});
