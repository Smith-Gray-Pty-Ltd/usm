// Route extraction — detect Next.js pages and API routes from app directories

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { RouteFinding, FeatureFinding } from "./types.js";

/**
 * Extract all Next.js page and API route findings from an app's app/ directory.
 * @param appDir - The absolute path to the app/ subdirectory (e.g. /abs/apps/the-architect/app)
 * @param appName - The name of the app (e.g. "the-architect")
 */
export async function extractRoutes(appDir: string, appName: string): Promise<RouteFinding[]> {
  const findings: RouteFinding[] = [];

  // Pages: **/page.tsx within the app/ directory
  const pageFiles = fg.sync("**/page.tsx", {
    cwd: appDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**"],
  });

  for (const file of pageFiles) {
    const urlPath = fileToUrlPath(file, appDir, "page");
    const area = extractArea(urlPath, appName);
    const name = extractName(urlPath);

    findings.push({
      type: "page",
      path: urlPath,
      http_methods: [],
      file_path: file,
      app: appName,
      area,
      name,
    });
  }

  // API routes: api/**/route.ts within the app/ directory
  const routeFiles = fg.sync("api/**/route.ts", {
    cwd: appDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.next/**"],
  });

  for (const file of routeFiles) {
    const urlPath = fileToUrlPath(file, appDir, "api");
    const methods = await extractHttpMethods(file);
    const area = extractArea(urlPath, appName);
    const name = extractName(urlPath);

    // appPath is the parent directory of the app/ dir (e.g. apps/the-architect)
    const appPath = path.dirname(appDir);
    const authRequired = detectAuthRequired(file, appPath);

    findings.push({
      type: "api",
      path: urlPath,
      http_methods: methods,
      file_path: file,
      app: appName,
      area,
      name,
      auth_required: authRequired,
    });
  }

  return findings;
}

/**
 * Convert a file path to a URL path.
 * e.g. app/(dashboard)/settings/memory/page.tsx → /settings/memory
 * e.g. app/api/settings/providers/route.ts → /api/settings/providers
 */
function fileToUrlPath(file: string, basePath: string, routeType: "page" | "api"): string {
  const rel = path.relative(basePath, file);

  let cleaned = rel
    .replace(/\(.*?\)\//g, "")   // Strip route groups like (dashboard), (auth)
    .replace(/\(.*?\)/g, "");     // Strip route groups without trailing slash

  if (routeType === "page") {
    cleaned = cleaned.replace(/\/page\.tsx$/, "");
    // Handle root page.tsx (relative path is just "page.tsx")
    if (cleaned === "page.tsx") {
      cleaned = "";
    }
  } else {
    cleaned = cleaned.replace(/\/route\.ts$/, "");
  }

  // Convert [id] dynamic segments to :id
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, ":$1");

  // Ensure leading slash (or just "/" for root)
  if (cleaned === "" || cleaned === "/") {
    return "/";
  }
  if (!cleaned.startsWith("/")) {
    cleaned = "/" + cleaned;
  }

  return cleaned;
}

/**
 * Extract HTTP methods from a route.ts file by looking for exported function declarations.
 */
async function extractHttpMethods(file: string): Promise<string[]> {
  try {
    const content = fs.readFileSync(file, "utf-8");
    const matches = content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/g) || [];
    return matches.map((m: string) => {
      const parts = m.split(/\s+/);
      return parts[parts.length - 1];
    });
  } catch {
    return [];
  }
}

/**
 * Detect if a route is in a protected layout (has a layout.tsx with auth checks).
 * @param routeFile - The absolute path to the route.ts file
 * @param appPath - The absolute path to the app directory (e.g. apps/the-architect)
 */
function detectAuthRequired(routeFile: string, appPath: string): boolean | undefined {
  // Check parent directories for layout.tsx that mentions auth
  const routeDir = path.dirname(routeFile);
  const appSubDir = path.join(appPath, "app");

  // Walk up from the route's directory to app/ looking for layout.tsx
  let currentDir = routeDir;
  while (currentDir !== appSubDir && currentDir.length > appPath.length) {
    const layoutPath = path.join(currentDir, "layout.tsx");
    if (fs.existsSync(layoutPath)) {
      try {
        const content = fs.readFileSync(layoutPath, "utf-8");
        // Heuristic: if the layout imports from auth/zitadel or mentions authentication
        if (
          content.includes("@smith-gray/zitadel") ||
          content.includes("auth") ||
          content.includes("requireAuth") ||
          content.includes("getSession") ||
          content.includes("protectRoute")
        ) {
          return true;
        }
      } catch {
        // Ignore read errors
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Check if the route is under /admin/ or /api/auth/ — always protected
  const rel = path.relative(appSubDir, routeDir);
  if (rel.startsWith("admin") || rel.startsWith("api/auth")) {
    return true;
  }

  // If under (dashboard) route group, likely protected
  if (rel.includes("(dashboard)")) {
    return true;
  }

  return undefined;
}

/**
 * Extract the "area" from a URL path — the first meaningful segment.
 * e.g. /settings/memory → "settings"
 * e.g. /api/projects → "projects" (strip "api" prefix)
 * e.g. / → "dashboard" (home page)
 */
function extractArea(urlPath: string, _appName: string): string {
  const segments = urlPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    // Home page → use app name as area
    return "dashboard";
  }

  // For API routes, strip the "api" prefix
  if (segments[0] === "api" && segments.length > 1) {
    return segments[1];
  }

  // Special case: login → auth
  if (segments[0] === "login") {
    return "auth";
  }

  return segments[0];
}

/**
 * Extract a human-readable name from a URL path.
 * e.g. /settings/memory → "Memory"
 * e.g. /projects → "Projects"
 * e.g. / → "Dashboard"
 */
function extractName(urlPath: string): string {
  const segments = urlPath.split("/").filter(Boolean);

  // For API routes, strip "api" and use the meaningful segment
  const meaningful = segments.filter((s: string) => s !== "api" && s !== "admin");

  if (meaningful.length === 0) {
    return "Dashboard";
  }

  // Use the last meaningful segment (not a dynamic param like :id)
  const last = meaningful[meaningful.length - 1];
  if (last.startsWith(":")) {
    // Use the second-to-last if available
    if (meaningful.length > 1) {
      return kebabToTitle(meaningful[meaningful.length - 2]);
    }
    return "Detail";
  }

  return kebabToTitle(last);
}

/**
 * Convert kebab-case to Title Case.
 * e.g. "model-config" → "Model Config"
 */
function kebabToTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Group route findings into features by area.
 * Routes under the same first-level directory form one feature.
 * API routes are grouped under the same feature as their page counterparts
 * by matching the area (first meaningful segment after stripping "api").
 */
export function groupRoutesIntoFeatures(findings: RouteFinding[]): FeatureFinding[] {
  const featureMap = new Map<string, FeatureFinding>();

  // First pass: create features from page routes
  for (const finding of findings) {
    if (finding.type === "page") {
      const featureKey = determineFeatureKeyFromPage(finding);
      if (!featureMap.has(featureKey)) {
        const parts = featureKey.split("/");
        const area = parts[0];
        const name = parts.length > 1 ? parts[1] : area;

        featureMap.set(featureKey, {
          area,
          name,
          title: kebabToTitle(name),
          apps: [],
          routes: [],
          outputPath: `features/${featureKey}.usm`,
        });
      }

      const feature = featureMap.get(featureKey)!;
      if (!feature.apps.includes(finding.app)) {
        feature.apps.push(finding.app);
      }
      feature.routes.push(finding);
    }
  }

  // Second pass: assign API routes to features based on their area
  for (const finding of findings) {
    if (finding.type === "api") {
      const featureKey = determineFeatureKeyFromApi(finding);

      if (!featureMap.has(featureKey)) {
        // This API route doesn't have a corresponding page feature — create a standalone one
        const parts = featureKey.split("/");
        const area = parts[0];
        const name = parts.length > 1 ? parts[1] : area;

        featureMap.set(featureKey, {
          area,
          name,
          title: kebabToTitle(name),
          apps: [],
          routes: [],
          outputPath: `features/${featureKey}.usm`,
        });
      }

      const feature = featureMap.get(featureKey)!;
      if (!feature.apps.includes(finding.app)) {
        feature.apps.push(finding.app);
      }
      feature.routes.push(finding);
    }
  }

  return Array.from(featureMap.values());
}

/**
 * Determine the feature key from a page route finding.
 * Pages define the primary feature grouping.
 */
function determineFeatureKeyFromPage(finding: RouteFinding): string {
  const urlPath = finding.path;
  const segments = urlPath.split("/").filter(Boolean);

  // Home page → dashboard
  if (segments.length === 0) {
    return "dashboard";
  }

  // Login → auth/login (match existing feature file)
  if (segments[0] === "login") {
    return "auth/login";
  }

  // admin prefix → keep as sub-area to avoid collisions across apps
  // e.g. /admin/dashboard → admin/dashboard (tenant admin dashboard)
  // This prevents /admin/dashboard (tenant) from colliding with /dashboard (architect)
  if (segments[0] === "admin" && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`;
  }

  // Single meaningful segment → that's the feature
  if (segments.length === 1) {
    return segments[0];
  }

  // Two segments: if second is static, it's a sub-feature
  // e.g. /settings/memory → settings/memory
  // e.g. /settings/doc-templates → settings/doc-templates
  const first = segments[0];
  const second = segments[1];

  if (second.startsWith(":")) {
    // /projects/:id → just "projects"
    return first;
  }

  return `${first}/${second}`;
}

/**
 * Determine the feature key from an API route finding.
 * API routes are grouped by their area (first meaningful segment after stripping "api").
 * They join the page feature if one exists for that area.
 */
function determineFeatureKeyFromApi(finding: RouteFinding): string {
  const urlPath = finding.path;
  const segments = urlPath.split("/").filter(Boolean);

  // API auth routes → auth/login
  if (segments.length >= 2 && segments[0] === "api" && segments[1] === "auth") {
    return "auth/login";
  }

  // Strip "api" prefix and dynamic segments (:id)
  const meaningful = segments.filter((s: string) => s !== "api" && !s.startsWith(":"));

  if (meaningful.length === 0) {
    return "dashboard";
  }

  // Single meaningful segment → simple key
  // e.g. /api/health → health
  // e.g. /api/credentials → credentials
  if (meaningful.length === 1) {
    return meaningful[0];
  }

  // Two meaningful segments → area/name sub-feature
  // e.g. /api/settings/memory → settings/memory
  // e.g. /api/agent/session → agent/session
  if (meaningful.length === 2) {
    return `${meaningful[0]}/${meaningful[1]}`;
  }

  // Three or more meaningful segments → use first two
  // e.g. /api/settings/providers/:id/models → settings/providers
  // e.g. /api/projects/:id/docs → projects/docs (:id stripped)
  return `${meaningful[0]}/${meaningful[1]}`;
}
