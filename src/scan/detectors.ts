// Detector plugin system — extensible detection for usm scan.
//
// A detector is a self-describing unit that answers: "given a directory or
// file, what structured knowledge can I extract?" Detectors come in five
// kinds (service, framework, routes, data-schema, infrastructure) and live
// in three precedence layers: built-in defaults < .usm/detectors/*.yaml files
// < usmconfig.json detection section (last wins).
//
// Built-in detectors are seeded from the former hardcoded MANIFESTS and
// ROUTE_PATTERNS tables in multi-lang.ts. User-authored detector files in
// .usm/detectors/ override built-ins by $id. usmconfig.json detection
// arrays are the highest precedence.
//
// This module mirrors the capability registry pattern in capabilities.ts:
// a mutable array + a register() function + built-in defaults seeded here.

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import yaml from "js-yaml";
import type { DetectedRoute } from "./multi-lang.js";
import type { UsmConfigDetection } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The five scan passes that invoke detectors. */
export type DetectorKind = "service" | "framework" | "routes" | "data-schema" | "infrastructure";

/** A framework detection rule — string-contains against manifest contents. */
export interface FrameworkRule {
  name: string;
  detect: string;
}

/** A declarative route extraction regex pattern. */
export interface RoutePatternDef {
  /** JavaScript regex source (string form), matched with gi flags. */
  regex: string;
  /** 1-based capture group for the HTTP method. 0 = not captured (defaults to GET). */
  methodGroup: number;
  /** 1-based capture group for the route path. */
  pathGroup: number;
}

/** Route extraction config — declarative patterns OR a script escape hatch. */
export interface RoutesConfig {
  /** Source file extensions to scan (e.g. [".ts", ".js"]). */
  extensions?: string[];
  /** Declarative regex patterns. Mutually exclusive with script. */
  patterns?: RoutePatternDef[];
  /** Path (relative to repo root) to a .ts/.js module exporting
   *  extractRoutes(sourceDir, framework): DetectedRoute[].
   *  Mutually exclusive with patterns. */
  script?: string;
}

/** A model/entity extraction regex for data-schema detectors. */
export interface ModelPatternDef {
  regex: string;
  nameGroup: number;
}

/** Data-schema extraction config. */
export interface DataExtractConfig {
  models?: ModelPatternDef;
  relations?: boolean;
  enums?: boolean;
}

/** A resource extraction regex for infrastructure detectors. */
export interface ResourcePatternDef {
  regex: string;
  typeGroup: number;
  nameGroup: number;
}

/** Infrastructure extraction config. */
export interface InfrastructureExtractConfig {
  resources: ResourcePatternDef[];
}

/** The unified detector shape — mirrors detector-v1.json. */
export interface Detector {
  $id: string;
  kind: DetectorKind;
  /** Language label (e.g. "zig", "go"). "n/a" for non-language detectors. */
  language?: string;
  /** Runtime label (e.g. "bun", "go", "prisma", "terraform"). */
  runtime?: string;
  /** Glob pattern (relative to repo root) for the manifest/target file. */
  manifest?: string;
  /** Framework detection rules (for service/framework kinds). */
  frameworks?: FrameworkRule[];
  /** Route extraction config (for routes kind, or combined with service). */
  routes?: RoutesConfig;
  /** Extraction config (for data-schema or infrastructure kinds). */
  extract?: DataExtractConfig | InfrastructureExtractConfig;
  /** Optional override for the generated service.usm $type field. */
  service_type?: string;
}

// ─── Registry (mirrors capabilities.ts) ───────────────────────────────────────

/**
 * The registry of known detectors. Seeded with built-in defaults below.
 * External modules can append via registerDetector(); .usm/detectors/ files
 * are loaded and registered at scan start.
 *
 * Initialized empty here because BUILTIN_DETECTORS (a const) is defined
 * later in this file and const is not hoisted. The array is seeded at the
 * bottom of the file, immediately after BUILTIN_DETECTORS is declared.
 */
export const DETECTORS: Detector[] = [];

/**
 * Register an additional detector. If a detector with the same $id exists,
 * it is replaced (override semantics). Used by the .usm/detectors/ loader
 * and by programmatic plugin registration.
 */
export function registerDetector(detector: Detector): void {
  const idx = DETECTORS.findIndex((d) => d.$id === detector.$id);
  if (idx >= 0) {
    DETECTORS[idx] = detector;
  } else {
    DETECTORS.push(detector);
  }
}

/** Get all registered detectors, optionally filtered by kind. */
export function getDetectors(kind?: DetectorKind): Detector[] {
  return kind ? DETECTORS.filter((d) => d.kind === kind) : [...DETECTORS];
}

// ─── Built-in detectors (migrated from multi-lang.ts tables) ──────────────────

/**
 * Built-in detector definitions, migrated from the former MANIFESTS and
 * ROUTE_PATTERNS tables. These are the lowest precedence — user detector
 * files and usmconfig.json detection arrays override them.
 *
 * Each language gets one detector with kind: "service" that also carries a
 * frameworks[] array and (optionally) a routes block, so a single detector
 * can fully cover a stack. The orchestrator calls detectFramework() and
 * extractRoutes() as needed.
 *
 * Note: these are NOT plain Detector objects with regex strings — they use
 * the same shape as user-authored detectors so the precedence merge is
 * uniform. The compiled regexes are built lazily in extractRoutesViaDetector.
 */
const BUILTIN_DETECTORS: Detector[] = [
  // ── TypeScript / Node (package.json) ────────────────────────────────────────
  {
    $id: "typescript",
    kind: "service",
    language: "typescript",
    runtime: "node",
    manifest: "**/package.json",
    frameworks: [
      { name: "nextjs", detect: '"next"' },
      { name: "express", detect: '"express"' },
      { name: "hono", detect: '"hono"' },
      { name: "nestjs", detect: '"@nestjs/core"' },
      { name: "elysia", detect: '"elysia"' },
    ],
    routes: {
      extensions: [".ts", ".js"],
      patterns: [
        { regex: "app\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
        { regex: "router\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Python (pyproject.toml) ──────────────────────────────────────────────────
  {
    $id: "python-pyproject",
    kind: "service",
    language: "python",
    runtime: "python",
    manifest: "**/pyproject.toml",
    frameworks: [
      { name: "fastapi", detect: "fastapi" },
      { name: "flask", detect: "flask" },
      { name: "django", detect: "django" },
    ],
    routes: {
      extensions: [".py"],
      patterns: [
        { regex: "@(?:app|router)\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
        { regex: "@app\\.route\\s*\\(\\s*['\"]([^'\"]+)['\"](?:.*methods\\s*=\\s*\\[([^\\]]+))?", methodGroup: 0, pathGroup: 1 },
      ],
    },
  },
  // ── Python (requirements.txt) — same frameworks, different manifest ──────────
  {
    $id: "python-requirements",
    kind: "service",
    language: "python",
    runtime: "python",
    manifest: "**/requirements.txt",
    frameworks: [
      { name: "fastapi", detect: "fastapi" },
      { name: "flask", detect: "flask" },
      { name: "django", detect: "django" },
    ],
    routes: {
      extensions: [".py"],
      patterns: [
        { regex: "@(?:app|router)\\.(get|post|put|delete|patch)\\s*\\(\\s*['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
        { regex: "@app\\.route\\s*\\(\\s*['\"]([^'\"]+)['\"](?:.*methods\\s*=\\s*\\[([^\\]]+))?", methodGroup: 0, pathGroup: 1 },
      ],
    },
  },
  // ── Go ───────────────────────────────────────────────────────────────────────
  {
    $id: "go",
    kind: "service",
    language: "go",
    runtime: "go",
    manifest: "**/go.mod",
    frameworks: [
      { name: "gin", detect: "github.com/gin-gonic/gin" },
      { name: "echo", detect: "github.com/labstack/echo" },
      { name: "chi", detect: "github.com/go-chi/chi" },
    ],
    routes: {
      extensions: [".go"],
      patterns: [
        { regex: "\\.(GET|POST|PUT|DELETE|PATCH)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
        { regex: "HandleFunc\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 0, pathGroup: 1 },
      ],
    },
  },
  // ── Rust ─────────────────────────────────────────────────────────────────────
  {
    $id: "rust",
    kind: "service",
    language: "rust",
    runtime: "rust",
    manifest: "**/Cargo.toml",
    frameworks: [
      { name: "axum", detect: "axum" },
      { name: "actix", detect: "actix-web" },
      { name: "rocket", detect: "rocket" },
    ],
    routes: {
      extensions: [".rs"],
      patterns: [
        { regex: "\\.route\\s*\\(\\s*['\"`]([^'\"`]+).*?(get|post|put|delete)", methodGroup: 2, pathGroup: 1 },
        { regex: "#\\[(get|post|put|delete)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Java (Maven) ──────────────────────────────────────────────────────────────
  {
    $id: "java",
    kind: "service",
    language: "java",
    runtime: "jvm",
    manifest: "**/pom.xml",
    frameworks: [
      { name: "spring-boot", detect: "spring-boot" },
      { name: "quarkus", detect: "quarkus" },
    ],
    routes: {
      extensions: [".java", ".kt"],
      patterns: [
        { regex: "@(Get|Post|Put|Delete|Request)Mapping\\s*\\(\\s*(?:value\\s*=\\s*)?['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Kotlin (Gradle) ──────────────────────────────────────────────────────────
  {
    $id: "kotlin",
    kind: "service",
    language: "kotlin",
    runtime: "jvm",
    manifest: "**/build.gradle",
    frameworks: [
      { name: "spring-boot", detect: "spring-boot" },
      { name: "quarkus", detect: "quarkus" },
      { name: "javalin", detect: "javalin" },
    ],
    routes: {
      extensions: [".java", ".kt"],
      patterns: [
        { regex: "@(Get|Post|Put|Delete|Request)Mapping\\s*\\(\\s*(?:value\\s*=\\s*)?['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── C# / .NET ─────────────────────────────────────────────────────────────────
  {
    $id: "csharp",
    kind: "service",
    language: "csharp",
    runtime: "dotnet",
    manifest: "**/*.csproj",
    frameworks: [
      { name: "aspnet-core", detect: "Microsoft.AspNetCore" },
    ],
    routes: {
      extensions: [".cs"],
      patterns: [
        { regex: "\\[(Http(?:Get|Post|Put|Delete))\\s*\\(\\s*['\"`]?([^'\"`)]+)", methodGroup: 1, pathGroup: 2 },
        { regex: "app\\.Map(Get|Post|Put|Delete)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Ruby ──────────────────────────────────────────────────────────────────────
  {
    $id: "ruby",
    kind: "service",
    language: "ruby",
    runtime: "ruby",
    manifest: "**/Gemfile",
    frameworks: [
      { name: "rails", detect: "rails" },
      { name: "sinatra", detect: "sinatra" },
    ],
    routes: {
      extensions: [".rb"],
      patterns: [
        { regex: "^\\s*(get|post|put|delete|patch)\\s+['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── PHP ───────────────────────────────────────────────────────────────────────
  {
    $id: "php",
    kind: "service",
    language: "php",
    runtime: "php",
    manifest: "**/composer.json",
    frameworks: [
      { name: "laravel", detect: "laravel/framework" },
      { name: "symfony", detect: "symfony" },
      { name: "slim", detect: "slim/slim" },
    ],
    routes: {
      extensions: [".php"],
      patterns: [
        { regex: "Route::(get|post|put|delete)\\s*\\(\\s*['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Elixir ─────────────────────────────────────────────────────────────────────
  {
    $id: "elixir",
    kind: "service",
    language: "elixir",
    runtime: "elixir",
    manifest: "**/mix.exs",
    frameworks: [
      { name: "phoenix", detect: "phoenix" },
    ],
    routes: {
      extensions: [".ex"],
      patterns: [
        { regex: "\\b(get|post|put|delete|patch)\\s+['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Swift ─────────────────────────────────────────────────────────────────────
  {
    $id: "swift",
    kind: "service",
    language: "swift",
    runtime: "swift",
    manifest: "**/Package.swift",
    frameworks: [
      { name: "vapor", detect: "vapor" },
    ],
    routes: {
      extensions: [".swift"],
      patterns: [
        { regex: "routes?\\.(get|post|put|delete)\\s*\\(\\s*['\"`]([^'\"`]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── Scala ──────────────────────────────────────────────────────────────────────
  {
    $id: "scala",
    kind: "service",
    language: "scala",
    runtime: "jvm",
    manifest: "**/build.sbt",
    frameworks: [
      { name: "akka-http", detect: "akka-http" },
      { name: "play", detect: "play" },
      { name: "tapir", detect: "tapir" },
    ],
    routes: {
      extensions: [".scala"],
      patterns: [
        { regex: "\\b(get|post|put|delete|patch)\\s+['\"]([^'\"]+)", methodGroup: 1, pathGroup: 2 },
      ],
    },
  },
  // ── C++ ───────────────────────────────────────────────────────────────────────
  {
    $id: "cpp",
    kind: "service",
    language: "cpp",
    runtime: "native",
    manifest: "**/CMakeLists.txt",
    frameworks: [
      { name: "drogon", detect: "drogon" },
      { name: "crow", detect: "crow" },
    ],
    routes: {
      extensions: [".cpp", ".h", ".hpp"],
      patterns: [
        { regex: "CROW_ROUTE\\s*\\(\\s*\\w+\\s*,\\s*['\"`]([^'\"`]+)", methodGroup: 0, pathGroup: 1 },
      ],
    },
  },
  // ── Data: Prisma ───────────────────────────────────────────────────────────────
  {
    $id: "prisma",
    kind: "data-schema",
    language: "n/a",
    runtime: "prisma",
    manifest: "**/prisma/schema.prisma",
    extract: {
      models: { regex: "^model (\\w+)", nameGroup: 1 },
      relations: false,
      enums: false,
    },
  },
  // ── Infrastructure: Terraform ─────────────────────────────────────────────────
  {
    $id: "terraform",
    kind: "infrastructure",
    language: "n/a",
    runtime: "terraform",
    manifest: "infrastructure/**/*.tf",
    extract: {
      resources: [
        { regex: "resource \"(\\w+)\" \"(\\w+)\"", typeGroup: 1, nameGroup: 2 },
      ],
    },
  },
  // ── Infrastructure: Docker Compose (infra services) ──────────────────────────
  // This detector handles the docker-compose.yml infra-service detection
  // that was a special-case pass in structural.ts. It matches the compose
  // file and produces service entries for known infra services (zitadel,
  // litellm, langflow, postgres, nango).
  {
    $id: "docker-compose",
    kind: "service",
    language: "n/a",
    runtime: "docker",
    manifest: "docker-compose.yml",
    service_type: "api",
  },
];

// Seed the registry with built-in defaults. This line must run after
// BUILTIN_DETECTORS is declared (const is not hoisted).
DETECTORS.push(...BUILTIN_DETECTORS);

// ─── Detector file loader (.usm/detectors/*.yaml) ─────────────────────────────

export interface DetectorLoadResult {
  /** Detectors successfully loaded and registered. */
  loaded: string[];
  /** Files that failed validation, with error messages. */
  failed: Array<{ file: string; errors: string[] }>;
}

/**
 * Load detector files from .usm/detectors/*.yaml (if the directory exists).
 * Each file is validated against detector-v1.json before registration.
 * Invalid files are skipped with a warning (per the detector-file-format
 * contract); the scan does not abort.
 *
 * @param usmSourceDir - The .usm/ source directory (e.g. ".usm/").
 * @returns Loaded detector $ids and any validation failures.
 */
export function loadDetectorFiles(usmSourceDir: string): DetectorLoadResult {
  const detectorsDir = path.join(usmSourceDir, "detectors");
  const loaded: string[] = [];
  const failed: Array<{ file: string; errors: string[] }> = [];

  if (!fs.existsSync(detectorsDir)) {
    return { loaded, failed };
  }

  const files = fg.sync(["*.yaml", "*.yml"], {
    cwd: detectorsDir,
    absolute: true,
  });

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const parsed = yaml.load(content) as Record<string, unknown>;

      const errors = validateDetector(parsed);
      if (errors.length > 0) {
        failed.push({ file: path.basename(file), errors });
        continue;
      }

      const detector = parsed as unknown as Detector;
      registerDetector(detector);
      loaded.push(detector.$id);
    } catch (err) {
      failed.push({
        file: path.basename(file),
        errors: [(err as Error).message],
      });
    }
  }

  return { loaded, failed };
}

/**
 * Validate a parsed detector object against the detector-v1 contract.
 * This is a lightweight structural check (not a full JSON Schema validation)
 * to avoid a runtime dependency on ajv. The detector-v1.json schema file
 * remains the canonical reference for tooling and docs.
 */
export function validateDetector(obj: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!obj.$id || typeof obj.$id !== "string") {
    errors.push("$id is required and must be a string");
  }
  if (!obj.kind || typeof obj.kind !== "string") {
    errors.push("kind is required and must be a string");
  } else {
    const validKinds: DetectorKind[] = ["service", "framework", "routes", "data-schema", "infrastructure"];
    if (!validKinds.includes(obj.kind as DetectorKind)) {
      errors.push(`kind must be one of: ${validKinds.join(", ")}`);
    }
  }
  if (obj.language !== undefined && typeof obj.language !== "string") {
    errors.push("language must be a string if present");
  }
  if (obj.runtime !== undefined && typeof obj.runtime !== "string") {
    errors.push("runtime must be a string if present");
  }
  if (obj.manifest !== undefined && typeof obj.manifest !== "string") {
    errors.push("manifest must be a string if present");
  }

  // frameworks[] validation
  if (obj.frameworks !== undefined) {
    if (!Array.isArray(obj.frameworks)) {
      errors.push("frameworks must be an array if present");
    } else {
      obj.frameworks.forEach((fw, i) => {
        if (typeof fw !== "object" || fw === null) {
          errors.push(`frameworks[${i}] must be an object`);
          return;
        }
        const f = fw as Record<string, unknown>;
        if (!f.name || typeof f.name !== "string") {
          errors.push(`frameworks[${i}].name is required and must be a string`);
        }
        if (!f.detect || typeof f.detect !== "string") {
          errors.push(`frameworks[${i}].detect is required and must be a string`);
        }
      });
    }
  }

  // routes validation — patterns OR script, not both
  if (obj.routes !== undefined) {
    if (typeof obj.routes !== "object" || obj.routes === null) {
      errors.push("routes must be an object if present");
    } else {
      const r = obj.routes as Record<string, unknown>;
      const hasPatterns = r.patterns !== undefined;
      const hasScript = r.script !== undefined;
      if (hasPatterns && hasScript) {
        errors.push("routes.patterns and routes.script are mutually exclusive");
      }
      if (!hasPatterns && !hasScript) {
        errors.push("routes must have either patterns or script");
      }
      if (hasScript && (typeof r.script !== "string")) {
        errors.push("routes.script must be a string");
      }
      if (hasPatterns) {
        if (!Array.isArray(r.patterns)) {
          errors.push("routes.patterns must be an array");
        } else {
          r.patterns.forEach((p, i) => {
            if (typeof p !== "object" || p === null) {
              errors.push(`routes.patterns[${i}] must be an object`);
              return;
            }
            const pp = p as Record<string, unknown>;
            if (!pp.regex || typeof pp.regex !== "string") {
              errors.push(`routes.patterns[${i}].regex is required and must be a string`);
            }
            if (pp.pathGroup === undefined || typeof pp.pathGroup !== "number") {
              errors.push(`routes.patterns[${i}].pathGroup is required and must be a number`);
            }
            if (pp.methodGroup !== undefined && typeof pp.methodGroup !== "number") {
              errors.push(`routes.patterns[${i}].methodGroup must be a number if present`);
            }
          });
        }
        if (r.extensions !== undefined) {
          if (!Array.isArray(r.extensions)) {
            errors.push("routes.extensions must be an array if present");
          }
        }
      }
    }
  }

  return errors;
}

// ─── Detection functions ──────────────────────────────────────────────────────

/**
 * Detect the framework from manifest contents using the detector's
 * frameworks[] rules. Returns the first matching framework name, or null.
 */
export function detectFramework(
  manifestContent: string,
  detector: Detector,
): string | null {
  if (!detector.frameworks || detector.frameworks.length === 0) {
    return null;
  }
  for (const fw of detector.frameworks) {
    if (manifestContent.includes(fw.detect)) {
      return fw.name;
    }
  }
  return null;
}

/**
 * Extract routes from a service directory using a detector's routes config.
 * Supports both declarative regex patterns and the script escape hatch.
 *
 * @param sourceDir - Absolute path to the service source directory.
 * @param detector - The detector with routes config.
 * @param excludePatterns - Glob patterns to exclude.
 * @returns Array of detected routes.
 */
export async function extractRoutesViaDetector(
  sourceDir: string,
  detector: Detector,
  excludePatterns: string[] = ["**/node_modules/**", "**/dist/**", "**/.git/**"],
): Promise<DetectedRoute[]> {
  if (!detector.routes) return [];

  // Script escape hatch — dynamic import
  if (detector.routes.script) {
    try {
      const scriptPath = path.resolve(sourceDir, detector.routes.script);
      const mod = await import(scriptPath);
      if (typeof mod.extractRoutes === "function") {
        return mod.extractRoutes(sourceDir, null);
      }
      return [];
    } catch {
      // Script failed to load or run — return no routes
      return [];
    }
  }

  // Declarative regex patterns
  if (!detector.routes.patterns || detector.routes.patterns.length === 0) {
    return [];
  }
  if (!detector.routes.extensions || detector.routes.extensions.length === 0) {
    return [];
  }

  const routes: DetectedRoute[] = [];
  const globs = detector.routes.extensions.map((ext) => `**/*${ext}`);
  const files = fg.sync(globs, {
    cwd: sourceDir,
    absolute: true,
    ignore: excludePatterns,
  });

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    for (const patternDef of detector.routes.patterns) {
      // Build regex with gi flags (global, case-insensitive)
      const regex = new RegExp(patternDef.regex, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const method = patternDef.methodGroup > 0
          ? (match[patternDef.methodGroup]?.toUpperCase() || "GET")
          : "GET";
        const routePath = match[patternDef.pathGroup] || "/";

        // Deduplicate
        const key = `${method} ${routePath}`;
        if (routes.some((r) => `${r.method} ${r.path}` === key)) continue;

        routes.push({
          method,
          path: routePath,
          file: path.relative(sourceDir, filePath),
        });
      }
    }
  }

  return routes;
}

// ─── Precedence merge ─────────────────────────────────────────────────────────

/**
 * Resolve the final detector list for a scan run, applying precedence:
 * built-in defaults < .usm/detectors/ files < usmconfig.json detection.
 *
 * This is called by scanStructural after loadDetectorFiles() has registered
 * file-based detectors. usmconfig.json detection arrays (if present) are
 * converted to Detector objects and registered last so they win.
 *
 * @param usmSourceDir - The .usm/ source directory.
 * @param configDetection - The detection section from usmconfig.json (optional).
 * @returns { loaded, failed } from the file-loading step (config errors are
 *          pushed to the scan result warnings by the caller).
 */
export function resolveDetectors(
  usmSourceDir: string,
  configDetection?: UsmConfigDetection,
): DetectorLoadResult {
  // 1. Reset to built-in defaults (so repeated scans in one process are clean)
  DETECTORS.length = 0;
  DETECTORS.push(...BUILTIN_DETECTORS);

  // 2. Load .usm/detectors/ files (override built-ins by $id)
  const fileResult = loadDetectorFiles(usmSourceDir);

  // 3. Apply usmconfig.json detection section (highest precedence)
  if (configDetection) {
    for (const d of configDetection.manifests || []) {
      registerDetector({
        $id: d.id || d.language || "config-detector",
        kind: "service",
        language: d.language,
        runtime: d.runtime || d.language,
        manifest: d.pattern,
        frameworks: (d.frameworks || []).map((fw) => ({
          name: fw.name,
          detect: fw.detect,
        })),
      });
    }
    for (const r of configDetection.routes || []) {
      registerDetector({
        $id: `config-routes-${r.framework}`,
        kind: "routes",
        routes: {
          extensions: r.extensions,
          patterns: r.patterns?.map((p) => ({
            regex: p.regex,
            methodGroup: p.method_group,
            pathGroup: p.path_group,
          })),
          script: r.script,
        },
      });
    }
  }

  return fileResult;
}

// ─── usmconfig.json detection section types ────────────────────────────────────
//
// These types are re-exported here for convenience but the canonical
// definitions live in types.ts (UsmConfigDetection*). They are structurally
// identical; this avoids a breaking import change for existing callers of
// resolveDetectors while keeping a single source of truth in types.ts.

export type {
  UsmConfigDetection as ConfigDetection,
  UsmConfigDetectionManifest as ConfigDetectionManifest,
  UsmConfigDetectionRoute as ConfigDetectionRoute,
  UsmConfigDetectionDataModel,
  UsmConfigDetectionInfrastructure,
} from "./types.js";