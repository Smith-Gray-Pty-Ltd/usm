import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

/**
 * Multi-language manifest detection and route extraction.
 *
 * This module extends the scanner to support 12 languages and 30+ frameworks.
 * It detects services from language manifest files and extracts routes
 * from framework-specific source code patterns.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedService {
  name: string;
  language: string;
  runtime: string;
  framework: string | null;
  manifestPath: string;
  sourceDir: string;
  port?: number;
}

export interface DetectedRoute {
  path: string;
  method: string;
  file: string;
}

// ─── Manifest Definitions ─────────────────────────────────────────────────────

interface ManifestDef {
  pattern: string;
  language: string;
  runtime: string;
  frameworks: Array<{ name: string; detect: (content: string) => boolean }>;
}

const MANIFESTS: ManifestDef[] = [
  {
    pattern: "**/package.json",
    language: "typescript",
    runtime: "node",
    frameworks: [
      { name: "nextjs", detect: (c) => c.includes('"next"') },
      { name: "express", detect: (c) => c.includes('"express"') },
      { name: "hono", detect: (c) => c.includes('"hono"') },
      { name: "nestjs", detect: (c) => c.includes('"@nestjs/core"') },
    ],
  },
  {
    pattern: "**/pyproject.toml",
    language: "python",
    runtime: "python",
    frameworks: [
      { name: "fastapi", detect: (c) => c.includes("fastapi") },
      { name: "flask", detect: (c) => c.includes("flask") },
      { name: "django", detect: (c) => c.includes("django") },
    ],
  },
  {
    pattern: "**/requirements.txt",
    language: "python",
    runtime: "python",
    frameworks: [
      { name: "fastapi", detect: (c) => c.includes("fastapi") },
      { name: "flask", detect: (c) => c.includes("flask") },
      { name: "django", detect: (c) => c.includes("django") },
    ],
  },
  {
    pattern: "**/go.mod",
    language: "go",
    runtime: "go",
    frameworks: [
      { name: "gin", detect: (c) => c.includes("github.com/gin-gonic/gin") },
      { name: "echo", detect: (c) => c.includes("github.com/labstack/echo") },
      { name: "chi", detect: (c) => c.includes("github.com/go-chi/chi") },
    ],
  },
  {
    pattern: "**/Cargo.toml",
    language: "rust",
    runtime: "rust",
    frameworks: [
      { name: "axum", detect: (c) => c.includes("axum") },
      { name: "actix", detect: (c) => c.includes("actix-web") },
      { name: "rocket", detect: (c) => c.includes("rocket") },
    ],
  },
  {
    pattern: "**/pom.xml",
    language: "java",
    runtime: "jvm",
    frameworks: [
      { name: "spring-boot", detect: (c) => c.includes("spring-boot") },
      { name: "quarkus", detect: (c) => c.includes("quarkus") },
    ],
  },
  {
    pattern: "**/build.gradle",
    language: "kotlin",
    runtime: "jvm",
    frameworks: [
      { name: "spring-boot", detect: (c) => c.includes("spring-boot") },
      { name: "quarkus", detect: (c) => c.includes("quarkus") },
      { name: "javalin", detect: (c) => c.includes("javalin") },
    ],
  },
  {
    pattern: "**/*.csproj",
    language: "csharp",
    runtime: "dotnet",
    frameworks: [
      { name: "aspnet-core", detect: (c) => c.includes("Microsoft.AspNetCore") },
    ],
  },
  {
    pattern: "**/Gemfile",
    language: "ruby",
    runtime: "ruby",
    frameworks: [
      { name: "rails", detect: (c) => c.includes("rails") },
      { name: "sinatra", detect: (c) => c.includes("sinatra") },
    ],
  },
  {
    pattern: "**/composer.json",
    language: "php",
    runtime: "php",
    frameworks: [
      { name: "laravel", detect: (c) => c.includes("laravel/framework") },
      { name: "symfony", detect: (c) => c.includes("symfony") },
      { name: "slim", detect: (c) => c.includes("slim/slim") },
    ],
  },
  {
    pattern: "**/mix.exs",
    language: "elixir",
    runtime: "elixir",
    frameworks: [
      { name: "phoenix", detect: (c) => c.includes("phoenix") },
    ],
  },
  {
    pattern: "**/Package.swift",
    language: "swift",
    runtime: "swift",
    frameworks: [
      { name: "vapor", detect: (c) => c.includes("vapor") },
    ],
  },
  {
    pattern: "**/build.sbt",
    language: "scala",
    runtime: "jvm",
    frameworks: [
      { name: "akka-http", detect: (c) => c.includes("akka-http") },
      { name: "play", detect: (c) => c.includes("play") },
      { name: "tapir", detect: (c) => c.includes("tapir") },
    ],
  },
  {
    pattern: "**/CMakeLists.txt",
    language: "cpp",
    runtime: "native",
    frameworks: [
      { name: "drogon", detect: (c) => c.includes("drogon") },
      { name: "crow", detect: (c) => c.includes("crow") },
    ],
  },
];

// ─── Route Extraction Patterns ────────────────────────────────────────────────

interface RoutePattern {
  framework: string;
  extensions: string[];
  patterns: Array<{ regex: RegExp; methodGroup: number; pathGroup: number }>;
}

const ROUTE_PATTERNS: RoutePattern[] = [
  // Express (TypeScript/JavaScript)
  {
    framework: "express",
    extensions: [".ts", ".js"],
    patterns: [
      { regex: /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
      { regex: /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // FastAPI (Python)
  {
    framework: "fastapi",
    extensions: [".py"],
    patterns: [
      { regex: /@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Flask (Python)
  {
    framework: "flask",
    extensions: [".py"],
    patterns: [
      { regex: /@app\.route\s*\(\s*['"]([^'"]+)['"](?:.*methods\s*=\s*\[([^\]]+))?/gi, methodGroup: 0, pathGroup: 1 },
    ],
  },
  // Go frameworks (gin, echo, chi, net/http)
  {
    framework: "go",
    extensions: [".go"],
    patterns: [
      { regex: /\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
      { regex: /HandleFunc\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 0, pathGroup: 1 },
    ],
  },
  // Rust Axum
  {
    framework: "axum",
    extensions: [".rs"],
    patterns: [
      { regex: /\.route\s*\(\s*['"`]([^'"`]+).*?(get|post|put|delete)/gi, methodGroup: 2, pathGroup: 1 },
    ],
  },
  // Rust Actix
  {
    framework: "actix",
    extensions: [".rs"],
    patterns: [
      { regex: /#\[(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Spring Boot (Java/Kotlin)
  {
    framework: "spring-boot",
    extensions: [".java", ".kt"],
    patterns: [
      { regex: /@(Get|Post|Put|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // ASP.NET Core (C#)
  {
    framework: "aspnet-core",
    extensions: [".cs"],
    patterns: [
      { regex: /\[(Http(?:Get|Post|Put|Delete))\s*\(\s*['"`]?([^'"`)]+)/gi, methodGroup: 1, pathGroup: 2 },
      { regex: /app\.Map(Get|Post|Put|Delete)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Rails (Ruby)
  {
    framework: "rails",
    extensions: [".rb"],
    patterns: [
      { regex: /^\s*(get|post|put|delete|patch)\s+['"]([^'"]+)/gim, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Sinatra (Ruby)
  {
    framework: "sinatra",
    extensions: [".rb"],
    patterns: [
      { regex: /^\s*(get|post|put|delete)\s+['"]([^'"]+)/gim, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Laravel (PHP)
  {
    framework: "laravel",
    extensions: [".php"],
    patterns: [
      { regex: /Route::(get|post|put|delete)\s*\(\s*['"]([^'"]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Phoenix (Elixir)
  {
    framework: "phoenix",
    extensions: [".ex"],
    patterns: [
      { regex: /\b(get|post|put|delete|patch)\s+['"]([^'"]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Vapor (Swift)
  {
    framework: "vapor",
    extensions: [".swift"],
    patterns: [
      { regex: /routes?\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)/gi, methodGroup: 1, pathGroup: 2 },
    ],
  },
  // Crow (C++)
  {
    framework: "crow",
    extensions: [".cpp", ".h", ".hpp"],
    patterns: [
      { regex: /CROW_ROUTE\s*\(\s*\w+\s*,\s*['"`]([^'"`]+)/gi, methodGroup: 0, pathGroup: 1 },
    ],
  },
];

// ─── Detection Functions ──────────────────────────────────────────────────────

/**
 * Detect services from all language manifest files in the project.
 * Returns a list of detected services with language, runtime, and framework.
 */
export function detectServices(
  root: string,
  excludePatterns: string[] = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.git/**"]
): DetectedService[] {
  const services: DetectedService[] = [];
  const seen = new Set<string>();

  for (const manifest of MANIFESTS) {
    const files = fg.sync([manifest.pattern], {
      cwd: root,
      absolute: true,
      ignore: [...excludePatterns, "**/.usm/**"],
    });

    for (const manifestPath of files) {
      // Skip if we've already detected a service in this directory
      const dir = path.dirname(manifestPath);
      if (seen.has(dir)) continue;
      seen.add(dir);

      const content = fs.readFileSync(manifestPath, "utf-8");
      let framework: string | null = null;

      for (const fw of manifest.frameworks) {
        if (fw.detect(content)) {
          framework = fw.name;
          break;
        }
      }

      const relativePath = path.relative(root, dir);
      const name = path.basename(dir);

      services.push({
        name,
        language: manifest.language,
        runtime: manifest.runtime,
        framework,
        manifestPath: path.relative(root, manifestPath),
        sourceDir: relativePath,
      });
    }
  }

  return services;
}

/**
 * Extract routes from source files using framework-specific patterns.
 * Returns a list of detected routes with path, method, and source file.
 */
export function extractRoutes(
  serviceDir: string,
  framework: string | null,
  excludePatterns: string[] = ["**/node_modules/**", "**/dist/**", "**/.git/**"]
): DetectedRoute[] {
  if (!framework) return [];

  const routes: DetectedRoute[] = [];

  // Find matching route patterns for this framework
  const matchingPatterns = ROUTE_PATTERNS.filter(
    (rp) => rp.framework === framework ||
    (framework === "gin" && rp.framework === "go") ||
    (framework === "echo" && rp.framework === "go") ||
    (framework === "chi" && rp.framework === "go") ||
    (framework === "axum" && rp.framework === "axum") ||
    (framework === "actix" && rp.framework === "actix") ||
    (framework === "rocket" && rp.framework === "actix") || // similar pattern
    (framework === "spring-boot" && rp.framework === "spring-boot") ||
    (framework === "javalin" && rp.framework === "spring-boot") || // similar
    (framework === "quarkus" && rp.framework === "spring-boot") || // similar
    (framework === "aspnet-core" && rp.framework === "aspnet-core") ||
    (framework === "rails" && rp.framework === "rails") ||
    (framework === "sinatra" && rp.framework === "sinatra") ||
    (framework === "laravel" && rp.framework === "laravel") ||
    (framework === "symfony" && rp.framework === "laravel") || // similar Route:: pattern
    (framework === "slim" && rp.framework === "laravel") || // similar
    (framework === "phoenix" && rp.framework === "phoenix") ||
    (framework === "vapor" && rp.framework === "vapor") ||
    (framework === "crow" && rp.framework === "crow") ||
    (framework === "drogon" && rp.framework === "crow") || // similar
    (framework === "express" && rp.framework === "express") ||
    (framework === "nextjs" && rp.framework === "express") || // API routes similar
    (framework === "hono" && rp.framework === "express") // similar
  );

  if (matchingPatterns.length === 0) return [];

  // Collect all extensions to scan
  const extensions = [...new Set(matchingPatterns.flatMap((rp) => rp.extensions))];
  const globs = extensions.map((ext) => `**/*${ext}`);

  const files = fg.sync(globs, {
    cwd: serviceDir,
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

    for (const rp of matchingPatterns) {
      if (!rp.extensions.some((ext) => filePath.endsWith(ext))) continue;

      for (const pattern of rp.patterns) {
        let match: RegExpExecArray | null;
        pattern.regex.lastIndex = 0;
        while ((match = pattern.regex.exec(content)) !== null) {
          const method = match[pattern.methodGroup]?.toUpperCase() || "GET";
          const routePath = match[pattern.pathGroup] || "/";

          // Deduplicate
          const key = `${method} ${routePath}`;
          if (routes.some((r) => `${r.method} ${r.path}` === key)) continue;

          routes.push({
            method,
            path: routePath,
            file: path.relative(serviceDir, filePath),
          });
        }
      }
    }
  }

  return routes;
}
