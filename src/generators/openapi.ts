import yaml from "js-yaml";
import type {
  FeatureUsm,
  GenerationResult,
  FeatureRoute,
  Contract,
} from "../types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_APP_DIRS: string[] = [];

const APP_URLS: Record<string, { prod: string; local: string; label: string }> = {};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function kebabToPascal(s: string): string {
  return s
    .split(/[/-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Convert a URL path to a valid TypeScript identifier suffix.
 *  /api/agent/events → ApiAgentEvents
 *  /api/projects/:id/docs → ApiProjectsByIdDocs
 *  /api/settings/providers/:id/models/:modelId → ApiSettingsProvidersByIdModelsByModelId
 */
function pathToTypeId(urlPath: string): string {
  return urlPath
    .replace(/^\//, "")
    .split("/")
    .map((segment) => {
      // :id → ById, :modelId → ByModelId, :...path → ByPath
      if (segment.startsWith(":")) {
        const name = segment.replace(/^:/, "").replace(/^\.\.\./, "");
        return "By" + kebabToPascal(name);
      }
      return kebabToPascal(segment);
    })
    .join("");
}

function pathToOperationId(method: string, urlPath: string): string {
  const methodLower = method.toLowerCase();
  const typeSafe = pathToTypeId(urlPath);
  return `${methodLower}${typeSafe}`;
}

function inferArea(featureId: string): string {
  const parts = featureId.split("/");
  const afterSystem = parts.slice(1);
  if (afterSystem.length === 1) {
    return afterSystem[0];
  }
  return afterSystem[0];
}

function inferAppName(feature: FeatureUsm): string {
  if (feature.apps && feature.apps.length > 0) return feature.apps[0];
  if (feature.$service) {
    const slug = feature.$service.split("/").pop() || "";
    if (KNOWN_APP_DIRS.includes(slug)) return slug;
  }
  return "unknown";
}

function inferFeatureSlugFromId(featureId: string): string {
  const parts = featureId.split("/");
  return parts.slice(1).join("/");
}

function scopeFromApp(_appName: string): string[] {
  // Dynamic: derive scopes from feature contracts or default to ["read"]
  return ["read"];
}

/** Extract path parameter names from a URL path.
 *  /api/projects/:id/docs/:...path → ["id", "...path"]
 */
function extractPathParams(urlPath: string): string[] {
  const matches = urlPath.match(/:([\w.]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}

/** Convert a path param name to a valid TS property name.
 *  "...path" → "path" (catch-all becomes string)
 *  "id" → "id"
 *  "modelId" → "modelId"
 */
function sanitizeParamName(name: string): string {
  return name.replace(/^\.\.\./, "");
}

// ─── Collect features with API routes ─────────────────────────────────────────

interface ApiRouteInfo {
  feature: FeatureUsm;
  featureSlug: string;
  route: FeatureRoute;
  appName: string;
  area: string;
  contracts: Contract[];
}

function collectApiRoutes(features: FeatureUsm[]): ApiRouteInfo[] {
  const routes: ApiRouteInfo[] = [];
  for (const feat of features) {
    if (!feat.routes) continue;
    const appName = inferAppName(feat);
    const area = inferArea(feat.$id);
    const featureSlug = inferFeatureSlugFromId(feat.$id);

    for (const route of feat.routes) {
      if (route.type !== "api") continue;
      if (!route.http_methods || route.http_methods.length === 0) continue;
      routes.push({
        feature: feat,
        featureSlug,
        route,
        appName,
        area,
        contracts: feat.contracts || [],
      });
    }
  }
  return routes;
}

// ─── Generate OpenAPI 3.1 spec ────────────────────────────────────────────────

export function generateOpenApiSpec(
  features: FeatureUsm[],
  root: string
): GenerationResult {
  const apiRoutes = collectApiRoutes(features);

  if (apiRoutes.length === 0) {
    return {
      outputs: [
        {
          path: `${root}/.usm-workspace/docs/api/openapi.yaml`,
          content: `openapi: 3.1.0
info:
  title: Smith & Gray AI Platform API
  version: 1.0.0
  description: Auto-generated from .usm/features/*.usm routes and contracts — no API routes found yet
servers: []
security: []
paths: {}
components:
  securitySchemes: {}
  schemas: {}
tags: []
`,
        },
      ],
    };
  }

  // Collect unique apps from routes
  const appsInRoutes = new Set(apiRoutes.map((r) => r.appName));

  // Servers
  const servers: Array<{ url: string; description: string }> = [];
  for (const appName of appsInRoutes) {
    const urls = APP_URLS[appName];
    if (urls) {
      servers.push({ url: urls.prod, description: `${urls.label} (production)` });
      servers.push({ url: urls.local, description: `Local dev — ${urls.label}` });
    }
  }
  if (servers.length === 0) {
    servers.push({ url: "http://localhost:3004", description: "Local dev — default" });
  }

  // Security
  const security: Array<Record<string, string[]>> = [{ zitadelOidc: [] }];

  // Paths — group by path, then by method
  const paths: Record<string, Record<string, unknown>> = {};
  const seenPaths = new Map<string, Map<string, ApiRouteInfo>>();

  for (const info of apiRoutes) {
    const urlPath = info.route.path;
    if (!seenPaths.has(urlPath)) {
      seenPaths.set(urlPath, new Map());
    }
    for (const method of info.route.http_methods || []) {
      seenPaths.get(urlPath)!.set(method.toLowerCase(), info);
    }
  }

  for (const [urlPath, methodMap] of seenPaths) {
    const pathItem: Record<string, unknown> = {};

    for (const [method, info] of methodMap) {
      const operationId = pathToOperationId(method, urlPath);
      const scopes = scopeFromApp(info.appName);
      const contract = info.contracts.find(
        (c) => c.id.toLowerCase().includes(info.area) || c.id.toLowerCase().includes("api")
      );

      const descriptionLines: string[] = [];
      descriptionLines.push(`Auto-generated from .usm/features/${info.featureSlug}.usm`);
      if (contract) {
        descriptionLines.push(`Contract: ${contract.id}`);
        if (contract.must_have) {
          for (const mh of contract.must_have) {
            const text = typeof mh === "string" ? mh : JSON.stringify(mh);
            descriptionLines.push(`- ${text}`);
          }
        }
      }

      // Determine response schemas
      const schemaName = kebabToPascal(info.featureSlug.replace(/\//g, "-"));
      const responses: Record<string, unknown> = {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    $ref: `#/components/schemas/${schemaName}`,
                  },
                },
              },
            },
          },
        },
      };

      if (info.route.auth_required) {
        responses["401"] = { description: "Unauthorized — missing or invalid auth token" };
        responses["403"] = { description: "Forbidden — insufficient role" };
      }

      // Add error responses from contracts
      if (contract && contract.must_have) {
        for (const mh of contract.must_have) {
          const text = typeof mh === "string" ? mh : "";
          if (text.includes("400")) {
            responses["400"] = { description: "Bad request — missing or invalid parameters" };
          }
          if (text.includes("404")) {
            responses["404"] = { description: "Not found" };
          }
          if (text.includes("500")) {
            responses["500"] = { description: "Internal server error" };
          }
        }
      }

      const operation: Record<string, unknown> = {
        summary: info.feature.summary.split("\n")[0].substring(0, 80),
        description: descriptionLines.join("\n"),
        tags: [info.area],
        operationId,
        security: info.route.auth_required
          ? [{ zitadelOidc: scopes }]
          : [],
        responses,
      };

      // SSE streams use text/event-stream content type
      if (urlPath.includes("/stream") && method === "get") {
        if (responses["200"] && typeof responses["200"] === "object") {
          const resp200 = responses["200"] as Record<string, unknown>;
          const content = resp200.content as Record<string, unknown>;
          content["text/event-stream"] = {
            schema: {
              type: "string",
              description: "Server-Sent Events stream of JSON-encoded messages",
            },
          };
        }
      }

      pathItem[method] = operation;
    }

    paths[urlPath] = pathItem;
  }

  // Schemas — one per feature that has API routes
  const schemas: Record<string, unknown> = {};
  const featuresWithApiRoutes = new Map<string, FeatureUsm>();

  for (const info of apiRoutes) {
    if (!featuresWithApiRoutes.has(info.featureSlug)) {
      featuresWithApiRoutes.set(info.featureSlug, info.feature);
    }
  }

  for (const [slug, feat] of featuresWithApiRoutes) {
    const schemaName = kebabToPascal(slug.replace(/\//g, "-"));

    // Build best-effort properties from feature context
    const properties: Record<string, unknown> = {
      id: { type: "string", format: "uuid", description: "Unique identifier" },
    };

    const area = inferArea(feat.$id);
    if (area === "agent") {
      properties["status"] = {
        type: "string",
        enum: ["active", "paused", "completed", "failed"],
        description: "Current status",
      };
      properties["type"] = { type: "string", description: "Type of entity" };
      properties["timestamp"] = { type: "string", format: "date-time", description: "When this occurred" };
      properties["data"] = { type: "object", description: "Payload data" };
    }

    // Add properties inferred from contracts
    if (feat.contracts) {
      for (const contract of feat.contracts) {
        if (contract.must_have) {
          for (const mh of contract.must_have) {
            const text = typeof mh === "string" ? mh : "";
            if (text.includes("events array")) {
              properties["events"] = {
                type: "array",
                items: { $ref: `#/components/schemas/${schemaName}Event` },
                description: "List of events",
              };
              properties["total"] = { type: "integer", description: "Total count" };
            }
            if (text.includes("sessions array")) {
              properties["sessions"] = {
                type: "array",
                items: { $ref: `#/components/schemas/${schemaName}Item` },
                description: "List of sessions",
              };
            }
            if (text.includes("sessionId")) {
              properties["sessionId"] = { type: "string", description: "Session identifier" };
            }
          }
        }
      }
    }

    schemas[schemaName] = {
      type: "object",
      description: [
        `Auto-generated from .usm/features/${slug}.usm`,
        `See [Feature: ${slug}](../features/${slug}.md)`,
      ].join("\n"),
      properties,
    };

    // Add event/item sub-schemas for agent features
    if (area === "agent") {
      schemas[`${schemaName}Event`] = {
        type: "object",
        description: `Event within a ${schemaName}`,
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["message", "tool_call", "tool_result", "error"] },
          timestamp: { type: "string", format: "date-time" },
          data: { type: "object" },
        },
      };
    }
  }

  // Security schemes — generic OIDC placeholder
  const securitySchemes = {
    oidc: {
      type: "oauth2",
      flows: {
        authorizationCode: {
          authorizationUrl: "https://auth.example.com/oauth/v2/authorize",
          tokenUrl: "https://auth.example.com/oauth/v2/token",
          scopes: {
            read: "Read access",
            write: "Write access",
          },
        },
      },
    },
  };

  // Tags — one per unique area
  const areaDescriptions: Record<string, string> = {
    agent: "Agent session management",
    auth: "Authentication and authorization",
    files: "File browsing and editing",
    git: "Git operations",
    projects: "Project management",
    settings: "Platform settings and configuration",
    tickets: "Ticket management",
    users: "User management",
    admin: "Admin operations",
    internal: "Internal operations",
    sessions: "Session views",
    health: "Health checks",
    kanban: "Kanban board",
    dashboard: "Dashboard views",
    analytics: "Analytics and metrics",
    credentials: "Credential management",
    security: "Security monitoring",
    tenants: "Tenant management",
    superadmins: "Superadmin management",
  };

  const seenAreas = new Set<string>();
  for (const info of apiRoutes) {
    seenAreas.add(info.area);
  }
  const tags: Array<{ name: string; description: string }> = [];
  for (const area of seenAreas) {
    tags.push({
      name: area,
      description: areaDescriptions[area] || `${area} operations`,
    });
  }

  // Build the full spec
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Smith & Gray AI Platform API",
      version: "1.0.0",
      description: "Auto-generated from .usm/features/*.usm routes and contracts",
    },
    servers,
    security,
    paths,
    components: {
      securitySchemes,
      schemas,
    },
    tags,
  };

  const yamlContent = yaml.dump(spec, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: "'",
    forceQuotes: false,
  });

  return {
    outputs: [
      {
        path: `${root}/.usm-workspace/docs/api/openapi.yaml`,
        content: yamlContent,
      },
    ],
  };
}

// ─── Generate TypeScript types ────────────────────────────────────────────────

export function generateOpenApiTypes(
  features: FeatureUsm[],
  root: string
): GenerationResult {
  const apiRoutes = collectApiRoutes(features);
  const lines: string[] = [];

  lines.push("// Auto-generated TypeScript types from .usm/features/*.usm");
  lines.push("// Source: usm generate → docs/api/openapi.yaml");
  lines.push("// DO NOT EDIT — regenerate with: pnpm --filter usm generate");
  lines.push("");

  // Collect features with API routes for schema generation
  const featuresWithApiRoutes = new Map<string, FeatureUsm>();
  for (const info of apiRoutes) {
    if (!featuresWithApiRoutes.has(info.featureSlug)) {
      featuresWithApiRoutes.set(info.featureSlug, info.feature);
    }
  }

  // ── Schema interfaces ──
  for (const [slug, feat] of featuresWithApiRoutes) {
    const schemaName = kebabToPascal(slug.replace(/\//g, "-"));
    const area = inferArea(feat.$id);

    lines.push(`export interface ${schemaName} {`);
    lines.push("  id: string;");

    if (area === "agent") {
      lines.push("  status: 'active' | 'paused' | 'completed' | 'failed';");
      lines.push("  type: string;");
      lines.push("  timestamp: string;");
      lines.push("  data: Record<string, unknown>;");
    }

    // Infer from contracts
    if (feat.contracts) {
      for (const contract of feat.contracts) {
        if (contract.must_have) {
          for (const mh of contract.must_have) {
            const text = typeof mh === "string" ? mh : "";
            if (text.includes("events array")) {
              lines.push(`  events: ${schemaName}Event[];`);
              lines.push("  total: number;");
            }
            if (text.includes("sessions array")) {
              lines.push(`  sessions: ${schemaName}Item[];`);
            }
            if (text.includes("sessionId")) {
              lines.push("  sessionId: string;");
            }
          }
        }
      }
    }

    lines.push("}");
    lines.push("");

    // Sub-schemas for agent features
    if (area === "agent") {
      lines.push(`export interface ${schemaName}Event {`);
      lines.push("  id: string;");
      lines.push("  type: 'message' | 'tool_call' | 'tool_result' | 'error';");
      lines.push("  timestamp: string;");
      lines.push("  data: Record<string, unknown>;");
      lines.push("}");
      lines.push("");
    }

    // Item sub-schema for features that reference sessions arrays
    let hasSessionsArray = false;
    if (feat.contracts) {
      for (const contract of feat.contracts) {
        if (contract.must_have) {
          for (const mh of contract.must_have) {
            const text = typeof mh === "string" ? mh : "";
            if (text.includes("sessions array")) hasSessionsArray = true;
          }
        }
      }
    }
    if (hasSessionsArray) {
      lines.push(`export interface ${schemaName}Item {`);
      lines.push("  id: string;");
      lines.push("  status: 'active' | 'paused' | 'completed' | 'failed';");
      lines.push("  data: Record<string, unknown>;");
      lines.push("}");
      lines.push("");
    }
  }

  // ── Per-route params and response interfaces ──
  // Group by (path, method) to avoid duplicates
  const seenPathMethods = new Set<string>();
  for (const info of apiRoutes) {
    for (const method of info.route.http_methods || []) {
      const key = `${method.toLowerCase()}:${info.route.path}`;
      if (seenPathMethods.has(key)) continue;
      seenPathMethods.add(key);

      const methodPascal = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
      const routeKey = pathToTypeId(info.route.path);
      const paramsName = `${methodPascal}${routeKey}Params`;
      const responseName = `${methodPascal}${routeKey}Response`;

      // Params — from path and query
      lines.push(`export interface ${paramsName} {`);

      // Extract path params like /sessions/:id → id: string
      const pathParams = extractPathParams(info.route.path);
      for (const pp of pathParams) {
        const propName = sanitizeParamName(pp);
        lines.push(`  ${propName}: string;`);
      }

      // Query params inferred from feature context (only if no path params exist)
      if (pathParams.length === 0) {
        if (info.route.path.includes("/events") || info.route.path.includes("/stream")) {
          lines.push("  sessionId?: string;");
          lines.push("  projectId?: string;");
          lines.push("  limit?: number;");
          lines.push("  offset?: number;");
        }
        if (info.route.path.includes("/session") && method.toLowerCase() === "get") {
          lines.push("  id?: string;");
        }
      }

      lines.push("}");
      lines.push("");

      // Response
      const schemaName = kebabToPascal(info.featureSlug.replace(/\//g, "-"));
      lines.push(`export interface ${responseName} {`);
      if (info.route.path.includes("/stream") && method.toLowerCase() === "get") {
        lines.push("  // SSE stream — use EventSource API");
        lines.push("  stream: string;");
      } else {
        lines.push(`  data: ${schemaName};`);
      }
      lines.push("}");
      lines.push("");
    }
  }

  // ── ApiPaths mega-interface ──
  // Group all methods for the same path under one key
  lines.push("export interface ApiPaths {");

  const pathMethodMap = new Map<string, Map<string, ApiRouteInfo>>();
  for (const info of apiRoutes) {
    const urlPath = info.route.path;
    if (!pathMethodMap.has(urlPath)) {
      pathMethodMap.set(urlPath, new Map());
    }
    for (const method of info.route.http_methods || []) {
      const methodLower = method.toLowerCase();
      pathMethodMap.get(urlPath)!.set(methodLower, info);
    }
  }

  for (const [urlPath, methodEntries] of pathMethodMap) {
    // OpenAPI paths use {id} for path params, but we keep the original :id style
    // since these are .usm paths, not OpenAPI paths
    lines.push(`  '${urlPath}': {`);
    for (const [methodLower, info] of methodEntries) {
      const methodPascal = methodLower.charAt(0).toUpperCase() + methodLower.slice(1);
      const routeKey = pathToTypeId(info.route.path);
      const paramsName = `${methodPascal}${routeKey}Params`;
      const responseName = `${methodPascal}${routeKey}Response`;

      lines.push(`    ${methodPascal}: {`);
      lines.push(`      params: ${paramsName};`);
      lines.push(`      response: ${responseName};`);
      lines.push("    };");
    }
    lines.push("  };");
  }
  lines.push("}");

  return {
    outputs: [
      {
        path: `${root}/packages/types/src/openapi.ts`,
        content: lines.join("\n"),
      },
    ],
  };
}
