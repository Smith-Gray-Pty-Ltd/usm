// usm scan — Scan the codebase and generate .usm files from detected structure

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import yaml from "js-yaml";
import type {
  UsmConfig,
  ScanResult,
  ScanOptions,
  PackageJsonInfo,
  ServiceRuleKind,
  SharedPackageKind,
  DetectedDockerService,
  FeatureFinding,
  MergeStrategy,
} from "./types.js";
import {
  readPackageJson,
  detectRuntime,
  detectPort,
  parsePrismaModels,
  parseDockerCompose,
  extractSmithGrayDependencies,
  shortNameFromPath,
  shortNameFromPackageJson,
  yamlStringify,
  todayDate,
} from "./utils.js";
import { extractRoutes, groupRoutesIntoFeatures } from "./routes.js";
import { smartMerge } from "./merge.js";
import type { RouteFinding } from "./types.js";

/**
 * Main scan function — reads usmconfig.json, scans the codebase, and generates .usm files.
 */
export async function scanStructural(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();
  const root = path.resolve(options.root);
  const configPath = path.resolve(options.configPath);

  // 1. Read and validate usmconfig.json
  const config = readConfig(configPath);

  // 2. Prepare output directories
  const usmSourceDir = path.resolve(root, config.outputs?.usm_source || ".usm/");

  // 3. Initialize result
  const result: ScanResult = {
    files_written: [],
    files_skipped: [],
    warnings: [],
    stats: {
      services_found: 0,
      packages_found: 0,
      data_models_found: 0,
      features_found: 0,
    },
  };

  // Skip service/package/data detection if --routes flag
  if (!options.routesOnly) {
    // 4. Scan services (from apps/* directories)
    const serviceRules = config.services || [];
    const excludePatterns = config.sources?.exclude || ["**/node_modules/**", "**/dist/**"];

    for (const rule of serviceRules) {
      const matchedDirs = fg.sync([rule.match], {
        cwd: root,
        absolute: true,
        onlyDirectories: true,
        ignore: excludePatterns,
      });

      for (const dir of matchedDirs) {
        const pkgJsonPath = path.join(dir, "package.json");
        if (!fs.existsSync(pkgJsonPath)) {
          result.warnings?.push(`No package.json found at ${dir}`);
          continue;
        }

        const pkgJson = readPackageJson(pkgJsonPath);
        if (!pkgJson) continue;

        const relativePath = path.relative(root, dir);
        const name = shortNameFromPackageJson(pkgJson.name) || shortNameFromPath(relativePath);

        const writeOutcome = generateServiceUsm({
          root,
          usmSourceDir,
          name,
          relativePath,
          pkgJson,
          kind: rule.kind,
          systemName: config.name,
          force: options.force,
          mergeStrategy: options.mergeStrategy,
          existingSummary: rule.summary,
        });

        recordFileOutcome(result, `.usm/services/${name}.usm`, "service", "package.json", writeOutcome);
        result.stats!.services_found!++;
      }
    }

    // 5. Scan shared packages
    const sharedRules = config.shared || [];
    for (const rule of sharedRules) {
      const matchedDirs = fg.sync([rule.match], {
        cwd: root,
        absolute: true,
        onlyDirectories: true,
        ignore: excludePatterns,
      });

      for (const dir of matchedDirs) {
        const pkgJsonPath = path.join(dir, "package.json");
        if (!fs.existsSync(pkgJsonPath)) continue;

        const pkgJson = readPackageJson(pkgJsonPath);
        if (!pkgJson) continue;

        const relativePath = path.relative(root, dir);
        const name = rule.id || shortNameFromPackageJson(pkgJson.name) || shortNameFromPath(relativePath);

        const writeOutcome = generateSharedPackageUsm({
          root,
          usmSourceDir,
          name,
          relativePath,
          pkgJson,
          kind: rule.kind,
          systemName: config.name,
          force: options.force,
          mergeStrategy: options.mergeStrategy,
          existingSummary: rule.summary,
        });

        recordFileOutcome(result, `.usm/services/${name}.usm`, "service", "package.json", writeOutcome);
        result.stats!.packages_found!++;
      }
    }

    // 6. Scan data models (Prisma schemas)
    const dataRules = config.data || [];
    for (const rule of dataRules) {
      const matchedFiles = fg.sync([rule.match], {
        cwd: root,
        absolute: true,
        ignore: excludePatterns,
      });

      for (const filePath of matchedFiles) {
        const prismaSchema = parsePrismaModels(filePath);
        const relativePath = path.relative(root, filePath);
        const name = "models"; // Data files are named "models.usm"

        const writeOutcome = generateDataUsm({
          root,
          usmSourceDir,
          name,
          schemaPath: relativePath,
          models: prismaSchema.models,
          systemName: config.name,
          force: options.force,
          mergeStrategy: options.mergeStrategy,
        });

        recordFileOutcome(result, `.usm/data/${name}.usm`, "data", "prisma schema", writeOutcome);
        result.stats!.data_models_found!++;
      }
    }

    // 7. Scan Docker Compose for platform services
    const dockerFiles = fg.sync(["docker-compose.yml"], {
      cwd: root,
      absolute: true,
      ignore: excludePatterns,
    });

    for (const dockerFile of dockerFiles) {
      const dockerServices = parseDockerCompose(dockerFile);

      // Only generate .usm for infrastructure services (not app containers like nextjs)
      const infrastructureServiceNames = ["zitadel", "litellm", "langflow", "postgres", "nango"];

      for (const svc of dockerServices) {
        if (!infrastructureServiceNames.includes(svc.name)) continue;

        const writeOutcome = generateDockerServiceUsm({
          root,
          usmSourceDir,
          service: svc,
          systemName: config.name,
          force: options.force,
          mergeStrategy: options.mergeStrategy,
        });

        recordFileOutcome(result, `.usm/services/${svc.name}.usm`, "service", "docker-compose.yml", writeOutcome);
        result.stats!.services_found!++;
      }
    }
  }

  // 8. Extract routes and generate feature .usm files
  const appDirs = fg.sync(["apps/*/app"], {
    cwd: root,
    absolute: true,
    onlyDirectories: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  });

  // Collect raw routes from every app, then call groupRoutesIntoFeatures ONCE
  // so features with the same URL pattern across apps are merged (e.g. the
  // tenant app's /api/tenants and the platform app's /tenants both belong
  // to the "tenants" feature). Calling it per-app caused cross-app collisions
  // where the last app's feature overwrote the previous app's file.
  const allRawRoutes: RouteFinding[] = [];

  for (const appDir of appDirs) {
    // Derive app name from path: apps/the-architect/app → the-architect
    const appParent = path.dirname(appDir);
    const appName = path.basename(appParent);
    const routes = await extractRoutes(appDir, appName);
    allRawRoutes.push(...routes);
  }

  const allFindings = groupRoutesIntoFeatures(allRawRoutes);

  result.stats!.features_found = allFindings.length;

  for (const feature of allFindings) {
    const writeOutcome = generateFeatureUsm({
      root,
      usmSourceDir,
      feature,
      systemName: config.name,
      force: options.force,
      mergeStrategy: options.mergeStrategy,
    });

    recordFileOutcome(result, `.usm/${feature.outputPath}`, "feature", "route extraction", writeOutcome);
  }

  // 9. Update system.usm with the new index
  const systemUpdated = updateSystemUsm({
    root,
    usmSourceDir,
    config,
    result,
    force: options.force,
    mergeStrategy: options.mergeStrategy,
    allFindings,
  });

  if (systemUpdated) {
    result.files_written.push({
      path: ".usm/system.usm",
      type: "system",
      source: "scan update",
    });
  }

  // 10. Record duration
  result.stats!.duration_ms = Date.now() - startTime;

  // 11. Detect duplicate $ids (defensive)
  const duplicates = detectDuplicateIds(usmSourceDir);
  if (duplicates.length > 0) {
    const msg = `Found ${duplicates.length} duplicate $id(s) in .usm files — this may cause overwrites during generation:`;
    result.warnings?.push(msg);
    for (const dup of duplicates) {
      result.warnings?.push(`  $id="${dup.id}" appears in: ${dup.paths.map(p => path.relative(root, p)).join(", ")}`);
    }
  }

  return result;
}

/**
 * Record the outcome of a file write operation into the scan result.
 */
function recordFileOutcome(
  result: ScanResult,
  filePath: string,
  type: "service" | "feature" | "data",
  source: string,
  outcome: WriteOutcome
): void {
  if (outcome.written) {
    result.files_written.push({
      path: filePath,
      type,
      source,
    });
  } else if (outcome.merged) {
    result.files_written.push({
      path: filePath,
      type,
      source: `${source} (smart merge: preserved ${outcome.preservedKeys.join(", ")})`,
    });
  } else {
    result.files_skipped.push({
      path: filePath,
      reason: outcome.skipReason || "already exists",
    });
  }

  if (outcome.warnings.length > 0) {
    result.warnings?.push(...outcome.warnings);
  }
}

/**
 * Read and parse usmconfig.json.
 */
function readConfig(configPath: string): UsmConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Run 'usm init' first.`);
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(content) as UsmConfig;

  if (!config.version || config.version !== "1") {
    throw new Error(`Invalid usmconfig version: ${config.version}. Expected "1".`);
  }

  return config;
}

// ─── Write outcome tracking ─────────────────────────────────────────────────

interface WriteOutcome {
  written: boolean;
  merged: boolean;
  preservedKeys: string[];
  skipReason?: string;
  warnings: string[];
}

/**
 * Apply merge strategy to decide whether to write a file.
 */
function applyMergeStrategy(
  outputPath: string,
  generated: Record<string, unknown>,
  force: boolean,
  mergeStrategy: MergeStrategy
): WriteOutcome {
  if (force) {
    // --force: always overwrite
    return { written: true, merged: false, preservedKeys: [], warnings: [] };
  }

  if (!fs.existsSync(outputPath)) {
    // File doesn't exist: write it
    return { written: true, merged: false, preservedKeys: [], warnings: [] };
  }

  if (mergeStrategy === "skip") {
    // --no-merge: skip existing files (old default behavior)
    return { written: false, merged: false, preservedKeys: [], skipReason: "already exists (use --force to overwrite)", warnings: [] };
  }

  if (mergeStrategy === "overwrite") {
    // Overwrite without care
    return { written: true, merged: false, preservedKeys: [], warnings: [] };
  }

  if (mergeStrategy === "smart") {
    // Smart merge: preserve human edits, update mechanical fields
    const existingContent = fs.readFileSync(outputPath, "utf-8");
    const mergeResult = smartMerge(existingContent, generated);

    // Write the merged result
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(mergeResult.merged), "utf-8");

    return {
      written: false,
      merged: true,
      preservedKeys: mergeResult.preservedKeys,
      warnings: mergeResult.warnings,
    };
  }

  // Default: skip
  return { written: false, merged: false, preservedKeys: [], skipReason: "already exists", warnings: [] };
}

// ─── Service .usm generator ─────────────────────────────────────────────────

interface ServiceUsmParams {
  root: string;
  usmSourceDir: string;
  name: string;
  relativePath: string;
  pkgJson: PackageJsonInfo;
  kind: ServiceRuleKind;
  systemName: string;
  force: boolean;
  mergeStrategy: MergeStrategy;
  existingSummary?: string;
}

function generateServiceUsm(params: ServiceUsmParams): WriteOutcome {
  const { usmSourceDir, name, relativePath, pkgJson, kind, systemName, force, mergeStrategy, existingSummary } = params;
  const outputPath = path.join(usmSourceDir, "services", `${name}.usm`);

  const runtime = detectRuntime(pkgJson);
  const port = detectPort(pkgJson);
  const deps = extractSmithGrayDependencies(pkgJson);
  const summary = existingSummary || `TODO: describe the ${name} service`;

  const usmObj: Record<string, unknown> = {
    "$schema": "https://usm.dev/schema/v1.json",
    "$id": `smith-gray/${name}`,
    "$type": "service",
    "$version": 1,
    "$last_updated": todayDate(),
    "summary": summary,
    "$system": `${systemName}/system`,
    "type": mapServiceKindToUsmType(kind),
    "runtime": runtime,
    "paths": [relativePath],
    "depends_on": deps,
  };

  if (port) {
    usmObj["port"] = port;
  }

  // Dev config
  const devCommand = pkgJson.scripts?.dev || "";
  const devUrl = port ? `http://localhost:${port}` : undefined;

  usmObj["dev"] = {
    command: devCommand || "npm run dev",
    ...(devUrl ? { url: devUrl } : {}),
    env: {},
  };

  // Prod config (placeholder)
  usmObj["prod"] = {
    url: "",
    region: "",
    deployment_ref: "",
  };

  // Testing config (placeholder)
  usmObj["testing"] = {
    framework: "",
    command: "",
    coverage_target: "",
  };

  // Security config (placeholder)
  usmObj["security"] = {
    auth_method: "",
    secrets_ref: "",
  };

  usmObj["risks"] = [];
  usmObj["future"] = [];
  usmObj["decisions"] = [];
  usmObj["modules"] = [];

  // Apply merge strategy
  const outcome = applyMergeStrategy(outputPath, usmObj, force, mergeStrategy);

  if (outcome.written) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(usmObj), "utf-8");
  }

  return outcome;
}

// ─── Shared package .usm generator ──────────────────────────────────────────

interface SharedPackageUsmParams {
  root: string;
  usmSourceDir: string;
  name: string;
  relativePath: string;
  pkgJson: PackageJsonInfo;
  kind: SharedPackageKind;
  systemName: string;
  force: boolean;
  mergeStrategy: MergeStrategy;
  existingSummary?: string;
}

function generateSharedPackageUsm(params: SharedPackageUsmParams): WriteOutcome {
  const { usmSourceDir, name, relativePath, pkgJson, kind, systemName, force, mergeStrategy, existingSummary } = params;
  const outputPath = path.join(usmSourceDir, "services", `${name}.usm`);

  const deps = extractSmithGrayDependencies(pkgJson);
  const summary = existingSummary || `TODO: describe the ${name} shared package`;

  const usmObj: Record<string, unknown> = {
    "$schema": "https://usm.dev/schema/v1.json",
    "$id": `smith-gray/${name}`,
    "$type": "service",
    "$version": 1,
    "$last_updated": todayDate(),
    "summary": summary,
    "$system": `${systemName}/system`,
    "type": mapSharedKindToUsmType(kind),
    "runtime": "shared-library",
    "paths": [relativePath],
    "depends_on": deps,
  };

  usmObj["dev"] = {
    command: "npm run build",
    env: {},
  };

  usmObj["risks"] = [];
  usmObj["future"] = [];
  usmObj["decisions"] = [];
  usmObj["modules"] = [];

  const outcome = applyMergeStrategy(outputPath, usmObj, force, mergeStrategy);

  if (outcome.written) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(usmObj), "utf-8");
  }

  return outcome;
}

// ─── Data .usm generator ────────────────────────────────────────────────────

interface DataUsmParams {
  root: string;
  usmSourceDir: string;
  name: string;
  schemaPath: string;
  models: string[];
  systemName: string;
  force: boolean;
  mergeStrategy: MergeStrategy;
}

function generateDataUsm(params: DataUsmParams): WriteOutcome {
  const { usmSourceDir, name, schemaPath, models, systemName, force, mergeStrategy } = params;
  const outputPath = path.join(usmSourceDir, "data", `${name}.usm`);

  const usmObj: Record<string, unknown> = {
    "$schema": "https://usm.dev/schema/v1.json",
    "$id": `smith-gray/${name}`,
    "$type": "service",
    "$version": 1,
    "$last_updated": todayDate(),
    "summary": `Platform database — ${models.length} models managed via Prisma ORM`,
    "$system": `${systemName}/system`,
    "type": "database",
    "runtime": "prisma",
    "port": 5432,
    "paths": [schemaPath],
    "depends_on": [],
    "dev": {
      command: "docker compose up postgres",
      url: "postgresql://postgres:...@localhost:5432/postgres",
      env: {
        DATABASE_URL: "postgresql://postgres:...@localhost:5432/postgres",
      },
    },
    "modules": models.map((model) => ({
      name: model,
      purpose: `TODO: describe the ${model} model`,
    })),
  };

  const outcome = applyMergeStrategy(outputPath, usmObj, force, mergeStrategy);

  if (outcome.written) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(usmObj), "utf-8");
  }

  return outcome;
}

// ─── Docker service .usm generator ──────────────────────────────────────────

interface DockerServiceUsmParams {
  root: string;
  usmSourceDir: string;
  service: DetectedDockerService;
  systemName: string;
  force: boolean;
  mergeStrategy: MergeStrategy;
}

function generateDockerServiceUsm(params: DockerServiceUsmParams): WriteOutcome {
  const { usmSourceDir, service, systemName, force, mergeStrategy } = params;
  const outputPath = path.join(usmSourceDir, "services", `${service.name}.usm`);

  const usmType = mapDockerServiceToUsmType(service.name);
  const port = service.ports?.[0] ? parseInt(service.ports[0], 10) : undefined;
  const summary = getDockerServiceSummary(service.name);

  const usmObj: Record<string, unknown> = {
    "$schema": "https://usm.dev/schema/v1.json",
    "$id": `smith-gray/${service.name}`,
    "$type": "service",
    "$version": 1,
    "$last_updated": todayDate(),
    "summary": summary,
    "$system": `${systemName}/system`,
    "type": usmType,
    "runtime": "docker",
  };

  if (port) {
    usmObj["port"] = port;
  }

  usmObj["paths"] = ["docker-compose.yml"];
  usmObj["depends_on"] = service.depends_on || [];
  usmObj["dev"] = {
    command: `docker compose up ${service.name}`,
    ...(port ? { url: `http://localhost:${port}` } : {}),
    env: {},
  };

  usmObj["risks"] = [];
  usmObj["future"] = [];
  usmObj["decisions"] = [];
  usmObj["modules"] = [];

  const outcome = applyMergeStrategy(outputPath, usmObj, force, mergeStrategy);

  if (outcome.written) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(usmObj), "utf-8");
  }

  return outcome;
}

// ─── Feature .usm generator ─────────────────────────────────────────────────

interface FeatureUsmParams {
  root: string;
  usmSourceDir: string;
  feature: FeatureFinding;
  systemName: string;
  force: boolean;
  mergeStrategy: MergeStrategy;
}

function generateFeatureUsm(params: FeatureUsmParams): WriteOutcome {
  const { usmSourceDir, feature, systemName, force, mergeStrategy } = params;
  const outputPath = path.join(usmSourceDir, feature.outputPath);

  // Build the feature .usm content
  const primaryApp = feature.apps[0] || "unknown";
  const pageRoutes = feature.routes.filter((r) => r.type === "page");
  const apiRoutes = feature.routes.filter((r) => r.type === "api");

  const usmObj: Record<string, unknown> = {
    "$schema": "https://usm.dev/schema/v1.json",
    "$id": feature.area === feature.name ? `smith-gray/${feature.name}` : `smith-gray/${feature.area}/${feature.name}`,
    "$type": "feature",
    "$version": 1,
    "$last_updated": todayDate(),
    "summary": `TODO: describe the ${feature.title} feature — ${pageRoutes.length} pages, ${apiRoutes.length} API endpoints`,
    "$system": `${systemName}/system`,
    "$service": `smith-gray/${primaryApp}`,
    "intent": "TODO: describe why this feature exists",
    "decisions": [],
    "flows": [],
    "interfaces": pageRoutes.length > 0 ? pageRoutes.map((r) => ({
      page: r.path,
      elements: [],
      visibility: [],
    })) : [],
    "contracts": [],
    "tests": [],
    "implementation": {
      primary: feature.routes.map((r) => r.file_path.replace(/^.*\/apps\//, "apps/")).join(", "),
      ui: pageRoutes.length > 0 ? pageRoutes[0].file_path.replace(/^.*\/apps\//, "apps/") : "",
      test_code: "",
      test_code_status: "none",
    },
    "see_also": [],
    // Route metadata (extra fields for scan-generated features)
    "routes": feature.routes.map((r) => ({
      path: r.path,
      type: r.type,
      http_methods: r.http_methods,
      file_path: r.file_path.replace(/^.*\/apps\//, "apps/"),
      app: r.app,
      ...(r.auth_required ? { auth_required: r.auth_required } : {}),
    })),
    "apps": feature.apps,
  };

  const outcome = applyMergeStrategy(outputPath, usmObj, force, mergeStrategy);

  if (outcome.written) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, yamlStringify(usmObj), "utf-8");
  }

  return outcome;
}

// ─── Update system.usm ──────────────────────────────────────────────────────

interface UpdateSystemParams {
  root: string;
  usmSourceDir: string;
  config: UsmConfig;
  result: ScanResult;
  force: boolean;
  mergeStrategy: MergeStrategy;
  allFindings: FeatureFinding[];
}

function updateSystemUsm(params: UpdateSystemParams): boolean {
  const { root, usmSourceDir, result, allFindings } = params;
  const systemPath = path.join(usmSourceDir, "system.usm");

  if (!fs.existsSync(systemPath)) {
    // Don't create system.usm from scratch — it should exist already
    result.warnings?.push("system.usm not found — skipping update. Create it with 'usm init-file' first.");
    return false;
  }

  // Parse existing system.usm
  const content = fs.readFileSync(systemPath, "utf-8");
  const existing = yaml.load(content) as Record<string, unknown>;

  if (!existing || typeof existing !== "object") {
    result.warnings?.push("system.usm is not valid YAML — skipping update.");
    return false;
  }

  // Merge new services into the existing services list
  const existingServices = (existing.services as Array<Record<string, unknown>>) || [];
  const existingServiceIds = new Set(existingServices.map((s) => s.id as string));

  // Build new service entries from the scan result
  const newServiceEntries: Array<Record<string, unknown>> = [];

  for (const written of result.files_written) {
    if (written.type !== "service") continue;
    if (written.path === ".usm/system.usm") continue;

    const name = path.basename(written.path, ".usm");
    const serviceId = name;

    if (existingServiceIds.has(serviceId)) continue;

    // Read the generated .usm file to get port info
    const generatedPath = path.join(root, written.path);
    let port: number | undefined;
    try {
      const generatedContent = fs.readFileSync(generatedPath, "utf-8");
      const generated = yaml.load(generatedContent) as Record<string, unknown>;
      port = generated.port as number | undefined;
    } catch {
      // Ignore read errors
    }

    const entry: Record<string, unknown> = {
      id: serviceId,
      name: formatServiceName(serviceId),
      ref: written.path,
    };

    if (port) {
      entry.port = port;
    }

    // Add depends_on from the generated file
    try {
      const generatedContent = fs.readFileSync(path.join(root, written.path), "utf-8");
      const generated = yaml.load(generatedContent) as Record<string, unknown>;
      const dependsOn = generated.depends_on as string[] | undefined;
      if (dependsOn && dependsOn.length > 0) {
        entry.depends_on = dependsOn;
      }
    } catch {
      // Ignore read errors
    }

    newServiceEntries.push(entry);
  }

  // Merge feature entries into the existing index
  const existingIndex = (existing.index as Array<Record<string, unknown>>) || [];
  const existingIndexIds = new Set(existingIndex.map((f) => f.id as string));

  const newIndexEntries: Array<Record<string, unknown>> = [];

  for (const feature of allFindings) {
    // Generate an index id from the feature key
    const featureKey = `${feature.area}-${feature.name}`;
    if (existingIndexIds.has(featureKey)) continue;

    newIndexEntries.push({
      id: featureKey,
      name: feature.title,
      ref: `.usm/${feature.outputPath}`,
      status: "active",
      tags: [feature.area, ...feature.apps],
    });
  }

  // Apply changes
  if (newServiceEntries.length > 0) {
    existing.services = [...existingServices, ...newServiceEntries];
  }

  if (newIndexEntries.length > 0) {
    existing.index = [...existingIndex, ...newIndexEntries];
  }

  existing["$last_updated"] = todayDate();

  fs.writeFileSync(systemPath, yamlStringify(existing), "utf-8");
  return true;
}

// ─── Kind mapping helpers ───────────────────────────────────────────────────

function mapServiceKindToUsmType(
  kind: ServiceRuleKind
): "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue" {
  const mapping: Record<string, string> = {
    "web-app": "web-app",
    "api-server": "api",
    "worker": "worker",
    "mobile-app": "web-app",
    "desktop-app": "web-app",
    "database": "database",
    "cache": "cache",
    "queue": "queue",
    "other": "web-app",
  };

  return (mapping[kind] || "web-app") as "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue";
}

function mapSharedKindToUsmType(
  kind: SharedPackageKind
): "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue" {
  const mapping: Record<string, string> = {
    "ui-kit": "api",
    "orm": "api",
    "auth-lib": "api",
    "llm-wrapper": "api",
    "shared-util": "api",
    "config": "api",
    "types": "api",
    "other": "api",
  };

  return (mapping[kind] || "api") as "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue";
}

function mapDockerServiceToUsmType(
  name: string
): "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue" {
  const mapping: Record<string, string> = {
    zitadel: "idp",
    litellm: "llm-gateway",
    langflow: "agent-flows",
    postgres: "database",
    nango: "api",
  };

  return (mapping[name] || "api") as "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue";
}

function getDockerServiceSummary(name: string): string {
  const summaries: Record<string, string> = {
    zitadel: "Zitadel OIDC identity and access management — central auth gateway for all platform apps",
    litellm: "LiteLLM proxy — unified OpenAI-compatible API across LLM providers with cost tracking",
    langflow: "Langflow — visual AI flow builder for drag-and-drop LLM pipeline editing",
    postgres: "PostgreSQL — shared Supabase database for all platform services",
    nango: "Nango — open-source integration and OAuth connector service",
  };

  return summaries[name] || `TODO: describe the ${name} infrastructure service`;
}

// ─── Duplicate $id detection ──────────────────────────────────────────────

/**
 * Scan the .usm source directory for duplicate $id values across all files.
 * Returns an array of { id, paths } for each duplicate found.
 */
function detectDuplicateIds(usmSourceDir: string): Array<{ id: string; paths: string[] }> {
  const ids = new Map<string, string[]>();

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (p.endsWith(".usm")) {
        try {
          const content = fs.readFileSync(p, "utf-8");
          const match = content.match(/^\$id:\s*(.+)$/m);
          if (match) {
            const id = match[1].trim();
            if (!ids.has(id)) ids.set(id, []);
            ids.get(id)!.push(p);
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  walk(usmSourceDir);

  const duplicates: Array<{ id: string; paths: string[] }> = [];
  for (const [id, paths] of ids) {
    if (paths.length > 1) {
      duplicates.push({ id, paths });
    }
  }

  return duplicates;
}

function formatServiceName(id: string): string {
  // Convert kebab-case to Title Case
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
