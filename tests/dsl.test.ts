import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defineFeature,
  defineService,
  writeFeature,
  FeatureBuilder,
} from "../src/dsl/index.js";
import { parseUsm, parseUsmFile } from "../src/parse.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-dsl-test-"));
});

function fullFeature() {
  return defineFeature("test-org/login", { system: "test-org/system", service: "test-org/web" })
    .summary("Password login with session issuance")
    .intent("Users need to authenticate to reach protected resources")
    .status("in-progress")
    .flow("happy-path", "Happy path", (f) =>
      f.step("s1", "receive", "credentials")
       .step("s2", "validate", "credentials")
       .step("s3", "write", "session"))
    .contract("session-expiry", (c) =>
      c.description("Sessions must expire").mustHave("tokens expire in 24h", "refresh before expiry"))
    .test("happy-path-works", (t) =>
      t.setup({ valid_credentials: true }).expect("session issued", "user redirected"))
    .decision("jwt-over-sessions", { decision: "Use JWTs", rationale: "stateless" })
    .seeAlso("test-org/session-store")
    .implementation("src/auth/login.ts", "tests/login.test.ts");
}

describe("usm/internal-dsl-builder", () => {
  it("builds a valid feature and round-trips through YAML", () => {
    const result = fullFeature().build();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    const reparsed = parseUsm(result.yaml);
    expect(reparsed).toEqual(result.object);
  });

  it("populates the semantic model correctly", () => {
    const { object } = fullFeature().build();
    expect(object.$id).toBe("test-org/login");
    expect(object.$type).toBe("feature");
    expect(object.$system).toBe("test-org/system");
    expect(object.$service).toBe("test-org/web");
    expect(object.status).toBe("in-progress");
    expect(object.flows).toHaveLength(1);
    expect(object.flows![0].steps).toHaveLength(3);
    expect(object.flows![0].name).toBe("Happy path");
    expect(object.contracts![0].must_have).toHaveLength(2);
    expect(object.tests![0].expect).toHaveLength(2);
    expect(object.decisions![0].decision).toBe("Use JWTs");
  });

  it("reports invalid builds instead of failing silently", () => {
    const result = defineFeature("test-org/no-intent", { system: "test-org/system", service: "test-org/web" })
      .summary("Missing intent on purpose")
      .build();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("intent"))).toBe(true);
  });

  it("writeFeature refuses invalid specs and writes valid ones atomically", () => {
    const invalid = defineFeature("test-org/bad", { system: "s", service: "s" }).summary("no intent").build();
    expect(writeFeature(invalid, path.join(dir, "bad.usm"))).toBeNull();
    expect(fs.existsSync(path.join(dir, "bad.usm"))).toBe(false);

    const valid = fullFeature().build();
    const written = writeFeature(valid, path.join(dir, "login.usm"));
    expect(written).toBeTruthy();
    expect(parseUsmFile(written!)).toEqual(valid.object);
  });

  it("adopts an existing parsed spec and appends by id without dropping content", () => {
    const first = fullFeature().build();
    const adopted = FeatureBuilder.adopt(first.object);

    // Append a new flow, update the existing contract by id
    adopted
      .flow("error-path", (f) => f.step("e1", "show", "error"))
      .contract("session-expiry", (c) => c.description("Sessions must expire (revised)").mustHave("tokens expire in 24h"));

    const rebuilt = adopted.build();
    expect(rebuilt.valid).toBe(true);
    expect(rebuilt.object.flows).toHaveLength(2); // happy-path preserved + error-path
    expect(rebuilt.object.contracts).toHaveLength(1); // updated in place, not duplicated
    expect(rebuilt.object.contracts![0].description).toContain("revised");
    expect(rebuilt.object.tests).toHaveLength(1); // untouched
  });

  it("builds a schema-valid service", () => {
    const result = defineService("test-org/web", { system: "test-org/system", type: "web-app", runtime: "node" })
      .name("Web App")
      .summary("Customer-facing web application")
      .port(3000)
      .paths("apps/web")
      .techStack({ framework: "next" })
      .build();
    expect(result.valid).toBe(true);
    expect(result.object.type).toBe("web-app");
    expect(result.object.runtime).toBe("node");
    expect(parseUsm(result.yaml)).toEqual(result.object);
  });
});
