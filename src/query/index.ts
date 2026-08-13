// Query layer — a tiny predicate grammar over parsed .usm data.
//
// Grammar (whitespace-separated; keywords case-insensitive):
//
//   query      := selector [ 'where' expr ]
//   selector   := features | services | systems | apis | data | policies
//               | operations | feedback | all | files
//   expr       := orExpr
//   orExpr     := andExpr ( 'or' andExpr )*
//   andExpr    := unary ( 'and' unary )*
//   unary      := 'not' unary | '(' expr ')' | comparison | hasExpr
//   hasExpr    := 'has' field
//   comparison := field op value
//   op         := '=' | '!=' | '>=' | '<=' | '>' | '<' | '~'
//   value      := string | number | bareword
//
// Semantics: unknown/absent fields make predicates false (never error).
// '~' is case-insensitive substring contains. Numeric comparisons apply to
// array-length fields (contracts, flows, tests, decisions, interfaces) and
// $version; everything else compares as strings.

export type Selector =
  | "features" | "services" | "systems" | "apis" | "data"
  | "policies" | "operations" | "feedback" | "all" | "files";

export interface Query {
  selector: Selector;
  predicate?: Expr;
}

export type Expr =
  | { kind: "not"; expr: Expr }
  | { kind: "and"; left: Expr; right: Expr }
  | { kind: "or"; left: Expr; right: Expr }
  | { kind: "cmp"; field: string; op: CmpOp; value: string | number }
  | { kind: "has"; field: string };

export type CmpOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

// ─── Tokenizer ───────────────────────────────────────────────────────────────

interface Token {
  type: "ident" | "string" | "number" | "op" | "lparen" | "rparen";
  value: string;
  pos: number;
}

const SELECTOR_TO_TYPE: Record<Selector, string | null> = {
  features: "feature",
  services: "service",
  systems: "system",
  apis: "api",
  data: "data",
  policies: "policy",
  operations: "operations",
  feedback: "feedback",
  all: null,
  files: null,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        value += input[i];
        i++;
      }
      if (i >= input.length) {
        throw new QueryParseError(`Unterminated string starting at position ${start}`, start);
      }
      i++; // closing quote
      tokens.push({ type: "string", value, pos: start });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const start = i;
      let value = "";
      while (i < input.length && /[0-9.]/.test(input[i])) { value += input[i]; i++; }
      tokens.push({ type: "number", value, pos: start });
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      let value = "";
      while (i < input.length && /[A-Za-z0-9_$.-]/.test(input[i])) { value += input[i]; i++; }
      tokens.push({ type: "ident", value, pos: start });
      continue;
    }

    if (ch === "(") { tokens.push({ type: "lparen", value: "(", pos: i }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")", pos: i }); i++; continue; }

    const two = input.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "!=") {
      tokens.push({ type: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === ">" || ch === "<" || ch === "~") {
      tokens.push({ type: "op", value: ch, pos: i });
      i++;
      continue;
    }

    throw new QueryParseError(`Unexpected character '${ch}' at position ${i}`, i);
  }
  return tokens;
}

export class QueryParseError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = "QueryParseError";
    this.position = position;
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function isKeyword(token: Token | undefined, word: string): boolean {
  return !!token && token.type === "ident" && token.value.toLowerCase() === word;
}

export function parseQuery(input: string): Query {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const token = tokens[pos];
    if (!token) {
      throw new QueryParseError(`Unexpected end of query (position ${input.length}) — expected more input`, input.length);
    }
    pos++;
    return token;
  };
  const describe = (token: Token | undefined): string =>
    token ? `'${token.value}'` : "end of query";

  // selector
  const first = peek();
  if (!first || first.type !== "ident" || !Object.keys(SELECTOR_TO_TYPE).includes(first.value.toLowerCase())) {
    throw new QueryParseError(
      `Query must start with a selector (features, services, systems, apis, data, policies, operations, feedback, all) — got ${describe(first)} at position ${first?.pos ?? 0}`,
      first?.pos ?? 0,
    );
  }
  const selector = next().value.toLowerCase() as Selector;

  // optional where
  let predicate: Expr | undefined;
  if (isKeyword(peek(), "where")) {
    next();
    predicate = parseOr();
    if (pos < tokens.length) {
      const leftover = tokens[pos];
      throw new QueryParseError(`Unexpected ${describe(leftover)} at position ${leftover.pos} after complete expression`, leftover.pos);
    }
  } else if (peek()) {
    const leftover = peek()!;
    throw new QueryParseError(`Expected 'where' but got ${describe(leftover)} at position ${leftover.pos}`, leftover.pos);
  }

  function parseOr(): Expr {
    let left = parseAnd();
    while (isKeyword(peek(), "or")) { next(); const right = parseAnd(); left = { kind: "or", left, right }; }
    return left;
  }
  function parseAnd(): Expr {
    let left = parseUnary();
    while (isKeyword(peek(), "and")) { next(); const right = parseUnary(); left = { kind: "and", left, right }; }
    return left;
  }
  function parseUnary(): Expr {
    if (isKeyword(peek(), "not")) { next(); return { kind: "not", expr: parseUnary() }; }
    if (peek()?.type === "lparen") {
      next();
      const inner = parseOr();
      if (peek()?.type !== "rparen") {
        throw new QueryParseError(`Expected ')' but got ${describe(peek())} at position ${peek()?.pos ?? input.length}`, peek()?.pos ?? input.length);
      }
      next();
      return inner;
    }
    if (isKeyword(peek(), "has")) {
      next();
      const field = next();
      if (field.type !== "ident") {
        throw new QueryParseError(`Expected a field name after 'has' but got ${describe(field)} at position ${field.pos}`, field.pos);
      }
      return { kind: "has", field: field.value.toLowerCase() };
    }
    return parseComparison();
  }
  function parseComparison(): Expr {
    const fieldToken = next();
    if (fieldToken.type !== "ident") {
      throw new QueryParseError(`Expected a field name but got ${describe(fieldToken)} at position ${fieldToken.pos}`, fieldToken.pos);
    }
    const opToken = next();
    if (opToken.type !== "op") {
      throw new QueryParseError(`Expected an operator (= != > < >= <= ~) after '${fieldToken.value}' but got ${describe(opToken)} at position ${opToken.pos}`, opToken.pos);
    }
    const valueToken = next();
    if (valueToken.type !== "string" && valueToken.type !== "number" && valueToken.type !== "ident") {
      throw new QueryParseError(`Expected a value after '${opToken.value}' but got ${describe(valueToken)} at position ${valueToken.pos}`, valueToken.pos);
    }
    const value: string | number =
      valueToken.type === "number" ? Number(valueToken.value) : valueToken.value;
    return { kind: "cmp", field: fieldToken.value.toLowerCase(), op: opToken.value as CmpOp, value };
  }

  return { selector, predicate };
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

interface FieldValue {
  value: unknown;
  exists: boolean;
  isArray: boolean;
}

function resolveField(file: Record<string, unknown>, field: string): FieldValue {
  switch (field) {
    case "id": return { value: file.$id, exists: file.$id != null, isArray: false };
    case "version": return { value: file.$version, exists: file.$version != null, isArray: false };
    case "system": return { value: file.$system, exists: file.$system != null, isArray: false };
    case "service": return { value: file.$service, exists: file.$service != null, isArray: false };
    case "type":
      // The file's own `type` property (service kinds: web-app, api, database…)
      // wins when present; otherwise `type` means $type. Selectors remain the
      // idiomatic way to filter by file kind.
      if (file.type !== undefined) return { value: file.type, exists: true, isArray: false };
      return { value: file.$type, exists: file.$type != null, isArray: false };
    default: {
      const value = file[field];
      if (value === undefined || value === null) return { value: undefined, exists: false, isArray: false };
      return { value, exists: true, isArray: Array.isArray(value) };
    }
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function asNumber(field: FieldValue): number | undefined {
  if (field.isArray) return (field.value as unknown[]).length;
  if (typeof field.value === "number") return field.value;
  const parsed = Number(field.value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function evalExpr(expr: Expr, file: Record<string, unknown>): boolean {
  switch (expr.kind) {
    case "not": return !evalExpr(expr.expr, file);
    case "and": return evalExpr(expr.left, file) && evalExpr(expr.right, file);
    case "or": return evalExpr(expr.left, file) || evalExpr(expr.right, file);
    case "has": {
      const field = resolveField(file, expr.field);
      if (!field.exists) return false;
      if (field.isArray) return (field.value as unknown[]).length > 0;
      return asString(field.value).trim() !== "";
    }
    case "cmp": {
      const field = resolveField(file, expr.field);
      if (!field.exists) return false;

      // Numeric comparisons: array lengths, version, numeric values
      if (expr.op === ">" || expr.op === "<" || expr.op === ">=" || expr.op === "<=") {
        const num = asNumber(field);
        const target = typeof expr.value === "number" ? expr.value : Number(expr.value);
        if (num === undefined || Number.isNaN(target)) return false;
        switch (expr.op) {
          case ">": return num > target;
          case "<": return num < target;
          case ">=": return num >= target;
          case "<=": return num <= target;
        }
      }

      const left = asString(field.value).toLowerCase();
      const right = asString(expr.value).toLowerCase();
      if (expr.op === "~") return left.includes(right);

      // Array field vs number: compare by length (e.g. contracts = 0)
      if (field.isArray && typeof expr.value === "number") {
        const len = (field.value as unknown[]).length;
        return expr.op === "=" ? len === expr.value : len !== expr.value;
      }
      if (expr.op === "=") return left === right;
      return left !== right; // !=
    }
  }
}

export interface QueryHit<T = Record<string, unknown>> {
  file: T;
  path: string;
}

/**
 * Run a query string against a set of parsed .usm files (with their paths).
 * Throws QueryParseError on malformed input.
 */
export function runQuery<T extends Record<string, unknown>>(queryText: string, files: Array<QueryHit<T>>): Array<QueryHit<T>> {
  const query = parseQuery(queryText);
  const typeFilter = SELECTOR_TO_TYPE[query.selector];
  return files.filter(({ file }) => {
    if (typeFilter !== null && file.$type !== typeFilter) return false;
    if (query.predicate && !evalExpr(query.predicate, file)) return false;
    return true;
  });
}
