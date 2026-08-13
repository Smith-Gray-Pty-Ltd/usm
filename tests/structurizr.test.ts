import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateStructurizrDslContent } from "../src/generators/structurizr.js";
import { importStructurizrWorkspace } from "../src/import/structurizr.js";
import { parseUsmFile } from "../src/parse.js";
import type { SystemUsm, ServiceUsm, FeatureUsm } from "../src/types.js";

const WORKSPACE_JSON = JSON.stringify({
  model: {
    softwareSystems: [
      {
        id: "1",
        name: "Acme Platform",
        description: "The Acme ecommerce platform",
        containers: [
          { id: "10", name: "Web Storefront", description: "Customer-facing store", technology: "Next.js" },
          { id: "11", name: "Order Database", description: "Orders and line items", technology: "PostgreSQL", tags: "database" },
        ],
      },
    ],
  },
});

const SYSTEM: SystemUsm = {
  $schema: "https://usm.dev/schema/v1.json", $id: "acme/system", $type: "system", $version: 1,
  summary: "Acme platform", identity: { name: "Acme Platform", domain: "acme.com" },
};
const SERVICES: ServiceUsm[] = [
  { $schema: "x", $id: "acme/web", $type: "service", $version: 1, $system: "acme/system", summary: "Storefront", name: "Web Storefront", type: "web-app", runtime: "node" },
  { $schema: "x", $id: "acme/db", $type: "service", $version: 1, $system: "acme/system", summary: "Orders DB", name: "Order Database", type: "database", runtime: "postgres" },
];
const FEATURES: FeatureUsm[] = [
  { $schema: "x", $id: "acme/checkout", $type: "feature", $version: 1, $system: "acme/system", $service: "acme/web", summary: "Checkout flow", status: "built", intent: "x" },
];

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "usm-structurizr-"));
});

describe("usm/structurizr-bridge — export", () => {
  it("generates well-formed DSL with system, containers, and components", () => {
    const dsl = generateStructurizrDslContent(SYSTEM, SERVICES, FEATURES);
    expect(dsl).toContain('softwareSystem "Acme Platform"');
    expect(dsl).toContain('container "Web Storefront"');
    expect(dsl).toContain('component "Checkout"'); // feature as component under its service
    expect(dsl).toContain("systemLandscape");
    expect(dsl.match(/{/g)!.length).toBe(dsl.match(/}/g)!.length); // balanced braces
    expect(dsl).not.toContain('component "Checkout" {}'); // sanity
  });

  it("escapes quotes and newlines in names and descriptions", () => {
    const noisy: SystemUsm = { ...SYSTEM, identity: { name: 'Weird "Name"', domain: "x" }, summary: 'line1\nline2' };
    const dsl = generateStructurizrDslContent(noisy, [], []);
    expect(dsl).toContain('softwareSystem "Weird \\"Name\\""');
    expect(dsl).not.toMatch(/line1\nline2/);
  });
});

describe("usm/structurizr-bridge — import", () => {
  it("maps a workspace into a validating system.usm and service files", () => {
    const result = importStructurizrWorkspace(WORKSPACE_JSON, { root: dir, domain: "acme.com" });
    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(3); // system + 2 containers

    const system = parseUsmFile(path.join(dir, ".usm", "system.usm")) as SystemUsm;
    expect(system.identity.name).toBe("Acme Platform");
    expect(system.$id).toBe("acme-platform/system");

    const web = parseUsmFile(path.join(dir, ".usm", "services", "web-storefront.usm")) as ServiceUsm;
    expect(web.$type).toBe("service");
    expect(web.type).toBe("web-app"); // inferred from Next.js
    expect(web.$system).toBe("acme-platform/system");

    const db = parseUsmFile(path.join(dir, ".usm", "services", "order-database.usm")) as ServiceUsm;
    expect(db.type).toBe("database"); // inferred from PostgreSQL + tags
  });

  it("refuses to overwrite existing files and honours --dry-run", () => {
    fs.mkdirSync(path.join(dir, ".usm"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".usm", "system.usm"), "existing");

    const blocked = importStructurizrWorkspace(WORKSPACE_JSON, { root: dir });
    expect(blocked.written).toHaveLength(0);
    expect(blocked.skipped).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, ".usm", "system.usm"), "utf-8")).toBe("existing");

    const dry = importStructurizrWorkspace(WORKSPACE_JSON, { root: dir, dryRun: true });
    expect(dry.planned.length).toBeGreaterThanOrEqual(3);
    expect(dry.written).toHaveLength(0);

    const forced = importStructurizrWorkspace(WORKSPACE_JSON, { root: dir, force: true });
    expect(forced.written.length).toBe(3);
    expect((parseUsmFile(path.join(dir, ".usm", "system.usm")) as SystemUsm).identity.name).toBe("Acme Platform");
  });

  it("rejects non-workspace JSON with a clear message", () => {
    expect(() => importStructurizrWorkspace("{\"nope\": true}", { root: dir })).toThrow(/model\.softwareSystems/);
    expect(() => importStructurizrWorkspace("not json", { root: dir })).toThrow(/not valid JSON/);
  });

  it("round-trips: imported specs export back to the same container set", () => {
    const imported = importStructurizrWorkspace(WORKSPACE_JSON, { root: dir, force: true });
    expect(imported.errors).toEqual([]);

    const system = parseUsmFile(path.join(dir, ".usm", "system.usm")) as SystemUsm;
    const services = imported.written
      .filter((w) => w.type === "service")
      .map((w) => parseUsmFile(w.path) as ServiceUsm);

    const dsl = generateStructurizrDslContent(system, services, []);
    expect(dsl).toContain('softwareSystem "Acme Platform"');
    expect(dsl).toContain('container "Web Storefront"');
    expect(dsl).toContain('container "Order Database"');
  });
});
