// usm init — Analyze the repo and generate a starter usmconfig.json

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  UsmConfig,
  UsmConfigSharedPackage,
  UsmConfigServiceRule,
  UsmConfigDataRule,
  InitOptions,
  PackageJsonInfo,
  SharedPackageKind,
} from "./types.js";
import {
  readPackageJson,
  detectServiceKind,
  shortNameFromPath,
  shortNameFromPackageJson,
} from "./utils.js";

/**
 * Analyze the monorepo at the given root and generate a starter usmconfig.json.
 */
export async function initConfig(options: InitOptions): Promise<UsmConfig> {
  const root = path.resolve(options.root);

  // 1. Detect workspaces (apps + packages)
  const appDirs = fg.sync(["apps/*"], {
    cwd: root,
    absolute: true,
    onlyDirectories: true,
    ignore: ["**/node_modules/**"],
  });

  const pkgDirs = fg.sync(["packages/*"], {
    cwd: root,
    absolute: true,
    onlyDirectories: true,
    ignore: ["**/node_modules/**"],
  });

  // 2. Read package.json for each workspace
  const services: UsmConfigServiceRule[] = [];
  const sharedPackages: UsmConfigSharedPackage[] = [];

  for (const dir of appDirs) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = readPackageJson(pkgJsonPath);
    if (!pkgJson) continue;

    const relativePath = path.relative(root, dir);
    const name = shortNameFromPackageJson(pkgJson.name) || shortNameFromPath(relativePath);
    const kind = detectServiceKind(pkgJson, relativePath);

    services.push({
      match: relativePath,
      kind,
      summary: `${name} — ${kind} service`,
    });
  }

  for (const dir of pkgDirs) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = readPackageJson(pkgJsonPath);
    if (!pkgJson) continue;

    const relativePath = path.relative(root, dir);
    const name = shortNameFromPackageJson(pkgJson.name) || shortNameFromPath(relativePath);
    const kind = classifyPackageKind(pkgJson, relativePath);

    sharedPackages.push({
      id: name,
      match: relativePath,
      kind,
      summary: `${name} — ${kind} shared package`,
    });
  }

  // 3. Detect Prisma schemas
  const dataRules: UsmConfigDataRule[] = [];
  const prismaFiles = fg.sync(["**/prisma/schema.prisma"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });

  for (const prismaFile of prismaFiles) {
    const relativePath = path.relative(root, prismaFile);
    dataRules.push({
      match: relativePath,
      kind: "prisma",
      extract: {
        models: true,
        relations: false,
        enums: false,
      },
    });
  }

  // 4. Detect docker-compose files (noted for future scan use)

  // 5. Detect project name from root package.json or directory name
  let projectName = path.basename(root);
  const rootPkgJsonPath = path.join(root, "package.json");
  if (fs.existsSync(rootPkgJsonPath)) {
    const rootPkgJson = readPackageJson(rootPkgJsonPath);
    if (rootPkgJson?.name) {
      projectName = rootPkgJson.name.replace("@smith-gray/", "");
    }
  }

  // 6. Build the config
  const config: UsmConfig = {
    $schema: "https://usm.dev/schema/usmconfig-v1.json",
    version: "1",
    name: projectName,
    sources: {
      root: ".",
      include: ["apps/*", "packages/*"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"],
      package_manifests: ["**/package.json"],
      code_globs: ["**/*.ts", "**/*.tsx", "**/*.js"],
    },
    shared: sharedPackages,
    services: services,
    data: dataRules,
    outputs: {
      usm_source: ".usm/",
      design_docs: "docs/design/",
      help_docs: "docs/help/",
      api_docs: "docs/api/",
      agent_context: ".agents-workspace/",
      tests: "tests/auto-generated/",
      diagrams: "docs/diagrams/",
    },
    generation: {
      merge_with_existing: "smart",
      preserve_comments: true,
      format: "github-flavored-markdown",
    },
  };

  return config;
}

/**
 * Classify a shared package by its kind based on heuristics.
 */
function classifyPackageKind(
  pkgJson: PackageJsonInfo,
  _relativePath: string
): SharedPackageKind {
  const name = pkgJson.name;

  // Explicit classification based on package name
  if (name.includes("/ui") || name.includes("/theme")) return "ui-kit";
  if (name.includes("/db")) return "orm";
  if (name.includes("/auth") || name.includes("/zitadel")) return "auth-lib";
  if (name.includes("/llm-sdk")) return "llm-wrapper";
  if (name.includes("/config")) return "config";
  if (name.includes("/types")) return "types";

  // Content-based heuristic
  const deps = Object.keys(pkgJson.dependencies || {});
  if (deps.includes("@prisma/client")) return "orm";
  if (deps.includes("next-themes") && deps.includes("tailwind-merge")) return "ui-kit";

  return "shared-util";
}

/**
 * Write the config to a JSON file at the specified output path.
 * Won't overwrite if file already exists unless overwrite=true.
 */
export function writeConfig(
  config: UsmConfig,
  outputPath: string,
  overwrite: boolean = false
): string {
  const resolved = path.resolve(outputPath);

  if (!overwrite && fs.existsSync(resolved)) {
    throw new Error(`File already exists: ${resolved}. Use --force to overwrite.`);
  }

  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolved, JSON.stringify(config, null, 2), "utf-8");
  return resolved;
}
