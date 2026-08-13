// Internal DSL builder — fluent TypeScript that compiles to validated .usm.
//
// Fowler's expression-builder pattern over the USM semantic model: chainable
// methods populate a plain object; build() serialises to YAML and validates
// against the v1 schema (the same validation the MCP write tools enforce).
// The YAML/JSON path stays first-class — this is a frontend, not a store.
//
//   const spec = defineFeature("org/login", { system: "org/system", service: "org/web" })
//     .summary("Password login")
//     .intent("Users need to authenticate")
//     .flow("happy-path", (f) => f.step("s1", "receive", "credentials"))
//     .contract("session-expiry", (c) => c.description("...").mustHave("tokens expire"))
//     .build();

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { validateUsm } from "../validate.js";
import { parseUsm } from "../parse.js";
import type { FeatureUsm, ServiceUsm, UsmFile } from "../types.js";

export interface BuildResult<T extends UsmFile = FeatureUsm> {
  yaml: string;
  object: T;
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

function serialize(obj: UsmFile): string {
  // Same conventions as the MCP write tools: clean key order via object
  // construction, 2-space indent, folded long lines at 100 cols.
  return yaml.dump(obj, { indent: 2, lineWidth: 100, noRefs: true, quotingType: '"' });
}

function buildResult<T extends UsmFile>(obj: T): BuildResult<T> {
  const validation = validateUsm(obj);
  return {
    yaml: serialize(obj),
    object: obj,
    valid: validation.valid,
    errors: (validation.errors ?? []).map((e) => ({ path: e.path, message: e.message })),
  };
}

// ─── Feature builder ─────────────────────────────────────────────────────────

export interface FlowStepInput {
  action?: string;
  target?: string;
}

export class FlowBuilder {
  private readonly steps: Array<{ id: string; action?: string; target?: string }> = [];
  constructor(private readonly flow: { id: string; name?: string; description?: string; steps: unknown[] }) {}

  step(id: string, actionOrInput?: string | FlowStepInput, target?: string): this {
    const input: FlowStepInput =
      typeof actionOrInput === "string" ? { action: actionOrInput, target } : (actionOrInput ?? {});
    this.steps.push({ id, action: input.action, target: input.target });
    return this;
  }

  /** @internal */
  finish(): { id: string; name?: string; description?: string; steps: unknown[] } {
    return { ...this.flow, steps: this.steps };
  }
}

export class ContractBuilder {
  private descriptionText?: string;
  private readonly items: string[] = [];

  constructor(private readonly contract: { id: string }) {}

  description(text: string): this {
    this.descriptionText = text;
    return this;
  }

  mustHave(...entries: string[]): this {
    this.items.push(...entries);
    return this;
  }

  /** @internal */
  finish(): { id: string; description?: string; must_have?: string[] } {
    return {
      id: this.contract.id,
      ...(this.descriptionText !== undefined ? { description: this.descriptionText } : {}),
      ...(this.items.length > 0 ? { must_have: this.items } : {}),
    };
  }
}

export class TestBuilder {
  private setupObj?: Record<string, unknown>;
  private readonly expectArr: Array<Record<string, unknown>> = [];

  constructor(private readonly test: { id: string }) {}

  setup(obj: Record<string, unknown>): this {
    this.setupObj = obj;
    return this;
  }

  expect(...assertions: Array<string | Record<string, unknown>>): this {
    this.expectArr.push(...assertions.map((a) => (typeof a === "string" ? { assertion: a } : a)));
    return this;
  }

  /** @internal */
  finish(): { id: string; setup?: Record<string, unknown>; expect?: Array<Record<string, unknown>> } {
    return {
      id: this.test.id,
      ...(this.setupObj !== undefined ? { setup: this.setupObj } : {}),
      ...(this.expectArr.length > 0 ? { expect: this.expectArr } : {}),
    };
  }
}

export type FeatureStatus = "planned" | "in-progress" | "built" | "deprecated";

export class FeatureBuilder {
  private readonly spec: Record<string, unknown>;

  private constructor(spec: Record<string, unknown>) {
    this.spec = spec;
  }

  /** Start a new feature spec. Required fields are absent until set — build()
   * reports schema errors for anything missing. */
  static create(id: string, refs: { system: string; service: string }): FeatureBuilder {
    return new FeatureBuilder({
      $schema: "https://usm.dev/schema/v1.json",
      $id: id,
      $type: "feature",
      $version: 1,
      $last_updated: new Date().toISOString().slice(0, 10),
      status: "planned",
      $system: refs.system,
      $service: refs.service,
    });
  }

  /** Adopt an existing parsed feature (or a plain object) for extension. */
  static adopt(existing: FeatureUsm): FeatureBuilder {
    return new FeatureBuilder({ ...existing });
  }

  summary(text: string): this {
    this.spec.summary = text;
    return this;
  }

  intent(text: string): this {
    this.spec.intent = text;
    return this;
  }

  status(status: FeatureStatus): this {
    this.spec.status = status;
    return this;
  }

  flow(id: string, nameOrFn?: string | ((f: FlowBuilder) => void), maybeFn?: (f: FlowBuilder) => void): this {
    const name = typeof nameOrFn === "string" ? nameOrFn : id; // schema requires name — default to id
    const fn = typeof nameOrFn === "function" ? nameOrFn : maybeFn;
    const builder = new FlowBuilder({ id, name, steps: [] });
    fn?.(builder);
    const flows = Array.isArray(this.spec.flows) ? (this.spec.flows as unknown[]) : [];
    const idx = flows.findIndex((f) => (f as { id?: string })?.id === id);
    const finished = builder.finish();
    if (idx >= 0) flows[idx] = finished;
    else flows.push(finished);
    this.spec.flows = flows;
    return this;
  }

  contract(id: string, fnOrDescription?: string | ((c: ContractBuilder) => void)): this {
    const builder = new ContractBuilder({ id });
    if (typeof fnOrDescription === "string") builder.description(fnOrDescription);
    else fnOrDescription?.(builder);
    const contracts = Array.isArray(this.spec.contracts) ? (this.spec.contracts as unknown[]) : [];
    const idx = contracts.findIndex((c) => (c as { id?: string })?.id === id);
    const finished = builder.finish();
    if (idx >= 0) contracts[idx] = finished;
    else contracts.push(finished);
    this.spec.contracts = contracts;
    return this;
  }

  test(id: string, fn?: (t: TestBuilder) => void): this {
    const builder = new TestBuilder({ id });
    fn?.(builder);
    const tests = Array.isArray(this.spec.tests) ? (this.spec.tests as unknown[]) : [];
    const idx = tests.findIndex((t) => (t as { id?: string })?.id === id);
    const finished = builder.finish();
    if (idx >= 0) tests[idx] = finished;
    else tests.push(finished);
    this.spec.tests = tests;
    return this;
  }

  decision(id: string, d: { decision: string; rationale?: string; status?: string }): this {
    const decisions = Array.isArray(this.spec.decisions) ? (this.spec.decisions as unknown[]) : [];
    const idx = decisions.findIndex((x) => (x as { id?: string })?.id === id);
    const entry = { id, decision: d.decision, ...(d.rationale ? { rationale: d.rationale } : {}), ...(d.status ? { status: d.status } : {}) };
    if (idx >= 0) decisions[idx] = entry;
    else decisions.push(entry);
    this.spec.decisions = decisions;
    return this;
  }

  seeAlso(...ids: string[]): this {
    this.spec.see_also = ids;
    return this;
  }

  implementation(primary: string, testCode?: string): this {
    this.spec.implementation = { primary, ...(testCode ? { test_code: testCode, test_code_status: "generated" } : {}) };
    return this;
  }

  build(): BuildResult<FeatureUsm> {
    return buildResult(this.spec as unknown as FeatureUsm);
  }
}

// ─── Service builder ─────────────────────────────────────────────────────────

export type ServiceType = ServiceUsm["type"];

export class ServiceBuilder {
  private readonly spec: Record<string, unknown>;

  private constructor(spec: Record<string, unknown>) {
    this.spec = spec;
  }

  static create(id: string, refs: { system: string; type: ServiceType; runtime: string }): ServiceBuilder {
    return new ServiceBuilder({
      $schema: "https://usm.dev/schema/v1.json",
      $id: id,
      $type: "service",
      $version: 1,
      $last_updated: new Date().toISOString().slice(0, 10),
      $system: refs.system,
      type: refs.type,
      runtime: refs.runtime,
    });
  }

  static adopt(existing: ServiceUsm): ServiceBuilder {
    return new ServiceBuilder({ ...existing });
  }

  name(name: string): this {
    this.spec.name = name;
    return this;
  }

  summary(text: string): this {
    this.spec.summary = text;
    return this;
  }

  port(port: number): this {
    this.spec.port = port;
    return this;
  }

  paths(...paths: string[]): this {
    this.spec.paths = paths;
    return this;
  }

  dependsOn(...ids: string[]): this {
    this.spec.depends_on = ids;
    return this;
  }

  techStack(stack: Record<string, string>): this {
    this.spec.tech_stack = { ...(this.spec.tech_stack as object | undefined ?? {}), ...stack };
    return this;
  }

  build(): BuildResult<ServiceUsm> {
    return buildResult(this.spec as unknown as ServiceUsm);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function defineFeature(id: string, refs: { system: string; service: string }): FeatureBuilder {
  return FeatureBuilder.create(id, refs);
}

export function defineService(id: string, refs: { system: string; type: ServiceType; runtime: string }): ServiceBuilder {
  return ServiceBuilder.create(id, refs);
}

/**
 * Write a built spec to disk — refuses invalid specs, writes atomically.
 * Returns the absolute path written, or null when refused.
 */
export function writeFeature(result: BuildResult, filePath: string): string | null {
  if (!result.valid) {
    return null;
  }
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const tmp = absolute + ".tmp";
  fs.writeFileSync(tmp, result.yaml, "utf-8");
  fs.renameSync(tmp, absolute);
  return absolute;
}

export { parseUsm as parseSpec };
