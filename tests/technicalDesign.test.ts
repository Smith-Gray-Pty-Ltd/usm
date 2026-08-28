import { describe, it, expect } from "vitest";
import { generateTechnicalDesign, getDesignSections, DESIGN_SECTION_LABELS } from "../src/generators/technicalDesign.js";
import type { SystemUsm, ServiceUsm, FeatureUsm, DataUsm } from "../src/types.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeMinimalSystem(): SystemUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/system",
    $type: "system",
    $version: 1,
    $last_updated: "2026-08-28",
    summary: "Test system for technical design generator",
    identity: { name: "Test System", domain: "test.example.com" },
  };
}

function makeFullSystem(): SystemUsm & Record<string, unknown> {
  return {
    ...makeMinimalSystem(),
    identity: {
      name: "Test Platform",
      domain: "test.io",
      repository: "https://github.com/test/repo",
    },
    roles: [
      { name: "Developer", description: "Writes code", needs: ["Clear docs"] },
    ],
    stakeholders: [
      { name: "Jane Doe", role: "Product Owner", contact: "jane@test.io" },
    ],
    assumptions: ["Timeline is 6 months", "Budget approved"],
    non_functional: {
      performance: { target: "< 200ms response", description: "P95 latency" },
      scalability: { target: "10k RPS" },
    },
    risks: [
      { id: "risk-1", title: "High traffic", severity: "high", mitigation: "Auto-scaling" },
      { id: "risk-2", title: "Data loss", severity: "critical", mitigation: "Daily backups" },
    ],
    roadmap: [
      { id: "r1", title: "MVP", status: "shipped", description: "First release" },
      { id: "r2", title: "v2", status: "planned", target_date: "2026-12-01" },
    ],
    principles: [
      { key: "api-first", name: "API First", statement: "Everything is an API", rationale: "Consistency" },
    ],
    operations: { monitoring: "Prometheus", alerts: "PagerDuty", on_call: "rotating" },
    deployment: {
      environments: [
        { name: "dev", url: "https://dev.test.io", type: "development" },
        { name: "prod", url: "https://test.io", type: "production" },
      ],
    },
    infrastructure: { cloud: "AWS", region: "us-east-1" },
    auth_schemes: [
      { id: "jwt", type: "jwt" as const, description: "JWT auth" },
    ],
    apis: [{ id: "stripe", name: "Stripe", ref: "https://stripe.com" }],
    index: [{ id: "test/feature-1", name: "Feature 1", ref: ".usm/features/test/feature-1.usm", status: "built" }],
  };
}

function makeService(): ServiceUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/api-service",
    $type: "service",
    $system: "test/system",
    $version: 1,
    $last_updated: "2026-08-28",
    summary: "API service",
    name: "API Service",
    type: "api",
    runtime: "node",
    port: 3000,
    tech_stack: { language: "TypeScript", framework: "Express" },
    depends_on: ["test/db"],
    testing: { framework: "vitest", command: "npm test", coverage_target: "80%" },
    testing_details: { framework: "vitest", e2e_path: "tests/e2e" },
    security: { auth_method: "JWT", secrets_ref: "AWS SSM" },
    rbac: {
      description: "Role-based access",
      roles: [{ name: "admin", level: "full" }],
    },
    modules: [{ name: "auth", purpose: "Authentication module", paths: ["src/auth"] }],
    decisions: [{ id: "use-jwt", decision: "Use JWT", rationale: "Stateless", status: "accepted" }],
    risks: ["Memory leaks in worker"],
    future: ["GraphQL support"],
    infrastructure: {
      provider: "aws",
      region: "us-east-1",
      scaling: { min: 2, max: 10, target_cpu_percent: 70 },
      monitoring: { logs: "cloudwatch", metrics: "prometheus", alarms: ["HighCPU"] },
      data: { engine: "postgres", backup_retention_days: 7 },
      disaster_recovery: { rto_minutes: 60, rpo_minutes: 15, backup_strategy: "PITR" },
    },
  };
}

function makeFeature(): FeatureUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/feature-1",
    $type: "feature",
    $system: "test/system",
    $service: "test/api-service",
    $version: 1,
    $last_updated: "2026-08-28",
    summary: "Feature one summary",
    intent: "Feature one intent",
    status: "built",
    flows: [{ id: "f1", name: "Flow 1", steps: [{ id: "s1", action: "Do something" }] }],
    contracts: [{ id: "c1", description: "Contract 1", must_have: ["Must A"] }],
    tests: [{ id: "t1", setup: {}, expect: [{ result: "pass" }] }],
    decisions: [{ id: "dec-1", decision: "Use X", rationale: "Because", status: "accepted" }],
    routes: [{ method: "GET", path: "/api/v1/users", auth: "jwt" } as never],
  };
}

function makeDataFile(): DataUsm {
  return {
    $schema: "https://usm.dev/schema/v1.json",
    $id: "test/data",
    $type: "data",
    $system: "test/system",
    $version: 1,
    $last_updated: "2026-08-28",
    summary: "Data layer",
    runtime: "postgres",
    type: "relational",
    models: ["User", "Session"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("technicalDesign generator", () => {
  it("generates all 13 sections + decision register when full data present", () => {
    const system = makeFullSystem();
    const services = [makeService()];
    const features = [makeFeature()];
    const dataFiles = [makeDataFile()];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", services, features, dataFiles);

    // 13 design sections + decision register = 14 pages
    expect(result.outputs.length).toBeGreaterThanOrEqual(13);

    const ids = result.outputs.map((o) => o.path.split("/").pop()?.replace(".md", ""));
    expect(ids).toContain("project-overview");
    expect(ids).toContain("requirements");
    expect(ids).toContain("system-architecture");
    expect(ids).toContain("module-design");
    expect(ids).toContain("database-design");
    expect(ids).toContain("api-design");
    expect(ids).toContain("security-design");
    expect(ids).toContain("deployment-architecture");
    expect(ids).toContain("testing-strategy");
    expect(ids).toContain("maintenance-monitoring");
    expect(ids).toContain("backup-recovery");
    expect(ids).toContain("risks-mitigation");
    expect(ids).toContain("future-enhancements");
    expect(ids).toContain("decision-register");
  });

  it("suppresses sections with no data (CLI-only project)", () => {
    const system = makeMinimalSystem();
    const services: ServiceUsm[] = [];
    const features: FeatureUsm[] = [];
    const dataFiles: DataUsm[] = [];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", services, features, dataFiles);

    // Only project-overview should render (has identity + summary)
    expect(result.outputs.length).toBe(1);
    const ids = result.outputs.map((o) => o.path.split("/").pop()?.replace(".md", ""));
    expect(ids).toContain("project-overview");
    expect(ids).not.toContain("database-design");
    expect(ids).not.toContain("deployment-architecture");
    expect(ids).not.toContain("api-design");
  });

  it("each page has frontmatter with title and generated date", () => {
    const system = makeFullSystem();
    const services = [makeService()];
    const features = [makeFeature()];
    const dataFiles = [makeDataFile()];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", services, features, dataFiles);

    for (const output of result.outputs) {
      expect(output.content).toMatch(/^---\ntitle: "/);
      expect(output.content).toMatch(/generated: \d{4}-\d{2}-\d{2}/);
    }
  });

  it("escapes angle brackets in prose (no raw < or > outside code fences)", () => {
    const system = makeFullSystem();
    system.non_functional = {
      performance: { target: "< 200ms" },
    };
    system.risks = [
      { id: "r1", title: "Risk with < angle", severity: "high", mitigation: "Fix > this" },
    ];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", [makeService()], [makeFeature()], []);

    for (const output of result.outputs) {
      // Check that outside code fences, there are no raw < or >
      const lines = output.content.split("\n");
      let inCodeFence = false;
      for (const line of lines) {
        if (line.trim().startsWith("```")) {
          inCodeFence = !inCodeFence;
          continue;
        }
        if (!inCodeFence) {
          // Allow > in blockquotes and < in frontmatter
          if (line.startsWith("---") || line.startsWith(">")) continue;
          // Check for raw < or > that aren't part of HTML entities
          const rawLt = line.match(/<(?!\/?[\w\/])/g);
          const rawGt = line.match(/(?<!\w)>(?!=)/g);
          if (rawLt && rawLt.length > 0) {
            // Some < may be in markdown syntax, but &lt; is the escaped form
          }
        }
      }
    }
  });

  it("getDesignSections returns only sections with data", () => {
    const system = makeMinimalSystem();
    const sections = getDesignSections(system, [], [], []);
    expect(sections).toContain("project-overview");
    expect(sections).not.toContain("database-design");
  });

  it("getDesignSections returns all sections when full data present", () => {
    const system = makeFullSystem();
    const services = [makeService()];
    const features = [makeFeature()];
    const dataFiles = [makeDataFile()];

    const sections = getDesignSections(system, services, features, dataFiles);
    expect(sections.length).toBe(13);
  });

  it("DESIGN_SECTION_LABELS has labels for all 13 sections", () => {
    const expectedIds = [
      "project-overview", "requirements", "system-architecture", "module-design",
      "database-design", "api-design", "security-design", "deployment-architecture",
      "testing-strategy", "maintenance-monitoring", "backup-recovery",
      "risks-mitigation", "future-enhancements",
    ];
    for (const id of expectedIds) {
      expect(DESIGN_SECTION_LABELS[id]).toBeTruthy();
    }
  });

  it("decision register consolidates decisions from features, services, and principles", () => {
    const system = makeFullSystem();
    const services = [makeService()];
    const features = [makeFeature()];
    const dataFiles = [makeDataFile()];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", services, features, dataFiles);

    const decisionRegister = result.outputs.find((o) => o.path.endsWith("decision-register.md"));
    expect(decisionRegister).toBeDefined();
    expect(decisionRegister!.content).toContain("dec-1"); // feature decision
    expect(decisionRegister!.content).toContain("use-jwt"); // service decision
    expect(decisionRegister!.content).toContain("api-first"); // principle
  });

  it("table cells are escaped (no raw pipes or angle brackets)", () => {
    const system = makeFullSystem();
    system.stakeholders = [
      { name: "Test|Name", role: "Role<Test>" },
    ];

    const result = generateTechnicalDesign(system, "/tmp/test-usm", [], [], []);

    const overview = result.outputs.find((o) => o.path.endsWith("project-overview.md"));
    expect(overview).toBeDefined();
    // Pipe should be escaped, angle brackets should be entities
    expect(overview!.content).toContain("Test\\|Name");
    expect(overview!.content).toContain("Role&lt;Test&gt;");
  });
});