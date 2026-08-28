#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { parseUsmFile, parseUsmFileWithWarnings, isSystemFile, isServiceFile, isFeatureFile } from "../parse.js";
import { validateUsm, validateUsmFile } from "../validate.js";
import { generate } from "../generate.js";
import { findUsmFiles, findAllUsmFiles, findAllUsmDirs } from "../parse.js";
import { runQuery, QueryParseError } from "../query/index.js";
import type { UsmFile } from "../types.js";
import { generateStructurizrDsl } from "../generators/structurizr.js";
import { importStructurizrWorkspace, parseStructurizrWorkspace, planStructurizrImport } from "../import/structurizr.js";
import { generateReadmeFacts } from "../generators/readmeFacts.js";
import { initConfig, writeConfig } from "../scan/init.js";
import { promptFeedbackPolicy, applyFeedbackToSystem, resolveFeedbackPolicy, DEFAULT_FEEDBACK_POLICY } from "../scan/feedback.js";
import { detectUpgrade, applyUpgrade } from "../scan/upgrade.js";
import { scanStructural } from "../scan/structural.js";
import { scanInfrastructure } from "../scan/infrastructure.js";
import {
  generateAreaOverviews,
  generateSurfaceTables,
  generateSharedServicesIndex,
  generatePackagesIndex,
  generateRisksDoc,
  generateRoadmapDoc,
  generateDeploymentDoc,
  generateCliReference,
  generateConfigReference,
  generateSchemaReference,
  generateMcpReference,
  generateFeedbackPage,
  generateDataModelDoc,
  generateDataIndex,
  generateSeedDataDoc,
  generatePerAppDecisions,
  generatePerAppApiReference,
  generatePerAppApiContracts,
  generatePerAppUiMap,
  generatePerAppTestSpecs,
} from "../generators/markdown.js";
import { generateReferencePages } from "../generators/referencePages.js";
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
import {
  generateRulesFiles,
} from "../generators/rulesFiles.js";
import type { MergeStrategy } from "../scan/types.js";
import type { SystemUsm, ServiceUsm, FeatureUsm, DataUsm, GenerationResult } from "../types.js";
// CLI polish: colors, spinner, progress, tree, banner, update notifier, verbosity
import { ok, fail, warn, skip, arrow, success, error, warning, info, dim, bold, metric } from "./colors.js";
import { startSpinner } from "./spinner.js";
import { startProgress } from "./progress.js";
import { renderFileTree } from "./tree.js";
import { printBanner } from "./banner.js";
import { checkForUpdates } from "./updateCheck.js";
import { setVerbosity, getLevel, logInfo, logError, logDebug } from "./verbosity.js";

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
  .version(version)
  // Global verbosity flags — available on every command
  .option("--quiet", "Suppress info/success lines; show only errors and final summary")
  .option("--verbose", "Show timestamps, full paths, and debug info")
  // Commander built-in: suggest closest command name on typos
  .showSuggestionAfterError(true)
  .hook("preAction", (cmd) => {
    // Apply verbosity from the global flags on the *command* (inherited)
    const opts = cmd.opts();
    setVerbosity({ quiet: opts.quiet, verbose: opts.verbose });
    // Non-blocking update check — runs on every command but is async/cached.
    // We don't await it; it renders a hint asynchronously when ready.
    checkForUpdates().catch(() => {});
  });

// Show ASCII banner when no args or --help. Commander calls this on parse.
const originalParse = program.parse.bind(program);
program.parse = function (argv?: readonly string[]): Command {
  // If no args (just `usm`) or `--help`/`-h`, show the banner first.
  const args = argv ?? process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printBanner();
  }
  return originalParse(argv);
};

// ─── scaffold (renamed from init) ────────────────────────────────────────────

program
  .command("scaffold")
  .description("Scaffold a new .usm file")
  .arguments("[path]")
  .option("-t, --type <type>", "File type (system, service, feature)", "system")
  .action((targetPath: string | undefined, options: { type: string }) => {
    const templates: Record<string, string> = {
      system: `$schema: https://usm.dev/schema/v1.json
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
      console.error(fail(`Unknown type: ${error(type)}. Must be system, service, or feature.`));
      process.exit(1);
    }

    // Default to .usm/system.usm when no path is given (prevents the
    // path.resolve(undefined) crash that broke the bootstrap)
    const resolvedPath = targetPath
      ? path.resolve(targetPath)
      : path.resolve(".usm", "system.usm");
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(resolvedPath)) {
      console.error(fail(`File already exists: ${dim(resolvedPath)}`));
      process.exit(1);
    }

    fs.writeFileSync(resolvedPath, templates[type], "utf-8");
    console.log(ok(`Created ${dim(resolvedPath)}`));
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
        console.log(`  ${skip(relPath)} — ${dim("already exists")}`);
        return;
      }
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`  ${ok(relPath)}`);
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

    console.log(`\n${bold(`Scaffolding ${options.type} project: ${options.name}`)}\n`);

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

    console.log(`\n${ok(`Project scaffolded!`)} Next steps:`);
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
      console.log(ok(`Created ${dim(outputPath)}`));
      console.log(`  Name:      ${config.name}`);
      console.log(`  Services:  ${metric(String(config.services?.length || 0))}`);
      console.log(`  Shared:    ${metric(String(config.shared?.length || 0))}`);
      console.log(`  Data:      ${metric(String(config.data?.length || 0))}`);
      console.log(`\n${info("Run 'usm scan' to generate .usm files from this config.")}`);
    } catch (err) {
      console.error(fail((err as Error).message));
      process.exit(1);
    }
  });

// ─── feedback ───────────────────────────────────────────────────────────────

program
  .command("feedback")
  .description("Configure the agent feedback policy (how AI agents report bugs/improvements)")
  .option("-r, --root <root>", "Repo root", ".")
  .option("-s, --system <path>", "Path to system.usm (default: <root>/.usm/system.usm)")
  .option("-p, --policy <policy>", "Policy: human-gate | direct-to-feedback | direct-to-github (skips prompts)")
  .option("-g, --github-auth", "Declare that the dev agent has GitHub (gh CLI) auth", false)
  .option("--no-github-auth", "Declare that the dev agent lacks GitHub auth", false)
  .option("-t, --tracker <url>", "Override the issue tracker URL (default: identity.repository/issues)")
  .action(async (options: {
    root: string;
    system?: string;
    policy?: string;
    githubAuth?: boolean;
    tracker?: string;
  }) => {
    try {
      const systemPath = options.system
        ? path.resolve(options.system)
        : path.resolve(options.root, ".usm", "system.usm");

      let policy: import("../types.js").FeedbackPolicy;

      if (options.policy) {
        // Non-interactive mode — resolve from flags
        const valid = ["human-gate", "direct-to-feedback", "direct-to-github"];
        if (!valid.includes(options.policy)) {
          console.error(fail(`--policy must be one of ${error(valid.join(", "))}`));
          process.exit(1);
        }
        // githubAuth is undefined if neither flag was passed; treat as false
        const gh = options.githubAuth === true;
        policy = resolveFeedbackPolicy({
          githubAuth: gh,
          policyChoice: options.policy,
          tracker: options.tracker,
        });
        if (options.policy === "direct-to-github" && !gh) {
          console.warn(warn("direct-to-github requires --github-auth; downgraded to human-gate."));
        }
      } else {
        // Interactive mode (TTY) — prompts; returns null if non-TTY
        const prompted = await promptFeedbackPolicy();
        policy = prompted ?? DEFAULT_FEEDBACK_POLICY;
        if (prompted === null) {
          console.log(skip("Non-interactive shell — defaulting policy to human-gate. Re-run with --policy to set explicitly."));
        }
        if (options.tracker) policy.tracker = options.tracker;
      }

      const result = applyFeedbackToSystem(systemPath, policy);
      if (!result.applied) {
        console.error(fail("Could not apply feedback policy:"));
        for (const e of result.errors || []) console.error(`  ${dim(e.path)}: ${e.message}`);
        process.exit(1);
      }

      console.log(ok(`Feedback policy written to ${dim(result.path ?? "(system.usm)")}`));
      console.log(`  Policy:      ${info(policy.policy ?? "(unset)")}`);
      console.log(`  GitHub auth:  ${dim(String(policy.github_auth ?? "(unset)"))}`);
      if (policy.tracker) console.log(`  Tracker:     ${dim(policy.tracker)}`);
      console.log(`\n${info("Re-run 'usm generate' to update the Feedback Protocol in agent rules files.")}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── upgrade ─────────────────────────────────────────────────────────────────

program
  .command("upgrade")
  .description("Detect stale USM projects and guide setup of new optional capabilities")
  .option("-r, --root <root>", "Repo root", ".")
  .option("-s, --system <path>", "Path to system.usm (default: <root>/.usm/system.usm)")
  .option("--apply", "Apply all recommended missing capabilities with defaults (no prompts)", false)
  .option("--check", "Report only; exit non-zero if stale (CI mode)", false)
  .option("-c, --capability <id>", "Target a single capability (e.g. feedback)")
  .action(async (options: {
    root: string;
    system?: string;
    apply: boolean;
    check: boolean;
    capability?: string;
  }) => {
    try {
      const systemPath = options.system
        ? path.resolve(options.system)
        : path.resolve(options.root, ".usm", "system.usm");

      if (!fs.existsSync(systemPath)) {
        console.error(fail(`system.usm not found at ${dim(systemPath)}. Create it with 'usm init-file' or 'usm scan' first.`));
        process.exit(1);
      }

      const system = parseUsmFile(systemPath) as SystemUsm;
      const report = detectUpgrade(system);

      // ── Report ────────────────────────────────────────────────────────────
      const staleTag = report.stale ? warning("stale") : success("up to date");
      console.log(`USM ${info(report.installedVersion)} — project is at ${metric(report.projectVersion)} (${staleTag})`);
      console.log("");

      if (report.missing.length === 0 && !report.stale) {
        console.log(ok("Everything is configured and up to date. Nothing to do."));
        return;
      }

      if (report.recommendedMissing.length > 0) {
        console.log(bold("Missing recommended capabilities:"));
        for (const s of report.recommendedMissing) {
          const newTag = s.isNew ? warning(" [new]") : "";
          console.log(`  ${warn(`${s.capability.id}${newTag}`)}  ${dim(s.capability.name)}`);
          console.log(`      ${dim(s.capability.description)}`);
        }
        console.log("");
      }

      if (report.missing.length > report.recommendedMissing.length) {
        const optional = report.missing.filter((s) => !s.capability.recommended);
        console.log(bold("Other available capabilities:"));
        for (const s of optional) {
          console.log(`    ${dim(s.capability.id)}  ${s.capability.name}`);
        }
        console.log("");
      }

      if (report.configured.length > 0) {
        console.log(bold("Already configured:"));
        for (const s of report.configured) {
          console.log(`  ${ok(s.capability.id)}`);
        }
        console.log("");
      }

      // ── --check: report only, exit non-zero if stale ─────────────────────
      if (options.check) {
        if (report.stale || report.recommendedMissing.length > 0) {
          console.log(info("Run 'usm upgrade' to set up missing capabilities."));
          process.exit(1);
        }
        return;
      }

      // ── --apply: non-interactive setup of recommended missing ────────────
      if (options.apply) {
        const targets = options.capability ? [options.capability] : [];
        const result = await applyUpgrade(systemPath, targets, false);
        for (const a of result.applied) console.log(ok(`${a.id}: ${a.message}`));
        for (const f of result.failed) console.error(fail(`${f.id}: ${f.message}`));
        if (result.versionBumped) {
          console.log(`\n${ok(`Project version bumped to ${metric(report.installedVersion)}.`)}`);
          console.log(info("Run 'usm generate' to refresh rules files and docs."));
        }
        process.exit(result.failed.length > 0 ? 1 : 0);
      }

      // ── Interactive (TTY) ────────────────────────────────────────────────
      if (!process.stdin.isTTY) {
        console.log(skip("Non-interactive shell — showing report only. Re-run with --apply to configure, or in a TTY for guided setup."));
        return;
      }

      const { default: readline } = await import("node:readline/promises");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const targets: string[] = [];
        for (const s of report.recommendedMissing) {
          const ans = (await rl.question(`Set up ${s.capability.id} (${s.capability.name})? [Y/n] `)).trim().toLowerCase();
          if (ans === "" || ans === "y" || ans === "yes") {
            targets.push(s.capability.id);
          }
        }
        if (targets.length === 0) {
          console.log(skip("No capabilities selected. Exiting."));
          return;
        }
        const result = await applyUpgrade(systemPath, targets, true);
        for (const a of result.applied) console.log(ok(`${a.id}: ${a.message}`));
        for (const f of result.failed) console.error(fail(`${f.id}: ${f.message}`));
        if (result.versionBumped) {
          console.log(`\n${ok(`Project version bumped to ${metric(report.installedVersion)}.`)}`);
          console.log(info("Run 'usm generate' to refresh rules files and docs."));
        }
      } finally {
        rl.close();
      }
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
    const spinner = startSpinner("Scanning codebase...");
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

      spinner.succeed(ok(`Scan complete in ${metric(String(result.stats?.duration_ms || 0))}ms`));
      console.log(`  Services found:  ${metric(String(result.stats?.services_found || 0))}`);
      console.log(`  Packages found:  ${metric(String(result.stats?.packages_found || 0))}`);
      console.log(`  Data models:     ${metric(String(result.stats?.data_models_found || 0))}`);
      console.log(`  Features found:  ${metric(String(result.stats?.features_found || 0))}`);
      console.log();

      if (result.files_written.length > 0) {
        console.log(bold("Files written:"));
        const tree = renderFileTree(
          result.files_written.map((f) => f.path),
        );
        console.log(tree);
      }

      if (result.files_skipped.length > 0) {
        console.log(bold("Files skipped:"));
        for (const f of result.files_skipped) {
          console.log(`  ${skip(`${f.path}`)} ${dim(`(${f.reason})`)}`);
        }
        console.log(`\n${info("Use --force to overwrite, or --merge (default) to smart-merge.")}`);
      }

      if (result.warnings && result.warnings.length > 0) {
        console.log(bold("Warnings:"));
        for (const w of result.warnings) {
          console.log(`  ${warn(w)}`);
        }
      }
    } catch (err) {
      spinner.fail(fail("Scan failed"));
      console.error(fail((err as Error).message));
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
        console.log(bold("Warnings:"));
        for (const w of result.warnings) {
          console.log(`  ${warn(w)}`);
        }
        console.log();
      }

      if (result.services.length === 0) {
        console.log(skip("No infrastructure data could be extracted from Terraform files."));
        return;
      }

      console.log(bold(`Extracted infrastructure data for ${metric(String(result.services.length))} service(s):\n`));

      for (const svc of result.services) {
        console.log(`${bold(`─── ${info(svc.serviceId)} ───`)}`);
        console.log(`Source: ${dim(svc.source)}`);
        console.log();
        console.log(svc.yamlBlock);
        console.log();
      }

      console.log(info("Copy the infrastructure: block above into the corresponding service .usm file."));
      console.log(dim("Review and adjust any values before committing."));
    } catch (err) {
      console.error(fail((err as Error).message));
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
      console.log(skip("No .usm files found."));
      return;
    }

    let exitCode = 0;
    for (const filePath of allPaths) {
      const result = validateUsmFile(filePath);
      if (result.valid) {
        console.log(ok(filePath));
        for (const warnItem of result.warnings || []) {
          console.log(`  ${warn(`${warnItem.path}: ${warnItem.message}`)}`);
        }
        // Parse-integrity check: list ids in raw YAML missing from parsed data
        // would validate fine but silently vanish from generated docs (issue #13)
        try {
          const { warnings } = parseUsmFileWithWarnings(filePath);
          for (const warnItem of warnings) {
            console.log(`  ${warn(`${filePath}: ${warnItem}`)}`);
          }
        } catch {
          // Parse errors are reported by validateUsmFile above
        }
      } else {
        console.log(fail(filePath));
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
  .option("--only <target>", "Only generate a specific output: docs, help-docs, togaf, archimate, openapi, tests, rules, agents-md")
  .option("-r, --root <root>", "Monorepo root directory", process.cwd())
  .action(async (options: { check: boolean; only?: string; root: string }) => {
    const root = path.resolve(options.root);
    const onlyTarget = options.only;
    const runAll = !onlyTarget;
    const runDocs = runAll || onlyTarget === "docs";

    // Validate --only target early (before any generation)
    const validTargets = ["docs", "help-docs", "togaf", "archimate", "openapi", "tests", "rules", "agents-md", "structurizr", "readme-facts"];
    if (onlyTarget && !validTargets.includes(onlyTarget)) {
      console.error(fail(`Invalid --only target: ${error(onlyTarget)}. Valid targets: ${validTargets.join(", ")}`));
      process.exit(1);
    }

    // Handle help-docs target specially (filter existing docs, no generation)
    if (onlyTarget === "help-docs") {
      const docsRoot = path.join(root, ".usm-workspace", "docs");
      if (!fs.existsSync(docsRoot)) {
        console.error(fail("No developer docs found. Run 'usm generate' first."));
        process.exit(1);
      }
      const { filterForHelpAudience } = await import("./docs.js");
      const helpRoot = path.join(root, ".usm-workspace", "help-docs");
      const spinner = startSpinner("Generating help docs...");
      console.log("Generating help docs (filtering developer docs)...");
      const count = filterForHelpAudience(root, docsRoot, helpRoot);
      spinner.succeed(ok(`${metric(String(count))} file(s) written to ${dim(".usm-workspace/help-docs/")}`));
      return;
    }

    // Handle archimate target
    if (onlyTarget === "archimate") {
      const systemPath = path.join(root, ".usm", "system.usm");
      if (!fs.existsSync(systemPath)) {
        console.error(fail("No .usm/system.usm found."));
        process.exit(1);
      }
      const system = parseUsmFile(systemPath) as SystemUsm;
      const spinner = startSpinner("Generating ArchiMate model...");
      const result = generateArchiMateModel(system, root);
      if (result.outputs.length > 0) {
        spinner.succeed(ok(`Generated ArchiMate model: ${dim(path.relative(root, result.outputs[0].path))}`));
      } else {
        spinner.warn(skip("No ArchiMate output generated"));
      }
      return;
    }

    // Handle readme-facts target (anti-drift: version/commands/tools into README)
    if (onlyTarget === "readme-facts") {
      const spinner = startSpinner("Updating README facts...");
      const result = generateReadmeFacts(root);
      for (const output of result.outputs) {
        fs.mkdirSync(path.dirname(output.path), { recursive: true });
        fs.writeFileSync(output.path, output.content, "utf-8");
        spinner.succeed(ok(`Updated README facts: ${dim(path.relative(root, output.path))}`));
      }
      return;
    }

    // Handle structurizr target (export .usm → Structurizr DSL workspace)
    if (onlyTarget === "structurizr") {
      const systemPath = path.join(root, ".usm", "system.usm");
      if (!fs.existsSync(systemPath)) {
        console.error(fail("No .usm/system.usm found."));
        process.exit(1);
      }
      const system = parseUsmFile(systemPath) as SystemUsm;
      const serviceFiles = findAllUsmFiles(root).filter((f) => f.includes(`${path.sep}services${path.sep}`));
      const featureFiles = findAllUsmFiles(root).filter((f) => f.includes(`${path.sep}features${path.sep}`));
      const services = serviceFiles.map((f) => parseUsmFile(f) as unknown as import("../types.js").ServiceUsm).filter((s) => s.$type === "service");
      const features = featureFiles.map((f) => parseUsmFile(f) as unknown as import("../types.js").FeatureUsm).filter((s) => s.$type === "feature");
      const spinner = startSpinner("Generating Structurizr workspace...");
      const result = generateStructurizrDsl(system, services, features, root);
      for (const output of result.outputs) {
        fs.mkdirSync(path.dirname(output.path), { recursive: true });
        fs.writeFileSync(output.path, output.content, "utf-8");
        spinner.succeed(ok(`Generated Structurizr workspace: ${dim(path.relative(root, output.path))}`));
      }
      return;
    }

    // Find .usm files across all sub-.usm/ directories in the monorepo
    const files = findAllUsmFiles(root);
    if (files.length === 0) {
      // Fallback: check root .usm/ directly
      const usmDir = path.join(root, ".usm");
      if (fs.existsSync(usmDir)) {
        const rootFiles = findUsmFiles(usmDir);
        if (rootFiles.length === 0) {
          console.log(skip("No .usm files found."));
          return;
        }
        files.push(...rootFiles);
      } else {
        console.error(fail(`No .usm/ directories found in ${dim(root)}`));
        process.exit(1);
      }
    }

    console.log(bold(`Found ${metric(String(files.length))} .usm file(s)\n`));

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
      console.log(warn(`Found ${warning(String(dupes.length))} duplicate $id(s) — this may cause overwrites:`));
      for (const [id, paths] of dupes) {
        console.log(`    ${warn(`$id="${id}"`)} in: ${dim(paths.join(", "))}`);
      }
      console.log();
    }

    // Collect parsed files for aggregator generators
    const systemFiles: SystemUsm[] = [];
    const serviceFiles: ServiceUsm[] = [];
    const featureFiles: FeatureUsm[] = [];
    const dataFiles: DataUsm[] = [];

    // ─── Pass 1: Per-file generation (system, service, feature) ────────────
    const progressBar = startProgress("Generating", files.length);
    for (const filePath of files) {
      try {
        const { parsed, warnings: parseIntegrityWarnings } = parseUsmFileWithWarnings(filePath);
        for (const warnItem of parseIntegrityWarnings) {
          console.log(`  ${warn(`${filePath}: ${warnItem}`)}`);
        }
        const validation = validateUsm(parsed);
        if (!validation.valid) {
          console.log(fail(`${filePath} — validation failed, skipping`));
          for (const err of validation.errors || []) {
            console.log(`  ${err.path}: ${err.message}`);
          }
          progressBar.increment();
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
                console.log(ok(`${output.path} ${dim("(up to date)")}`));
              } else {
                console.log(fail(`${output.path} ${dim("(out of date)")}`));
              }
            } else {
              console.log(fail(`${output.path} ${dim("(missing)")}`));
            }
          } else {
            const outDir = path.dirname(output.path);
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            fs.writeFileSync(output.path, output.content, "utf-8");
            console.log(arrow(output.path));
          }
        }
      } catch (err) {
        console.error(fail(`${filePath} — ${(err as Error).message}`));
      }
      progressBar.increment();
    }
    progressBar.finish();

    // ─── Pass 2: Area overview stubs ──────────────────────────────────────
    const areaResult = generateAreaOverviews(root);

    for (const output of areaResult.outputs) {
      if (options.check) {
        if (fs.existsSync(output.path)) {
          const existing = fs.readFileSync(output.path, "utf-8");
          if (existing === output.content) {
            console.log(ok(`${output.path} ${dim("(up to date)")}`));
          } else {
            console.log(fail(`${output.path} ${dim("(out of date)")}`));
          }
        } else {
          console.log(fail(`${output.path} ${dim("(missing)")}`));
        }
      } else {
        const outDir = path.dirname(output.path);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(output.path, output.content, "utf-8");
        console.log(arrow(`${output.path} ${dim("(area overview)")}`));
      }
    }

    // ─── Pass 3: Aggregator generators (per-service docs) ─────────────────
    const systemFile = systemFiles[0];
    if (systemFile) {
      const aggregatorGenerators: Array<{ name: string; target: string; fn: () => GenerationResult }> = [
        // Cross-cutting platform docs (target: docs)
        { name: "risks", target: "docs", fn: () => generateRisksDoc(systemFile, root) },
        { name: "roadmap", target: "docs", fn: () => generateRoadmapDoc(systemFile, root) },
        { name: "deployment", target: "docs", fn: () => generateDeploymentDoc(systemFile, root) },
        { name: "cli-reference", target: "docs", fn: () => generateCliReference(root) },
        { name: "config-reference", target: "docs", fn: () => generateConfigReference(root) },
        { name: "schema-reference", target: "docs", fn: () => generateSchemaReference(root) },
        { name: "mcp-reference", target: "docs", fn: () => generateMcpReference(root) },
        { name: "reference-pages", target: "docs", fn: () => generateReferencePages(systemFile, root, serviceFiles, featureFiles) },
        { name: "feedback", target: "docs", fn: () => generateFeedbackPage(systemFile, root) },
        { name: "shared-services-index", target: "docs", fn: () => generateSharedServicesIndex(serviceFiles, root) },
        { name: "packages-index", target: "docs", fn: () => generatePackagesIndex(serviceFiles, root) },
        { name: "data-model", target: "docs", fn: () => generateDataModelDoc(dataFiles, root, serviceFiles) },
        { name: "data-index", target: "docs", fn: () => generateDataIndex(root) },
        { name: "seed-data", target: "docs", fn: () => generateSeedDataDoc(serviceFiles, root) },
        // Per-app aggregator docs (target: docs)
        { name: "per-app-decisions", target: "docs", fn: () => generatePerAppDecisions(featureFiles, serviceFiles, root) },
        { name: "per-app-api-reference", target: "docs", fn: () => generatePerAppApiReference(featureFiles, root) },
        { name: "per-app-api-contracts", target: "docs", fn: () => generatePerAppApiContracts(featureFiles, root) },
        { name: "per-app-ui-map", target: "docs", fn: () => generatePerAppUiMap(featureFiles, root) },
        { name: "per-app-test-specs", target: "docs", fn: () => generatePerAppTestSpecs(featureFiles, root) },
        // AGENTS.md (target: agents-md)
        { name: "app-agents-md", target: "agents-md", fn: () => generateAllAppAgentsMd(serviceFiles, root) },
        { name: "root-agents-md", target: "agents-md", fn: () => generateRootAgentsMd(systemFile, serviceFiles, root) },
        // Rules files (target: rules)
        { name: "rules-files", target: "rules", fn: () => generateRulesFiles(systemFile, serviceFiles, root) },
        // OpenAPI (target: openapi)
        { name: "openapi-spec", target: "openapi", fn: () => generateOpenApiSpec(featureFiles, root) },
        { name: "openapi-types", target: "openapi", fn: () => generateOpenApiTypes(featureFiles, root) },
        // Test specs (target: tests)
        { name: "test-specs-per-feature", target: "tests", fn: () => generateAllTestSpecs(featureFiles, root) },
        { name: "test-specs-aggregated", target: "tests", fn: () => generateAggregatedSpecs(featureFiles, root) },
      ];

      for (const agg of aggregatorGenerators) {
        // Skip if --only is specified and doesn't match this generator's target
        if (onlyTarget && agg.target !== onlyTarget) continue;
        try {
          const result = agg.fn();
          for (const output of result.outputs) {
            if (options.check) {
              if (fs.existsSync(output.path)) {
                const existing = fs.readFileSync(output.path, "utf-8");
                if (existing === output.content) {
                  console.log(ok(`${output.path} ${dim("(up to date)")}`));
                } else {
                  console.log(fail(`${output.path} ${dim("(out of date)")}`));
                }
              } else {
                console.log(fail(`${output.path} ${dim("(missing)")}`));
              }
            } else {
              const outDir = path.dirname(output.path);
              if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
              }
              fs.writeFileSync(output.path, output.content, "utf-8");
              console.log(arrow(`${output.path} ${dim(`(${agg.name})`)}`));
            }
          }
        } catch (err) {
          console.error(fail(`aggregator:${agg.name} — ${(err as Error).message}`));
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
          console.log(arrow(`${output.path} ${dim("(surface tables)")}`));
        }
      } catch (err) {
        console.error(fail(`surface-tables — ${(err as Error).message}`));
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
            console.log(arrow(`${output.path} ${dim(`(${gen.name})`)}`));
          }
        } catch (err) {
          console.error(fail(`${gen.name} — ${(err as Error).message}`));
        }
      }
    }

    // ─── Pass 6: TOGAF ADM phase deliverables ────────────────────────────
    if (systemFile && !options.check && (runAll || onlyTarget === "togaf")) {
      try {
        const togafResult = generateAllTogafDeliverables(systemFile, root);
        for (const output of togafResult.outputs) {
          const outDir = path.dirname(output.path);
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          fs.writeFileSync(output.path, output.content, "utf-8");
          console.log(arrow(`${output.path} ${dim("(togaf)")}`));

          // Also surface in the developer docs tree as the Architecture section
          // (help audience omits it). Only during full generate, not standalone togaf.
          if (runAll) {
            const docsArchDir = path.join(root, ".usm-workspace", "docs", "architecture");
            fs.mkdirSync(docsArchDir, { recursive: true });
            fs.writeFileSync(path.join(docsArchDir, path.basename(output.path)), output.content, "utf-8");
          }
        }
      } catch (err) {
        console.error(fail(`togaf — ${(err as Error).message}`));
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

    console.log(`${bold("1.")} Parsing original file...`);
    const original = parseUsmFile(resolved);
    console.log(`   Type: ${original.$type}, ID: ${original.$id}`);

    console.log(`${bold("2.")} Validating original...`);
    const validation = validateUsm(original);
    if (!validation.valid) {
      console.log(`   ${fail("Validation failed:")}`);
      for (const err of validation.errors || []) {
        console.log(`   ${err.path}: ${err.message}`);
      }
      process.exit(1);
    }
    console.log(`   Validation: ${ok("")}`.trim());

    console.log(`${bold("3.")} Generating markdown...`);
    const result = generate(original, ["markdown"]);
    for (const output of result.outputs) {
      console.log(`   ${arrow(`${output.path} (${metric(String(output.content.length))} chars)`)}`);
    }

    console.log(`${bold("4.")} Re-parsing original...`);
    const reparsed = parseUsmFile(resolved);
    console.log(`   Type: ${reparsed.$type}, ID: ${reparsed.$id}`);

    if (reparsed.$type === original.$type && reparsed.$id === original.$id && reparsed.$version === original.$version) {
      console.log(`${bold("5.")} Roundtrip: ${ok("key fields match")}`);
    } else {
      console.log(`${bold("5.")} Roundtrip: ${fail("key fields mismatch")}`);
      process.exit(1);
    }
  });

// ─── query ─────────────────────────────────────────────────────────────────────

program
  .command("query")
  .description([
    "Query .usm files with a predicate expression (read-only).",
    "",
    "Examples:",
    "  usm query \"features where status = planned\"",
    "  usm query \"features where contracts > 0 and not (status = deprecated)\"",
    "  usm query \"all where summary ~ auth\"",
    "  usm query \"services where has decisions\" --json",
  ].join("\n"))
  .argument("<expr>", "Query: <selector> [where <predicate>]")
  .option("-r, --root <root>", "Repo root directory", ".")
  .option("--json", "Output full parsed objects as JSON")
  .option("--limit <n>", "Cap number of results", "100")
  .action((expr: string, opts: { root: string; json: boolean; limit: string }) => {
    const root = path.resolve(opts.root);

    // Collect .usm files (same discovery as validate/generate)
    const files = findAllUsmFiles(root);
    if (files.length === 0) {
      const usmDir = path.join(root, ".usm");
      if (fs.existsSync(usmDir)) files.push(...findUsmFiles(usmDir));
    }
    if (files.length === 0) {
      console.log(skip("No .usm files found."));
      return;
    }

    const hitsWithPaths = files
      .map((filePath) => {
        try {
          return { file: parseUsmFile(filePath) as unknown as Record<string, unknown>, path: filePath };
        } catch {
          return null; // unparseable files simply aren't queryable
        }
      })
      .filter((x): x is { file: Record<string, unknown>; path: string } => x !== null);

    let hits;
    try {
      hits = runQuery(expr, hitsWithPaths);
    } catch (err) {
      if (err instanceof QueryParseError) {
        console.error(fail(`Query error: ${error(err.message)}`));
        process.exit(1);
      }
      throw err;
    }

    const limit = Number(opts.limit) || 100;
    const truncated = hits.length > limit;
    const shown = truncated ? hits.slice(0, limit) : hits;

    if (opts.json) {
      console.log(JSON.stringify(shown.map((h) => h.file), null, 2));
    } else {
      for (const hit of shown) {
        const file = hit.file;
        const id = String(file.$id ?? path.basename(hit.path));
        const status = file.status ? String(file.status) : String(file.$type ?? "");
        const summaryText = String(file.summary ?? "").split("\n")[0].slice(0, 80);
        console.log(`${info(id)}  ${dim(`[${status}]`)}  ${dim(summaryText)}`);
      }
    }
    console.error(`\n${metric(String(hits.length))} match(es)${truncated ? ` ${dim(`(showing ${shown.length})`)}` : ""} across ${metric(String(hitsWithPaths.length))} file(s)`);
  });

// ─── import ─────────────────────────────────────────────────────────────────────

program
  .command("import")
  .description("Import an external model into .usm specs (currently: Structurizr workspace JSON)")
  .argument("<file>", "Path to the export file (e.g. structurizr-workspace.json)")
  .option("-f, --format <format>", "Import format", "structurizr-json")
  .option("-r, --root <root>", "Repo root directory", ".")
  .option("--id <prefix>", "$id org prefix (defaults to slugified system name)")
  .option("--domain <domain>", "identity.domain for the system file", "example.com")
  .option("--force", "Overwrite existing .usm files", false)
  .option("--dry-run", "List planned writes without writing", false)
  .action((file: string, opts: { format: string; root: string; id?: string; domain: string; force: boolean; dryRun: boolean }) => {
    if (opts.format !== "structurizr-json") {
      console.error(fail(`Unknown import format ${error(opts.format)}. Supported: structurizr-json`));
      process.exit(1);
    }
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      console.error(fail(`File not found: ${dim(resolved)}`));
      process.exit(1);
    }
    const root = path.resolve(opts.root);
    const raw = fs.readFileSync(resolved, "utf-8");

    try {
      parseStructurizrWorkspace(raw);
    } catch (err) {
      console.error(fail((err as Error).message));
      process.exit(1);
    }

    const result = importStructurizrWorkspace(raw, {
      root,
      idPrefix: opts.id,
      domain: opts.domain,
      force: opts.force,
      dryRun: opts.dryRun,
    });

    if (opts.dryRun) {
      console.log(bold("Planned writes (--dry-run, nothing written):"));
      for (const entry of result.planned) {
        const tag = entry.wouldOverwrite ? warning("OVERWRITE") : "create  ";
        console.log(`  ${tag} ${dim(path.relative(root, entry.path))}  ${dim(`(${entry.name})`)}`);
      }
      return;
    }

    if (result.skipped.length > 0) {
      console.error(fail("Refusing to overwrite existing files (use --force to override):"));
      for (const entry of result.skipped) {
        console.error(`  ${dim(path.relative(root, entry.path))}`);
      }
      process.exit(1);
    }

    for (const entry of result.written) {
      console.log(ok(`wrote ${dim(path.relative(root, entry.path))}  ${dim(`(${entry.name})`)}`));
    }
    if (result.errors.length > 0) {
      console.error(fail("Errors:"));
      for (const err of result.errors) console.error(`  ${warn(err)}`);
      process.exit(1);
    }
    console.log(`\n${ok(`Imported ${metric(String(result.written.length))} file(s)`)}. Review them, set a real identity.domain, then run 'usm generate'.`);
  });

// ─── info ──────────────────────────────────────────────────────────────────────

program
  .command("info")
  .description("Show summary of a .usm file")
  .arguments("<file>")
  .action((filePath: string) => {
    const resolved = path.resolve(filePath);
    const parsed = parseUsmFile(resolved);

    console.log(`${bold("ID:")}       ${info(parsed.$id ?? "")}`);
    console.log(`${bold("Type:")}     ${info(parsed.$type ?? "")}`);
    console.log(`${bold("Version:")}  ${metric(String(parsed.$version ?? ""))}`);
    console.log(`${bold("Updated:")}  ${dim(parsed.$last_updated || "—")}`);
    console.log(`${bold("Summary:")}  ${parsed.summary}`);

    if (isSystemFile(parsed)) {
      console.log(`${bold("Identity:")} ${info(parsed.identity.name)} ${dim(`(${parsed.identity.domain})`)}`);
      console.log(`${bold("Features:")} ${metric(String(parsed.index?.length || 0))}`);
      console.log(`${bold("Services:")} ${metric(String(parsed.services?.length || 0))}`);
    } else if (isServiceFile(parsed)) {
      console.log(`${bold("System:")}   ${info(parsed.$system ?? "")}`);
      console.log(`${bold("Runtime:")}  ${info(parsed.runtime ?? "")}`);
      console.log(`${bold("Port:")}     ${metric(String(parsed.port ?? "—"))}`);
      console.log(`${bold("Modules:")}  ${metric(String(parsed.modules?.length || 0))}`);
    } else if (isFeatureFile(parsed)) {
      console.log(`${bold("System:")}     ${info(parsed.$system ?? "")}`);
      console.log(`${bold("Service:")}    ${info(parsed.$service ?? "")}`);
      console.log(`${bold("Flows:")}      ${metric(String(parsed.flows?.length || 0))}`);
      console.log(`${bold("Tests:")}      ${metric(String(parsed.tests?.length || 0))}`);
      console.log(`${bold("Contracts:")}  ${metric(String(parsed.contracts?.length || 0))}`);
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
          console.log(skip("Enrichment is disabled in usmconfig.json. Set enrichment.enabled to true to enable."));
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
        const spinner = startSpinner(`Enriching: ${dim(filePath)}`);
        const result = await enrichFile(filePath, enrichConfig, enrichOptions);

        if (result.error) {
          spinner.fail(fail(`${result.file}: ${result.error}`));
          process.exit(1);
        }

        if (result.fields_filled.length > 0) {
          spinner.succeed(ok(result.file));
          console.log(`  Filled:     ${success(result.fields_filled.join(", "))}`);
          console.log(`  Preserved:  ${dim(result.fields_preserved.join(", ") || "none")}`);
          console.log(`  Skipped:    ${dim(result.fields_skipped.join(", ") || "none")}`);
          if (result.tokens_used) console.log(`  Tokens:     ${metric(String(result.tokens_used))}`);
          console.log(`  Duration:   ${metric(String(result.duration_ms))}ms`);
        } else if (result.fields_preserved.length > 0) {
          spinner.warn(skip(`${result.file} — no TODO fields found`));
        } else if (options.dryRun) {
          spinner.info(skip(`${result.file} — dry run, no changes made`));
        } else {
          spinner.info(skip(`${result.file} — no fields were filled`));
        }
      } else {
        const usmDir = path.join(root, ".usm");
        if (!fs.existsSync(usmDir)) {
          console.error(fail(`No .usm/ directory found at ${dim(usmDir)}`));
          process.exit(1);
        }

        console.log(bold(`Enriching all files with TODOs in: ${dim(usmDir)}`));
        const spinner = startSpinner("Running enrichment...");
        const results = await enrichDirectory(usmDir, enrichConfig, enrichOptions);

        if (results.length === 0) {
          spinner.info(skip("No .usm files with TODO: describe placeholders found."));
          return;
        }

        spinner.succeed(ok(`Enrichment complete: ${metric(String(results.length))} file(s) processed`));
        let totalFilled = 0;
        let totalPreserved = 0;
        let totalErrors = 0;

        for (const result of results) {
          if (result.error) {
            console.error(`  ${fail(`${result.file}: ${result.error}`)}`);
            totalErrors++;
          } else if (result.fields_filled.length > 0) {
            console.log(`  ${ok(`${result.file}`)} — filled: ${success(result.fields_filled.join(", "))}`);
            totalFilled += result.fields_filled.length;
          } else {
            console.log(`  ${skip(`${result.file}`)} — no fields filled`);
          }
          totalPreserved += result.fields_preserved.length;
        }

        console.log(`\n  Fields filled:    ${metric(String(totalFilled))}`);
        console.log(`  Fields preserved: ${metric(String(totalPreserved))}`);
        console.log(`  Errors:           ${error(String(totalErrors))}`);
      }
    } catch (err) {
      console.error(fail((err as Error).message));
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
      console.error(fail(`Unknown mcp action: ${error(action)}. Use 'serve'.`));
      process.exit(1);
    }
  });

// ─── docs ─────────────────────────────────────────────────────────────────────

program
  .command("docs")
  .description("Docs site commands (requires VitePress)")
  .arguments("<action>")
  .option("-p, --port <port>", "Dev server port (default: 5173)", "5173")
  .option("-a, --audience <audience>", "Audience: developer (default) or help", "developer")
  .option("--auto-port", "Auto-select next free port if the requested port is in use")
  .option("--restart", "Kill existing server and restart")
  .option("--watch", "Watch .usm/ files and auto-regenerate docs on change")
  .option("--open", "Open browser at the served URL")
  .action(async (action: string, options: {
    port: string;
    audience: string;
    autoPort?: boolean;
    restart?: boolean;
    watch?: boolean;
    open?: boolean;
  }) => {
    const root = path.resolve(process.cwd());
    const { docsBuild, docsServe, docsStatus, docsStop } = await import("./docs.js");

    const audience: "help" | "developer" = options.audience === "help" ? "help" : "developer";

    if (action === "build") {
      await docsBuild(root, audience);
    } else if (action === "serve") {
      await docsServe(root, {
        port: parseInt(options.port, 10),
        audience,
        autoPort: options.autoPort,
        restart: options.restart,
        watch: options.watch,
        open: options.open,
      });
    } else if (action === "status") {
      docsStatus(root, audience);
    } else if (action === "stop") {
      docsStop(root, audience);
    } else {
      console.error(fail(`Unknown docs action: ${error(action)}. Use 'build', 'serve', 'status', or 'stop'.`));
      process.exit(1);
    }
  });

// ─── check ───────────────────────────────────────────────────────────────────

program
  .command("check")
  .description("Verify .usm files are in sync with the codebase (for CI)")
  .option("-r, --root <root>", "Monorepo root directory", process.cwd())
  .action((options: { root: string }) => {
    const root = path.resolve(options.root);
    const allFiles = findAllUsmFiles(root);
    let errors = 0;
    let warnings = 0;

    console.log(bold(`Checking ${metric(String(allFiles.length))} .usm file(s)...\n`));

    for (const filePath of allFiles) {
      // 1. Validate against schema
      const validation = validateUsmFile(filePath);
      if (!validation.valid) {
        console.log(fail(filePath));
        for (const err of validation.errors || []) {
          console.log(`  ${err.path}: ${err.message}`);
        }
        errors++;
        continue;
      }

      // 2. Check for $version warnings
      let hasWarnings = false;
      for (const warnItem of validation.warnings || []) {
        console.log(warn(filePath));
        console.log(`  ${warnItem.path}: ${warnItem.message}`);
        hasWarnings = true;
        warnings++;
      }

      // 3. Check implementation paths exist (for features with implementation.primary)
      try {
        const parsed = parseUsmFile(filePath);
        if (isFeatureFile(parsed)) {
          const feature = parsed as FeatureUsm;
          if (feature.implementation?.primary) {
            const implPath = path.resolve(root, feature.implementation.primary);
            if (!fs.existsSync(implPath)) {
              console.log(warn(filePath));
              console.log(`  implementation.primary: ${feature.implementation.primary} does not exist`);
              warnings++;
              hasWarnings = true;
            }
          }
        }
      } catch {
        // Skip if can't parse
      }

      if (!hasWarnings) {
        console.log(ok(filePath));
      }
    }

    console.log(`\n${ok(String(allFiles.length - errors - warnings))} valid, ${warn(String(warnings))} warnings, ${fail(String(errors))} errors`);

    if (errors > 0) {
      process.exit(1);
    }
  });

program.parse();
