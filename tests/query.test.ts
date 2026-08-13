import { describe, it, expect } from "vitest";
import { parseQuery, runQuery, evalExpr, QueryParseError } from "../src/query/index.js";

const FILES = [
  {
    file: {
      $schema: "x", $id: "org/alpha", $type: "feature", $version: 1,
      status: "planned", summary: "Alpha authentication feature",
      $system: "org/system", $service: "org/web",
      intent: "test", contracts: [], flows: [], tests: [],
    },
    path: "/tmp/alpha.usm",
  },
  {
    file: {
      $schema: "x", $id: "org/beta", $type: "feature", $version: 2,
      status: "built", summary: "Beta ingestion pipeline",
      $system: "org/system", $service: "org/api",
      intent: "test",
      contracts: [{ id: "c1" }, { id: "c2" }],
      flows: [{ id: "f1" }],
      tests: [],
    },
    path: "/tmp/beta.usm",
  },
  {
    file: {
      $schema: "x", $id: "org/web", $type: "service", $version: 1,
      summary: "Web app service",
      $system: "org/system", type: "web-app", runtime: "node",
      decisions: [{ id: "d1", decision: "use vite", rationale: "speed" }],
    },
    path: "/tmp/web.usm",
  },
  {
    file: {
      $schema: "x", $id: "org/bug1", $type: "feedback", $version: 1,
      kind: "bug", severity: "high", summary: "Something broke",
      status: "open", reported_by: "agent:test",
    },
    path: "/tmp/bug1.usm",
  },
];

const ids = (hits: Array<{ file: Record<string, unknown> }>) => hits.map((h) => h.file.$id);

describe("usm/query-layer — parser", () => {
  it("parses selector-only queries", () => {
    expect(parseQuery("features")).toEqual({ selector: "features" });
    expect(parseQuery("all")).toEqual({ selector: "all" });
  });

  it("parses comparisons, booleans, parens, has, and contains", () => {
    expect(parseQuery("features where status = planned").predicate).toEqual({
      kind: "cmp", field: "status", op: "=", value: "planned",
    });
    const q = parseQuery("features where contracts > 0 and not (status = deprecated)");
    expect(q.predicate?.kind).toBe("and");
    const s = parseQuery("all where summary ~ auth");
    expect(s.predicate).toEqual({ kind: "cmp", field: "summary", op: "~", value: "auth" });
    const h = parseQuery("services where has decisions");
    expect(h.predicate).toEqual({ kind: "has", field: "decisions" });
  });

  it("rejects malformed queries with position info", () => {
    expect(() => parseQuery("features where")).toThrow(QueryParseError);
    expect(() => parseQuery("features where status =")).toThrow(/position/i);
    expect(() => parseQuery("wibble")).toThrow(/selector/i);
    expect(() => parseQuery("features and")).toThrow(/'where'/);
    expect(() => parseQuery("features where (status = planned")).toThrow(/expected '\)'/i);
  });
});

describe("usm/query-layer — evaluator", () => {
  it("filters by selector and equality", () => {
    expect(ids(runQuery("features where status = planned", FILES))).toEqual(["org/alpha"]);
    expect(ids(runQuery("systems", FILES))).toEqual([]);
  });

  it("numeric comparisons apply to array lengths", () => {
    expect(ids(runQuery("features where contracts > 0", FILES))).toEqual(["org/beta"]);
    expect(ids(runQuery("features where contracts = 0", FILES))).toEqual(["org/alpha"]);
  });

  it("~ is case-insensitive contains; missing fields are false, not errors", () => {
    expect(ids(runQuery("all where summary ~ AUTH", FILES))).toEqual(["org/alpha"]);
    expect(ids(runQuery("feedback where severity = high", FILES))).toEqual(["org/bug1"]);
    expect(ids(runQuery("features where severity = high", FILES))).toEqual([]); // no severity on features
  });

  it("has checks existence and non-emptiness", () => {
    expect(ids(runQuery("services where has decisions", FILES))).toEqual(["org/web"]);
    expect(ids(runQuery("features where has contracts", FILES))).toEqual(["org/beta"]); // alpha's array is empty
  });

  it("boolean composition and precedence (not > and > or)", () => {
    expect(ids(runQuery("features where status = planned or status = built", FILES))).toEqual(["org/alpha", "org/beta"]);
    expect(ids(runQuery("features where status = built and contracts > 1 and not (status = deprecated)", FILES))).toEqual(["org/beta"]);
    expect(ids(runQuery("all where type = web-app or version >= 2", FILES))).toEqual(["org/beta", "org/web"]);
  });

  it("evalExpr handles not/or directly", () => {
    const f = FILES[0].file;
    expect(evalExpr({ kind: "not", expr: { kind: "has", field: "contracts" } }, f)).toBe(true);
    expect(evalExpr({ kind: "or", left: { kind: "cmp", field: "status", op: "=", value: "built" }, right: { kind: "has", field: "intent" } }, f)).toBe(true);
  });
});
