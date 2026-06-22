#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { parseUsmFile, isSystemFile, isServiceFile, isFeatureFile } from "../parse.js";
import { validateUsm, validateUsmFile } from "../validate.js";
import { generate } from "../generate.js";
import { findUsmFiles, findAllUsmFiles, findAllUsmDirs } from "../parse.js";
import { initConfig, writeConfig } from "../scan/init.js";
import { scanStructural } from "../scan/structural.js";
import { scanInfrastructure } from "../scan/infrastructure.js";
import {
  generateAreaOverviews,
  generateSurfaceTables,
  generateSharedServicesIndex,
  generatePackagesIndex,
  generateRisksDoc,
  generateRoadmapDoc,
  generateDataModelDoc,
  generateDataIndex,
  generateSeedDataDoc,
  generatePerAppDecisions,
  generatePerAppApiReference,
  generatePerAppApiContracts,
  generatePerAppUiMap,
  generatePerAppTestSpecs,
} from "../generators/markdown.js";
import {
  generateAllAppAgentsMd,
  generateRootAgentsMd,
} from "../generators/agentsMd.js";
import {
  generateOpenApiSpec,
  generateOpenApiTypes,
} from "../generators/openapi.js";
import {
  generateAllTestSpecs,
  generateAggregatedSpecs,
} from "../generators/testSpecs.js";
import {
  generateArchitectureDiagram,
  generateERDiagram,
  generateServiceDependencies,
} from "../generators/mermaid.js";
import {
  generateAllTogafDeliverables,
} from "../generators/togaf.js";
import {
  generateArchiMateModel,
} from "../generators/archimate.js";
import type { MergeStrategy } from "../scan/types.js";
import type { SystemUsm, ServiceUsm, FeatureUsm, DataUsm } from "../types.js";

const program = new Command();

// Read version from package.json (resolved relative to compiled location)
// dist/cli/index.js → ../../package.json
const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
let version = "0.0.0";
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: string };
  version = pkg.version ?? version;
} catch {
  // ignore — keep fallback
}

program
  .name("usm")
  .description("Universal System Map — CLI for .usm files")
  .version(version);

// ─── scaffold (renamed from init) ────────────────────────────────────────────

program
  .command("scaffold")
  .description("Scaffold a new .usm file")
  .arguments("[path]")
  .option("-t, --type <type>", "File type (system, service, feature)", "system")
  .action((targetPath: string, options: { type: string }) => {
    const templates: Record<string, string> = {
      system: `$schema: https://usm.dev/schema/v1.json
$id: my-org/system
$type: system
$version: 1
$last_updated: "${new Date().toISOString().split("T")[0]}"
summary: "System description — 1-3 sentences for quick agent scan."

identity:
  name: "My System"
  domain: "example.com"
  contact: "team@example.com"

index: []
services: []
apis: []
data: []
infrastructure:
  cloud: ""
  region: ""
  terraform_ref: ""
  dns: ""
  ssl: ""

deployment:
  environments:
    - name: dev
      url: "http://localhost:3000"
      type: local

operations:
  monitoring: ""
  alerts: ""
  on_call: ""

policies:
  refs: []
`,
      service: `$schema: https://usm.dev/schema/v1.json
$id: my-org/my-service
$type: service
$version: 1
$last_updated: "${new Date().toISOString().split("T")[0]}"
summary: "Service description — 1-3 sentences for quick agent scan."

$system: my-org/system
type: web-app
runtime: nextjs
port: 3000
paths:
  - apps/my-service
depends_on: []

dev:
  command: "npm run dev"
  url: "http://localhost:3000"
  env: {}

prod:
  url: ""
  region: ""
  deployment_ref: ""

testing:
  framework: ""
  command: ""
  coverage_target: ""

security:
  auth_method: ""
  secrets_ref: ""

risks: []
future: []
decisions: []
modules: []
`,
      feature: `$schema: https://usm.dev/schema/v1.json
$id: my-org/my-feature
$type: feature
$version: 1
$last_updated: "${new Date().toISOString().split("T")[0]}"
summary: "Feature description — 1-3 sentences for quick agent scan."

$system: my-org/system
$service: my-org/my-service
intent: "Why this feature exists — 1-3 sentences."

decisions: []

flows: []

interfaces: []

contracts: []

tests: []

implementation:
  primary: ""
  ui: ""
  test_code: ""
  test_code_status: none

see_also: []
`,
    };

    const type = options.type;
    if (!templates[type]) {
      console.error(`Unknown type: ${type}. Must be system, service, or feature.`);
      process.exit(1);
    }

    const resolvedPath = path.resolve(targetPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(resolvedPath)) {
      console.error(`File already exists: ${resolvedPath}`);
      process.exit(1);
    }

    fs.writeFileSync(resolvedPath, templates[type], "utf-8");
    console.log(`Created ${resolvedPath}`);
  });

// ─── scaffold project ─────────────────────────────────────────────────────────

program
  .command("scaffold-project")
  .description("Generate a starter .usm/ for a new project")
  .option("-t, --type <type>", "Project type: single-app | monorepo-sub | monorepo-root", "single-app")
  .option("-n, --name <name>", "App or project name", "my-app")
  .option("-o, --output <path>", "Output directory", ".")
  .option("--org <org>", "Organization ID prefix", "my-org")
  .action((options: { type: string; name: string; output: string; org: string }) => {
    const validTypes = ["single-app", "monorepo-sub", "monorepo-root"];
    if (!validTypes.includes(options.type)) {
      console.error(`Unknown type: ${options.type}. Must be one of: ${validTypes.join(", ")}`);
      process.exit(1);
    }

    const outputDir = path.resolve(options.output);
    const org = options.org;
    const name = options.name;
    const today = new Date().toISOString().split("T")[0];

    function writeFile(relPath: string, content: string): void {
      const fullPath = path.join(outputDir, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(fullPath)) {
        console.log(`  ⊘ ${relPath} — already exists`);
        return;
      }
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`  ✓ ${relPath}`);
    }

    // ── Templates ──────────────────────────────────────────────────────────

    const systemTemplate = `$schema: https://usm.dev/schema/v1.json
$id: ${org}/system
$type: system
$version: 1
$last_updated: '${today}'
summary: |
  ${name} — system description. 1-3 sentences for quick agent scan.
identity:
  name: "${name}"
  domain: "example.com"
  contact: "team@example.com"
index: []
services: []
apis: []
data: []
infrastructure:
  cloud: ""
  region: ""
  terraform_ref: ""
  dns: ""
  ssl: ""
deployment:
  environments:
    - name: dev
      url: "http://localhost:3000"
      type: local
operations:
  monitoring: ""
  alerts: ""
  on_call: ""
policies:
  refs: []
`;

    const serviceTemplate = `$schema: https://usm.dev/schema/v1.json
$id: ${org}/${name}
$type: service
$version: 1
$last_updated: '${today}'
summary: |
  ${name} — service description. 1-3 sentences for quick agent scan.
$system: ${org}/system
type: web-app
runtime: nextjs
port: 3000
paths:
  - apps/${name}
depends_on: []

dev:
  command: "npm run dev"
  url: "http://localhost:3000"
  env: {}

prod:
  url: ""
  region: ""
  deployment_ref: ""

testing:
  framework: ""
  command: ""
  coverage_target: ""

security:
  auth_method: ""
  secrets_ref: ""

risks: []
future: []
decisions: []
modules: []
`;

    const authLoginFeatureTemplate = `$schema: https://usm.dev/schema/v1.json
$id: ${org}/login
$type: feature
$version: 1
$last_updated: '${today}'
summary: |
  Login flow — authentication entry point for the app.
$system: ${org}/system
$service: ${org}/${name}
intent: |
  Users need to authenticate before accessing protected resources.

decisions: []

flows: []

interfaces: []

contracts: []

tests: []

implementation:
  primary: ""
  ui: ""
  test_code: ""
  test_code_status: none

see_also: []
`;

    // ── Generate based on type ─────────────────────────────────────────────

    console.log(`\nScaffolding ${options.type} project: ${name}\n`);

    if (options.type === "single-app") {
      writeFile(".usm/system.usm", systemTemplate);
      writeFile(`.usm/services/${name}.usm`, serviceTemplate);
      writeFile(".usm/features/auth/login.usm", authLoginFeatureTemplate);
    } else if (options.type === "monorepo-sub") {
      writeFile(`apps/${name}/.usm/services/${name}.usm`, serviceTemplate);
      writeFile(`apps/${name}/.usm/features/auth/login.usm`, authLoginFeatureTemplate);
    } else if (options.type === "monorepo-root") {
      writeFile(".usm/system.usm", systemTemplate);
      writeFile(`apps/api/.usm/services/api.usm`, serviceTemplate.replace(/name/g, "api").replace(/port: 3000/, "port: 3001"));
      writeFile(`apps/web/.usm/services/web.usm`, serviceTemplate.replace(/name/g, "web").replace(/port: 3000/, "port: 3000"));
    }

    console.log(`\n✓ Project scaffolded! Next steps:`);
    console.log(`  1. Edit the .usm files to describe your system`);
    console.log(`  2. Run 'usm validate' to check the files`);
    console.log(`  3. Run 'usm generate' to produce documentation`);
    console.log(`  4. Run 'usm scan' to detect more from your codebase`);
  });

// ─── init (config generator) ─────────────────────────────────────────────────

program
  .command("init")
  .description("Analyze the repo and generate a starter usmconfig.json")
  .option("-r, --root <root>", "Repo root", ".")
  .option("-o, --output <path>", "Output path for usmconfig.json", "usmconfig.json")
  .option("--force", "Overwrite existing usmconfig.json", false)
  .action(async (options: { root: string; output: string; force: boolean }) => {
    try {
      const config = await initConfig({ root: options.root });
      const outputPath = writeConfig(config, options.output, options.force);
      console.log(`Created ${outputPath}`);
      console.log(`  Name:    ${config.name}`);
      console.log(`  Services: ${config.services?.length || 0}`);
      console.log(`  Shared:   ${config.shared?.length || 0}`);
      console.log(`  Data:     ${config.data?.length || 0}`);
      console.log(`\nRun 'usm scan' to generate .usm files from this config.`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── scan ────────────────────────────────────────────────────────────────────

interface ScanCliOptions {
  root: string;
  config: string;
  force: boolean;
  routes: boolean;
  merge: MergeStrategy;
}

program
  .command("scan")
  .description("Scan the codebase and generate .usm files from detected structure")
  .option("-r, --root <root>", "Repo root", ".")
  .option("-c, --config <path>", "Path to usmconfig.json", "usmconfig.json")
  .option("--force", "Overwrite existing .usm files (bypasses merge)", false)
  .option("--routes", "Only extract routes (skip service/package/data detection)", false)
  .option("--merge <strategy>", "Merge strategy: smart (default), skip (old behavior), overwrite", "smart")
  .action(async (options: ScanCliOptions) => {
    try {
      const validStrategies: MergeStrategy[] = ["smart", "skip", "overwrite"];
      const mergeStrategy = validStrategies.includes(options.merge)
        ? options.merge
        : "smart";
      const effectiveStrategy: MergeStrategy = options.force ? "overwrite" : mergeStrategy;

      const result = await scanStructural({
        root: options.root,
        configPath: options.config,
        force: options.force,
        routesOnly: options.routes,
        mergeStrategy: effectiveStrategy,
      });

      console.log(`Scan complete in ${result.stats?.duration_ms || 0}ms`);
      console.log(`  Services found:  ${result.stats?.services_found || 0}`);
      console.log(`  Packages found:  ${result.stats?.packages_found || 0}`);
      console.log(`  Data models:     ${result.stats?.data_models_found || 0}`);
      console.log(`  Features found:  ${result.stats?.features_found || 0}`);
      console.log();

      if (result.files_written.length > 0) {
        console.log("Files written:");
        for (const f of result.files_written) {
          console.log(`  ✓ ${f.path} (${f.type}, from ${f.source})`);
        }
      }

      if (result.files_skipped.length > 0) {
        console.log("Files skipped:");
        for (const f of result.files_skipped) {
          console.log(`  ⊘ ${f.path} (${f.reason})`);
        }
        console.log(`\nUse --force to overwrite, or --merge (default) to smart-merge.`);
      }

      if (result.warnings && result.warnings.length > 0) {
        console.log("Warnings:");
        for (const w of result.warnings) {
          console.log(`  ⚠ ${w}`);
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── scan infrastructure ─────────────────────────────────────────────────────

// Commander requires subcommands to be added to the parent command.
// We add 'infrastructure' as a subcommand of 'scan'.
const scanCommand = program.commands.find(c => c.name() === "scan")!;
scanCommand
  .command("infrastructure")
  .description("Extract infrastructure data from Terraform files and output draft YAML blocks")
  .option("-r, --root <root>", "Repo root", ".")
  .option("-c, --config <path>", "Path to usmconfig.json", "usmconfig.json")
  .action(async (options: { root: string; config: string }) => {
    try {
      const result = await scanInfrastructure({
        root: options.root,
        configPath: options.config,
      });

      if (result.warnings.length > 0) {
        console.log("Warnings:");
        for (const w of result.warnings) {
          console.log(`  ⚠ ${w}`);
        }
        console.log();
      }

      if (result.services.length === 0) {
        console.log("No infrastructure data could be extracted from Terraform files.");
        return;
      }

      console.log(`Extracted infrastructure data for ${result.services.length} service(s):\n`);

      for (const svc of result.services) {
        console.log(`─── ${svc.serviceId} ───`);
        console.log(`Source: ${svc.source}`);
        console.log();
        console.log(svc.yamlBlock);
        console.log();
      }

      console.log("Copy the infrastructure: block above into the corresponding service .usm file.");
      console.log("Review and adjust any values before committing.");
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── validate ──────────────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate .usm files against the v1 schema")
  .arguments("<files...>")
  .action((files: string[]) => {
    const allPaths: string[] = [];

    // If the user passes just ".usm/" or the root, scan all sub-.usm dirs
    if (files.length === 1 && files[0] === ".usm") {
      const root = path.resolve(process.cwd());
      allPaths.push(...findAllUsmFiles(root));
    } else if (files.length === 1 && fs.statSync(path.resolve(files[0])).isDirectory() && path.resolve(files[0]) === path.resolve(process.cwd())) {
      // User passed "." or the root — scan all sub-.usm dirs
      allPaths.push(...findAllUsmFiles(path.resolve(files[0])));
    } else {
      for (const f of files) {
        const resolved = path.resolve(f);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
          // Check if this is a .usm directory specifically
          if (resolved.endsWith(".usm") || resolved.includes(".usm")) {
            allPaths.push(...findUsmFiles(resolved));
          } else {
            // It's some other directory (e.g., monorepo root) — scan all sub-.usm dirs
            allPaths.push(...findAllUsmFiles(resolved));
          }
        } else if (fs.existsSync(resolved)) {
          allPaths.push(resolved);
        }
      }
    }

    if (allPaths.length === 0) {
      console.log("No .usm files found.");
      return;
    }

    let exitCode = 0;
    for (const filePath of allPaths) {
      const result = validateUsmFile(filePath);
      if (result.valid) {
        console.log(`✓ ${filePath}`);
      } else {
        console.log(`✗ ${filePath}`);
        for (const err of result.errors || []) {
          console.log(`  ${err.path}: ${err.message}`);
        }
        exitCode = 1;
      }
    }

    process.exit(exitCode);
  });

// ─── generate ──────────────────────────────────────────────────────────────────

program
  .command("generate")
  .description("Generate documentation from .usm files")
  .option("--check", "Check if generated files are up to date (dry run)")
  .option("-r, --root <root>", "Monorepo root directory", process.cwd())
  .action((options: { check: boolean; root: string }) => {
    const root = path.resolve(options.root);

    // Find .usm files across all sub-.usm/ directories in the monorepo
    const files = findAllUsmFiles(root);
    if (files.length === 0) {
      // Fallback: check root .usm/ directly
      const usmDir = path.join(root, ".usm");
      if (fs.existsSync(usmDir)) {
        const rootFiles = findUsmFiles(usmDir);
        if (rootFiles.length === 0) {
          console.log("No .usm files found.");
          return;
        }
        files.push(...rootFiles);
      } else {
        console.error(`No .usm/ directories found in ${root}`);
        process.exit(1);
      }
    }

    console.log(`Found ${files.length} .usm file(s)\n`);

    // Detect duplicate $ids
    const idMap = new Map<string, string[]>();
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const match = content.match(/^\$id:\s*(.+)$/m);
        if (match) {
          const id = match[1].trim();
          if (!idMap.has(id)) idMap.set(id, []);
          idMap.get(id)!.push(path.relative(root, filePath));
        }
      } catch {
        // Ignore
      }
    }
    const dupes = Array.from(idMap.entries()).filter(([_, paths]) => paths.length > 1);
    if (dupes.length > 0) {
      console.warn(`⚠ Found ${dupes.length} duplicate $id(s) — this may cause overwrites:`);
      for (const [id, paths] of dupes) {
        console.warn(`    $id="${id}" in: ${paths.join(", ")}`);
      }
      console.warn();
    }

    // Collect parsed files for aggregator generators
    const systemFiles: SystemUsm[] = [];
    const serviceFiles: ServiceUsm[] = [];
    const featureFiles: FeatureUsm[] = [];
    const dataFiles: DataUsm[] = [];

    // ─── Pass 1: Per-file generation (system, service, feature) ────────────
    for (const filePath of files) {
      try {
        const parsed = parseUsmFile(filePath);
        const validation = validateUsm(parsed);
        if (!validation.valid) {
          console.log(`✗ ${filePath} — validation failed, skipping`);
          for (const err of validation.errors || []) {
            console.log(`  ${err.path}: ${err.message}`);
          }
          continue;
        }

        // Collect for aggregator pass
        if (isSystemFile(parsed)) systemFiles.push(parsed);
        else if (isServiceFile(parsed)) serviceFiles.push(parsed);
        else if (isFeatureFile(parsed)) featureFiles.push(parsed);
        else if (parsed.$type === "data") dataFiles.push(parsed as DataUsm);

        const result = generate(parsed, ["markdown"], root, filePath);

        for (const output of result.outputs) {
          if (options.check) {
            if (fs.existsSync(output.path)) {
              const existing = fs.readFileSync(output.path, "utf-8");
              if (existing === output.content) {
                console.log(`✓ ${output.path} (up to date)`);
              } else {
                console.log(`✗ ${output.path} (out of date)`);
              }
            } else {
              console.log(`✗ ${output.path} (missing)`);
            }
          } else {
            const outDir = path.dirname(output.path);
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            fs.writeFileSync(output.path, output.content, "utf-8");
            console.log(`→ ${output.path}`);
          }
        }
      } catch (err) {
        console.error(`✗ ${filePath} — ${(err as Error).message}`);
      }
    }

    // ─── Pass 2: Area overview stubs ──────────────────────────────────────
    const areaResult = generateAreaOverviews(root);

    for (const output of areaResult.outputs) {
      if (options.check) {
        if (fs.existsSync(output.path)) {
          const existing = fs.readFileSync(output.path, "utf-8");
          if (existing === output.content) {
            console.log(`✓ ${output.path} (up to date)`);
          } else {
            console.log(`✗ ${output.path} (out of date)`);
          }
        } else {
          console.log(`✗ ${output.path} (missing)`);
        }
      } else {
        const outDir = path.dirname(output.path);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(output.path, output.content, "utf-8");
        console.log(`→ ${output.path} (area overview)`);
      }
    }

    // ─── Pass 3: Aggregator generators (per-service docs) ─────────────────
    const systemFile = systemFiles[0];
    if (systemFile) {
      const aggregatorGenerators = [
        // Cross-cutting platform docs
        { name: "risks", fn: () => generateRisksDoc(systemFile, root) },
        { name: "roadmap", fn: () => generateRoadmapDoc(systemFile, root) },
        { name: "shared-services-index", fn: () => generateSharedServicesIndex(serviceFiles, root) },
        { name: "packages-index", fn: () => generatePackagesIndex(serviceFiles, root) },
        { name: "data-model", fn: () => generateDataModelDoc(dataFiles, root, serviceFiles) },
        { name: "data-index", fn: () => generateDataIndex(root) },
        { name: "seed-data", fn: () => generateSeedDataDoc(serviceFiles, root) },
        // Per-app aggregator docs
        { name: "per-app-decisions", fn: () => generatePerAppDecisions(featureFiles, serviceFiles, root) },
        { name: "per-app-api-reference", fn: () => generatePerAppApiReference(featureFiles, root) },
        { name: "per-app-api-contracts", fn: () => generatePerAppApiContracts(featureFiles, root) },
        { name: "per-app-ui-map", fn: () => generatePerAppUiMap(featureFiles, root) },
        { name: "per-app-test-specs", fn: () => generatePerAppTestSpecs(featureFiles, root) },
        // AGENTS.md generation
        { name: "app-agents-md", fn: () => generateAllAppAgentsMd(serviceFiles, root) },
        { name: "root-agents-md", fn: () => generateRootAgentsMd(systemFile, serviceFiles, root) },
        // OpenAPI + TypeScript types (Phase D)
        { name: "openapi-spec", fn: () => generateOpenApiSpec(featureFiles, root) },
        { name: "openapi-types", fn: () => generateOpenApiTypes(featureFiles, root) },
        // Test specs (Phase E)
        { name: "test-specs-per-feature", fn: () => generateAllTestSpecs(featureFiles, root) },
        { name: "test-specs-aggregated", fn: () => generateAggregatedSpecs(featureFiles, root) },
      ];

      for (const agg of aggregatorGenerators) {
        try {
          const result = agg.fn();
          for (const output of result.outputs) {
            if (options.check) {
              if (fs.existsSync(output.path)) {
                const existing = fs.readFileSync(output.path, "utf-8");
                if (existing === output.content) {
                  console.log(`✓ ${output.path} (up to date)`);
                } else {
                  console.log(`✗ ${output.path} (out of date)`);
                }
              } else {
                console.log(`✗ ${output.path} (missing)`);
              }
            } else {
              const outDir = path.dirname(output.path);
              if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
              }
              fs.writeFileSync(output.path, output.content, "utf-8");
              console.log(`→ ${output.path} (${agg.name})`);
            }
          }
        } catch (err) {
          console.error(`✗ aggregator:${agg.name} — ${(err as Error).message}`);
        }
      }
    }

    // ─── Pass 4: Surface tables (injected into overview.md files) ────────
    // This MUST run after all overview.md files are written (Passes 1-3)
    if (systemFile && !options.check) {
      try {
        const surfaceResult = generateSurfaceTables(featureFiles, serviceFiles, root);
        for (const output of surfaceResult.outputs) {
          fs.writeFileSync(output.path, output.content, "utf-8");
          console.log(`→ ${output.path} (surface tables)`);
        }
      } catch (err) {
        console.error(`✗ surface-tables — ${(err as Error).message}`);
      }
    }

    // ─── Pass 5: Mermaid diagrams (architecture, ER, service deps) ──────
    if (systemFile && !options.check) {
      const mermaidGenerators = [
        {
          name: "architecture-diagram",
          fn: () => generateArchitectureDiagram(systemFile, root),
        },
        {
          name: "er-diagram",
          fn: () => generateERDiagram(dataFiles, root),
        },
        {
          name: "service-dependencies",
          fn: () => generateServiceDependencies(systemFile, serviceFiles, root),
        },
      ];

      for (const gen of mermaidGenerators) {
        try {
          const result = gen.fn();
          for (const output of result.outputs) {
            const outDir = path.dirname(output.path);
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            fs.writeFileSync(output.path, output.content, "utf-8");
            console.log(`→ ${output.path} (${gen.name})`);
          }
        } catch (err) {
          console.error(`✗ ${gen.name} — ${(err as Error).message}`);
        }
      }
    }

    // ─── Pass 6: TOGAF ADM phase deliverables ────────────────────────────
    if (systemFile && !options.check) {
      try {
        const togafResult = generateAllTogafDeliverables(systemFile, root);
        for (const output of togafResult.outputs) {
          const outDir = path.dirname(output.path);
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          fs.writeFileSync(output.path, output.content, "utf-8");
          console.log(`→ ${output.path} (togaf)`);
        }
      } catch (err) {
        console.error(`✗ togaf — ${(err as Error).message}`);
      }
    }
  });

// ─── roundtrip ─────────────────────────────────────────────────────────────────

program
  .command("roundtrip")
  .description("Test parse → generate → parse roundtrip for a .usm file")
  .arguments("<file>")
  .action((filePath: string) => {
    const resolved = path.resolve(filePath);

    console.log("1. Parsing original file...");
    const original = parseUsmFile(resolved);
    console.log(`   Type: ${original.$type}, ID: ${original.$id}`);

    console.log("2. Validating original...");
    const validation = validateUsm(original);
    if (!validation.valid) {
      console.log("   Validation failed:");
      for (const err of validation.errors || []) {
        console.log(`   ${err.path}: ${err.message}`);
      }
      process.exit(1);
    }
    console.log("   Validation: ✓");

    console.log("3. Generating markdown...");
    const result = generate(original, ["markdown"]);
    for (const output of result.outputs) {
      console.log(`   → ${output.path} (${output.content.length} chars)`);
    }

    console.log("4. Re-parsing original...");
    const reparsed = parseUsmFile(resolved);
    console.log(`   Type: ${reparsed.$type}, ID: ${reparsed.$id}`);

    if (reparsed.$type === original.$type && reparsed.$id === original.$id && reparsed.$version === original.$version) {
      console.log("5. Roundtrip: ✓ (key fields match)");
    } else {
      console.log("5. Roundtrip: ✗ (key fields mismatch)");
      process.exit(1);
    }
  });

// ─── info ──────────────────────────────────────────────────────────────────────

program
  .command("info")
  .description("Show summary of a .usm file")
  .arguments("<file>")
  .action((filePath: string) => {
    const resolved = path.resolve(filePath);
    const parsed = parseUsmFile(resolved);

    console.log(`ID:       ${parsed.$id}`);
    console.log(`Type:     ${parsed.$type}`);
    console.log(`Version:  ${parsed.$version}`);
    console.log(`Updated:  ${parsed.$last_updated || "—"}`);
    console.log(`Summary:  ${parsed.summary}`);

    if (isSystemFile(parsed)) {
      console.log(`Identity: ${parsed.identity.name} (${parsed.identity.domain})`);
      console.log(`Features: ${parsed.index?.length || 0}`);
      console.log(`Services: ${parsed.services?.length || 0}`);
    } else if (isServiceFile(parsed)) {
      console.log(`System:   ${parsed.$system}`);
      console.log(`Runtime:  ${parsed.runtime}`);
      console.log(`Port:     ${parsed.port || "—"}`);
      console.log(`Modules:  ${parsed.modules?.length || 0}`);
    } else if (isFeatureFile(parsed)) {
      console.log(`System:   ${parsed.$system}`);
      console.log(`Service:  ${parsed.$service}`);
      console.log(`Flows:    ${parsed.flows?.length || 0}`);
      console.log(`Tests:    ${parsed.tests?.length || 0}`);
      console.log(`Contracts: ${parsed.contracts?.length || 0}`);
    }
  });

// ─── enrich ────────────────────────────────────────────────────────────────────

interface EnrichCliOptions {
  root: string;
  file: string;
  dryRun: boolean;
  fields: string;
  model: string;
  provider: string;
  url: string;
}

program
  .command("enrich")
  .description("Fill in TODO: describe placeholders in .usm files using an LLM")
  .option("-r, --root <root>", "Monorepo root directory", process.cwd())
  .option("--file <file>", "Single .usm file to enrich (default: all files with TODOs in .usm/)")
  .option("--dry-run", "Show what would change without writing or calling the LLM", false)
  .option("--fields <fields>", "Comma-separated fields to enrich", "summary,intent,decisions,flows,contracts,tests,status")
  .option("--model <model>", "Override model (e.g. 'anthropic/claude-sonnet-4-5')")
  .option("--provider <provider>", "Override provider (litellm|openai|anthropic|ollama)")
  .option("--url <url>", "Override LLM API URL")
  .action(async (options: EnrichCliOptions) => {
    try {
      const { enrichFile, enrichDirectory } = await import("../enrich/index.js");
      type EnrichmentConfig = import("../enrich/types.js").EnrichmentConfig;

      const root = path.resolve(options.root);
      const configPath = path.join(root, "usmconfig.json");

      let enrichConfig: EnrichmentConfig;

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent) as Record<string, unknown>;
        const enrichSection = config.enrichment as Partial<EnrichmentConfig> | undefined;

        if (enrichSection && enrichSection.enabled === false) {
          console.log("Enrichment is disabled in usmconfig.json. Set enrichment.enabled to true to enable.");
          return;
        }

        enrichConfig = {
          enabled: enrichSection?.enabled ?? true,
          provider: (options.provider || enrichSection?.provider || "litellm") as EnrichmentConfig["provider"],
          url: options.url || enrichSection?.url || "http://localhost:4000",
          apiKey: enrichSection?.apiKey || process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY,
          model: options.model || enrichSection?.model || "siliconflow/auto",
          temperature: enrichSection?.temperature ?? 0.3,
          max_tokens_per_file: enrichSection?.max_tokens_per_file ?? 4000,
          fields: (enrichSection?.fields || ["summary", "intent", "decisions", "flows", "contracts", "tests", "status"]) as EnrichmentConfig["fields"],
          preserve_human_edits: enrichSection?.preserve_human_edits ?? true,
          max_source_file_chars: enrichSection?.max_source_file_chars ?? 2000,
        };
      } else {
        enrichConfig = {
          enabled: true,
          provider: (options.provider || "litellm") as EnrichmentConfig["provider"],
          url: options.url || "http://localhost:4000",
          model: options.model || "siliconflow/auto",
          temperature: 0.3,
          max_tokens_per_file: 4000,
          fields: ["summary", "intent", "decisions", "flows", "contracts", "tests", "status"],
          preserve_human_edits: true,
          max_source_file_chars: 2000,
        };
      }

      const fieldOverride = options.fields.split(",").map((f) => f.trim());

      const enrichOptions = {
        dryRun: options.dryRun,
        fields: fieldOverride,
        model: options.model || undefined,
        provider: options.provider || undefined,
        url: options.url || undefined,
      };

      if (options.file) {
        const filePath = path.resolve(options.file);
        console.log(`Enriching: ${filePath}`);
        const result = await enrichFile(filePath, enrichConfig, enrichOptions);

        if (result.error) {
          console.error(`✗ ${result.file}: ${result.error}`);
          process.exit(1);
        }

        if (result.fields_filled.length > 0) {
          console.log(`✓ ${result.file}`);
          console.log(`  Filled:     ${result.fields_filled.join(", ")}`);
          console.log(`  Preserved:  ${result.fields_preserved.join(", ") || "none"}`);
          console.log(`  Skipped:    ${result.fields_skipped.join(", ") || "none"}`);
          if (result.tokens_used) console.log(`  Tokens:     ${result.tokens_used}`);
          console.log(`  Duration:   ${result.duration_ms}ms`);
        } else if (result.fields_preserved.length > 0) {
          console.log(`⊘ ${result.file} — no TODO fields found`);
        } else if (options.dryRun) {
          console.log(`⊘ ${result.file} — dry run, no changes made`);
        } else {
          console.log(`⊘ ${result.file} — no fields were filled`);
        }
      } else {
        const usmDir = path.join(root, ".usm");
        if (!fs.existsSync(usmDir)) {
          console.error(`No .usm/ directory found at ${usmDir}`);
          process.exit(1);
        }

        console.log(`Enriching all files with TODOs in: ${usmDir}`);
        const results = await enrichDirectory(usmDir, enrichConfig, enrichOptions);

        if (results.length === 0) {
          console.log("No .usm files with TODO: describe placeholders found.");
          return;
        }

        console.log(`\nEnrichment complete: ${results.length} file(s) processed`);
        let totalFilled = 0;
        let totalPreserved = 0;
        let totalErrors = 0;

        for (const result of results) {
          if (result.error) {
            console.error(`  ✗ ${result.file}: ${result.error}`);
            totalErrors++;
          } else if (result.fields_filled.length > 0) {
            console.log(`  ✓ ${result.file} — filled: ${result.fields_filled.join(", ")}`);
            totalFilled += result.fields_filled.length;
          } else {
            console.log(`  ⊘ ${result.file} — no fields filled`);
          }
          totalPreserved += result.fields_preserved.length;
        }

        console.log(`\n  Fields filled:    ${totalFilled}`);
        console.log(`  Fields preserved: ${totalPreserved}`);
        console.log(`  Errors:           ${totalErrors}`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── mcp ───────────────────────────────────────────────────────────────────────

program
  .command("mcp")
  .description("MCP server commands")
  .arguments("<action>")
  .action(async (action: string) => {
    if (action === "serve") {
      const { startMcpServer } = await import("./mcp.js");
      await startMcpServer();
    } else {
      console.error(`Unknown mcp action: ${action}. Use 'serve'.`);
      process.exit(1);
    }
  });

// ─── docs ─────────────────────────────────────────────────────────────────────

program
  .command("docs")
  .description("Docs site commands (requires VitePress)")
  .arguments("<action>")
  .option("-p, --port <port>", "Dev server port (default: 5173)", "5173")
  .action(async (action: string, options: { port: string }) => {
    const root = path.resolve(process.cwd());
    const { docsBuild, docsServe } = await import("./docs.js");

    if (action === "build") {
      await docsBuild(root);
    } else if (action === "serve") {
      await docsServe(root, parseInt(options.port, 10));
    } else {
      console.error(`Unknown docs action: ${action}. Use 'build' or 'serve'.`);
      process.exit(1);
    }
  });

// ─── generate:togaf ─────────────────────────────────────────────────────────────

program
  .command("generate:togaf")
  .description("Generate TOGAF ADM phase deliverables from USM")
  .option("--phase <phase>", "Specific phase: A, B, C1, C2, D, E, G, H, or 'all' (default: all)", "all")
  .action((options: { phase: string }) => {
    const root = path.resolve(process.cwd());
    const systemPath = path.join(root, ".usm", "system.usm");

    if (!fs.existsSync(systemPath)) {
      console.error("No .usm/system.usm found. Run from monorepo root.");
      process.exit(1);
    }

    const system = parseUsmFile(systemPath) as SystemUsm;
    const result = generateAllTogafDeliverables(system, root);

    console.log(`Generated ${result.outputs.length} TOGAF phase deliverables:`);
    for (const output of result.outputs) {
      console.log(`  → ${path.relative(root, output.path)}`);
    }
  });

// ─── generate:archimate ───────────────────────────────────────────────────────────

program
  .command("generate:archimate")
  .description("Generate ArchiMate 3.1 Open Exchange XML from USM")
  .action(() => {
    const root = path.resolve(process.cwd());
    const systemPath = path.join(root, ".usm", "system.usm");

    if (!fs.existsSync(systemPath)) {
      console.error("No .usm/system.usm found. Run from monorepo root.");
      process.exit(1);
    }

    const system = parseUsmFile(systemPath) as SystemUsm;
    const result = generateArchiMateModel(system, root);

    if (result.outputs.length > 0) {
      console.log(`Generated ArchiMate model: ${path.relative(root, result.outputs[0].path)}`);
      console.log(`  Elements: count layers, Relationships: see model.xml`);
    }
  });

program.parse();
