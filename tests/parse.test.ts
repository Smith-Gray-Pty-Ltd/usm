import { describe, it, expect } from "vitest";
import { parseUsm, parseUsmFile, isSystemFile, isServiceFile, isFeatureFile } from "../src/parse.js";
import path from "node:path";

const FIXTURES = path.resolve(__dirname, "../examples");

describe("parseUsm", () => {
  it("parses a system .usm string", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/system
$type: system
$version: 1
summary: "A test system"
identity:
  name: Test
  domain: test.com
`;
    const result = parseUsm(yaml);
    expect(result.$type).toBe("system");
    expect(result.$id).toBe("test/system");
    expect(result.$version).toBe(1);
    if (isSystemFile(result)) {
      expect(result.identity.name).toBe("Test");
      expect(result.identity.domain).toBe("test.com");
    }
  });

  it("parses a service .usm string", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/svc
$type: service
$version: 2
summary: "A test service"
$system: test/system
type: web-app
runtime: nextjs
`;
    const result = parseUsm(yaml);
    expect(result.$type).toBe("service");
    if (isServiceFile(result)) {
      expect(result.runtime).toBe("nextjs");
      expect(result.$system).toBe("test/system");
    }
  });

  it("parses a feature .usm string", () => {
    const yaml = `
$schema: https://usm.dev/schema/v1.json
$id: test/feat
$type: feature
$version: 1
summary: "A test feature"
$system: test/system
$service: test/svc
intent: "Users need this feature"
`;
    const result = parseUsm(yaml);
    expect(result.$type).toBe("feature");
    if (isFeatureFile(result)) {
      expect(result.intent).toBe("Users need this feature");
    }
  });

  it("throws on invalid YAML", () => {
    expect(() => parseUsm("not: valid: yaml: [")).toThrow();
  });

  it("throws on non-object YAML", () => {
    expect(() => parseUsm("just a string")).toThrow();
  });
});

describe("parseUsmFile", () => {
  it("parses system.usm from disk", () => {
    const result = parseUsmFile(path.join(FIXTURES, "system.usm"));
    expect(result.$type).toBe("system");
    expect(isSystemFile(result)).toBe(true);
  });

  it("parses service.usm from disk", () => {
    const result = parseUsmFile(path.join(FIXTURES, "service.usm"));
    expect(result.$type).toBe("service");
    expect(isServiceFile(result)).toBe(true);
  });

  it("parses feature.usm from disk", () => {
    const result = parseUsmFile(path.join(FIXTURES, "feature.usm"));
    expect(result.$type).toBe("feature");
    expect(isFeatureFile(result)).toBe(true);
  });
});

describe("type guards", () => {
  it("isSystemFile returns true only for system files", () => {
    const sys = parseUsmFile(path.join(FIXTURES, "system.usm"));
    const svc = parseUsmFile(path.join(FIXTURES, "service.usm"));
    expect(isSystemFile(sys)).toBe(true);
    expect(isSystemFile(svc)).toBe(false);
  });

  it("isServiceFile returns true only for service files", () => {
    const sys = parseUsmFile(path.join(FIXTURES, "system.usm"));
    const svc = parseUsmFile(path.join(FIXTURES, "service.usm"));
    expect(isServiceFile(sys)).toBe(false);
    expect(isServiceFile(svc)).toBe(true);
  });

  it("isFeatureFile returns true only for feature files", () => {
    const feat = parseUsmFile(path.join(FIXTURES, "feature.usm"));
    const svc = parseUsmFile(path.join(FIXTURES, "service.usm"));
    expect(isFeatureFile(feat)).toBe(true);
    expect(isFeatureFile(svc)).toBe(false);
  });
});
