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
 * Analyze the repo at the given root and generate a starter usmconfig.json.
 *
 * Detects two layouts:
 *   - Monorepo: has apps/* and/or packages/* directories
 *   - Single-app: has a package.json/go.mod/Cargo.toml/etc at the root or in src/
 *
 * For monorepos, each app/package gets its own service rule.
 * For single-app repos, the root (or src/) is registered as a single service.
 */
export async function initConfig(options: InitOptions): Promise<UsmConfig> {
  const root = path.resolve(options.root);

  // 1. Detect workspaces (apps + packages) — monorepo layout
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

  const isMonorepo = appDirs.length > 0 || pkgDirs.length > 0;

  // 2. Read package.json for each workspace
  const services: UsmConfigServiceRule[] = [];
  const sharedPackages: UsmConfigSharedPackage[] = [];

  // Source include patterns — defaults to monorepo layout
  let sourceIncludes = ["apps/*", "packages/*"];

  if (isMonorepo) {
    for (const dir of appDirs) {
      const relativePath = path.relative(root, dir);
      const pkgJsonPath = path.join(dir, "package.json");
      const hasGoMod = fs.existsSync(path.join(dir, "go.mod"));
      const hasCargo = fs.existsSync(path.join(dir, "Cargo.toml"));
      const hasPyproject = fs.existsSync(path.join(dir, "pyproject.toml"));
      const hasRequirements = fs.existsSync(path.join(dir, "requirements.txt"));
      const hasPomXml = fs.existsSync(path.join(dir, "pom.xml"));
      const hasBuildGradle = fs.existsSync(path.join(dir, "build.gradle"));
      const hasCsproj = fg.sync(["*.csproj"], { cwd: dir, onlyFiles: true }).length > 0;
      const hasGemfile = fs.existsSync(path.join(dir, "Gemfile"));
      const hasComposerJson = fs.existsSync(path.join(dir, "composer.json"));
      const hasMixExs = fs.existsSync(path.join(dir, "mix.exs"));
      const hasPackageSwift = fs.existsSync(path.join(dir, "Package.swift"));
      const hasBuildSbt = fs.existsSync(path.join(dir, "build.sbt"));
      const hasCMakeLists = fs.existsSync(path.join(dir, "CMakeLists.txt"));

      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = readPackageJson(pkgJsonPath);
        if (!pkgJson) continue;
        const name = shortNameFromPackageJson(pkgJson.name) || shortNameFromPath(relativePath);
        const kind = detectServiceKind(pkgJson, relativePath);
        services.push({ match: relativePath, kind, summary: `${name} — ${kind} service` });
      } else if (hasGoMod || hasCargo || hasPyproject || hasRequirements ||
                 hasPomXml || hasBuildGradle || hasCsproj || hasGemfile ||
                 hasComposerJson || hasMixExs || hasPackageSwift || hasBuildSbt ||
                 hasCMakeLists) {
        services.push({ match: relativePath, kind: "api-server", summary: `${shortNameFromPath(relativePath)} — api-server service` });
      }
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
  } else {
    // ── Single-app layout ──────────────────────────────────────────────
    // Detect a service at the root by checking for any known manifest file.
    // Each language has its own manifest — see BUILTIN_DETECTORS in detectors.ts.
    const rootPkgJsonPath = path.join(root, "package.json");
    const hasRootPkg = fs.existsSync(rootPkgJsonPath);
    const hasGoMod = fs.existsSync(path.join(root, "go.mod"));
    const hasCargo = fs.existsSync(path.join(root, "Cargo.toml"));
    const hasPyproject = fs.existsSync(path.join(root, "pyproject.toml"));
    const hasRequirements = fs.existsSync(path.join(root, "requirements.txt"));
    const hasPomXml = fs.existsSync(path.join(root, "pom.xml"));
    const hasBuildGradle = fs.existsSync(path.join(root, "build.gradle"));
    const hasCsproj = fg.sync(["*.csproj"], { cwd: root, onlyFiles: true }).length > 0;
    const hasGemfile = fs.existsSync(path.join(root, "Gemfile"));
    const hasComposerJson = fs.existsSync(path.join(root, "composer.json"));
    const hasMixExs = fs.existsSync(path.join(root, "mix.exs"));
    const hasPackageSwift = fs.existsSync(path.join(root, "Package.swift"));
    const hasBuildSbt = fs.existsSync(path.join(root, "build.sbt"));
    const hasCMakeLists = fs.existsSync(path.join(root, "CMakeLists.txt"));

    const hasAnyManifest = hasRootPkg || hasGoMod || hasCargo || hasPyproject ||
      hasRequirements || hasPomXml || hasBuildGradle || hasCsproj || hasGemfile ||
      hasComposerJson || hasMixExs || hasPackageSwift || hasBuildSbt || hasCMakeLists;

    if (hasAnyManifest) {
      let name = path.basename(root);
      let kind: UsmConfigServiceRule["kind"] = "api-server";

      if (hasRootPkg) {
        const pkgJson = readPackageJson(rootPkgJsonPath);
        if (pkgJson) {
          name = shortNameFromPackageJson(pkgJson.name) || name;
          kind = detectServiceKind(pkgJson, ".");
        }
      }
      // All other languages default to api-server

      services.push({
        match: ".",
        kind,
        summary: `${name} — ${kind} service`,
      });

      // For single-app repos, scan the root (or src/ if it exists)
      const srcDir = path.join(root, "src");
      sourceIncludes = fs.existsSync(srcDir) ? ["src"] : ["."];
    }
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
      // Strip npm org scope (e.g. @payloadcms/template-website → template-website)
      projectName = rootPkgJson.name.replace(/^@[^/]+\//, "");
    }
  }

  // 6. Build the config
  const config: UsmConfig = {
    $schema: "https://usm.dev/schema/usmconfig-v1.json",
    version: "1",
    name: projectName,
    sources: {
      root: ".",
      include: sourceIncludes,
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
      agent_context: ".usm-workspace/",
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
