// Infrastructure scanner — extracts structured data from Terraform .tf files
// and outputs a draft YAML block for the service's `infrastructure:` field.
//
// Usage: usm scan infrastructure [--root .] [--config usmconfig.json]
//
// This scanner does NOT write to .usm files. It prints to stdout so the
// human/agent can review and merge the output.

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { UsmConfig } from "./types.js";
import { yamlStringify } from "./utils.js";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface InfrastructureScanOptions {
  root: string;
  configPath: string;
}

export interface InfrastructureScanResult {
  services: ServiceInfraResult[];
  warnings: string[];
}

export interface ServiceInfraResult {
  serviceId: string;
  infrastructure: Record<string, unknown>;
  yamlBlock: string;
  source: string;
}

/**
 * Scan the codebase for Terraform files and extract infrastructure data
 * for each service that has a corresponding .usm service file.
 */
export async function scanInfrastructure(
  options: InfrastructureScanOptions
): Promise<InfrastructureScanResult> {
  const root = path.resolve(options.root);
  const configPath = path.resolve(options.configPath);
  const warnings: string[] = [];
  const results: ServiceInfraResult[] = [];

  // 1. Read config (validates it exists and is v1)
  readConfig(configPath);

  // 2. Find all .tf files under infrastructure/
  const tfFiles = fg.sync(["infrastructure/**/*.tf"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.terraform/**"],
  });

  if (tfFiles.length === 0) {
    warnings.push("No .tf files found under infrastructure/");
    return { services: results, warnings };
  }

  // 3. Read and concatenate all .tf content for parsing
  const tfContentByFile = new Map<string, string>();
  for (const file of tfFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      tfContentByFile.set(path.relative(root, file), content);
    } catch {
      warnings.push(`Could not read ${file}`);
    }
  }

  const allTfContent = Array.from(tfContentByFile.entries())
    .map(([fp, content]) => `# FILE: ${fp}\n${content}`)
    .join("\n\n");

  // 4. For each known service, try to extract infrastructure data
  const knownServices = [
    "the-architect",
    "zitadel",
    "litellm",
    "langflow",
    "nango",
  ];

  for (const serviceId of knownServices) {
    const infra = extractServiceInfrastructure(serviceId, allTfContent, tfContentByFile, root);
    if (infra && Object.keys(infra).length > 0) {
      const yamlBlock = yamlStringify({ infrastructure: infra } as Record<string, unknown>);
      results.push({
        serviceId,
        infrastructure: infra,
        yamlBlock,
        source: `infrastructure/${serviceId}/*.tf + related files`,
      });
    }
  }

  // 5. Also check for services referenced in usmconfig that aren't in knownServices
  const allServiceIds = new Set(knownServices);

  // Find all service USM files and extract their IDs
  const usmFiles = fg.sync(["**/.usm/services/*.usm"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });

  for (const usmFile of usmFiles) {
    try {
      const content = fs.readFileSync(usmFile, "utf-8");
      const match = content.match(/^\$id:\s*(.+)$/m);
      if (match) {
        const id = match[1].trim();
        const shortId = id.split("/").pop() || "";
        if (!allServiceIds.has(shortId)) {
          allServiceIds.add(shortId);
          const infra = extractServiceInfrastructure(shortId, allTfContent, tfContentByFile, root);
          if (infra && Object.keys(infra).length > 0) {
            const yamlBlock = yamlStringify({ infrastructure: infra } as Record<string, unknown>);
            results.push({
              serviceId: shortId,
              infrastructure: infra,
              yamlBlock,
              source: `infrastructure/${shortId}/*.tf + related files`,
            });
          }
        }
      }
    } catch {
      // Skip unparseable files
    }
  }

  return { services: results, warnings };
}

// ─── Terraform Parser (regex-based) ──────────────────────────────────────────

/**
 * Extract infrastructure data for a specific service from Terraform content.
 */
function extractServiceInfrastructure(
  serviceId: string,
  allTfContent: string,
  tfContentByFile: Map<string, string>,
  root: string
): Record<string, unknown> | null {
  const infra: Record<string, unknown> = {};

  // Provider detection
  infra.provider = detectProvider(allTfContent);

  // Region detection
  const region = detectRegion(allTfContent);
  if (region) infra.region = region;

  // Compute detection — look for ECS task definitions, Fargate config
  const compute = detectCompute(serviceId, allTfContent);
  if (compute && Object.keys(compute).length > 0) infra.compute = compute;

  // Networking detection — ALB, DNS, ports
  const networking = detectNetworking(serviceId, allTfContent);
  if (networking && Object.keys(networking).length > 0) infra.networking = networking;

  // Data detection — RDS, databases
  const data = detectData(allTfContent);
  if (data && Object.keys(data).length > 0) infra.data = data;

  // Secrets detection
  const secrets = detectSecrets(serviceId, allTfContent);
  if (secrets && secrets.length > 0) infra.secrets = secrets;

  // Monitoring detection
  const monitoring = detectMonitoring(serviceId, allTfContent);
  if (monitoring && Object.keys(monitoring).length > 0) infra.monitoring = monitoring;

  // Self-hosting detection
  const selfHosting = detectSelfHosting(serviceId, root);
  if (selfHosting && Object.keys(selfHosting).length > 0) infra.self_hosting = selfHosting;

  // If nothing was found, return null
  if (Object.keys(infra).length === 0) return null;

  return infra;
}

function detectProvider(content: string): string {
  if (content.includes("provider \"aws\"") || content.includes("aws_")) return "aws";
  if (content.includes("provider \"google\"") || content.includes("google_")) return "gcp";
  if (content.includes("provider \"azurerm\"") || content.includes("azurerm_")) return "azure";
  return "other";
}

function detectRegion(content: string): string | undefined {
  // Check for explicit region in provider block
  const providerMatch = content.match(/provider\s+"aws"\s*\{[^}]*region\s*=\s*"([^"]+)"/s);
  if (providerMatch) return providerMatch[1];

  // Check for aws_region variable or hardcoded region
  const regionVar = content.match(/region\s*=\s*"((?:us|eu|ap|sa|ca|me|af)-[a-z]+-\d+)"/);
  if (regionVar) return regionVar[1];

  // Check for awslogs-region (CloudWatch)
  const logsRegion = content.match(/awslogs-region\s*=\s*"((?:us|eu|ap|sa|ca|me|af)-[a-z]+-\d+)"/);
  if (logsRegion) return logsRegion[1];

  return undefined;
}

function detectCompute(
  serviceId: string,
  content: string
): Record<string, unknown> | undefined {
  const compute: Record<string, unknown> = {};

  // Normalize service ID for matching (the-architect → the_architect or the-architect)
  const tfServiceName = serviceId.replace(/-/g, "_");
  const tfServiceDash = serviceId;

  // Detect ECS task definitions for this service
  // Match: resource "aws_ecs_task_definition" "zitadel" {
  const taskDefRegex = new RegExp(
    `resource\\s+"aws_ecs_task_definition"\\s+"(?:${tfServiceName}|${tfServiceDash})"[\\s\\S]*?requires_compatibilities\\s*=\\s*\\[([^\\]]+)\\]`,
    "m"
  );
  const taskDefMatch = content.match(taskDefRegex);

  if (taskDefMatch) {
    const compatStr = taskDefMatch[1];
    if (compatStr.includes("FARGATE")) {
      compute.type = "fargate";
    } else if (compatStr.includes("EC2")) {
      compute.type = "ec2";
    }
  }

  // Also try a broader match — any ECS task definition that mentions the service
  if (!compute.type) {
    const broadTaskRegex = new RegExp(
      `aws_ecs_task_definition"\\s+"${tfServiceName}"`,
      "m"
    );
    if (broadTaskRegex.test(content)) {
      compute.type = "fargate"; // Default assumption for AWS
    }
  }

  // Detect CPU
  const cpuVarMatch = content.match(
    new RegExp(`variable\\s+"${tfServiceName}_cpu"[\\s\\S]*?default\\s*=\\s*(\\d+)`, "m")
  );
  if (cpuVarMatch) {
    compute.cpu = parseInt(cpuVarMatch[1], 10);
  }

  // Also look for the-architect specific variables (task_cpu, task_memory)
  if (serviceId === "the-architect") {
    const taskCpuMatch = content.match(/variable\s+"task_cpu"[\s\S]*?default\s*=\s*(\d+)/m);
    if (taskCpuMatch) compute.cpu = parseInt(taskCpuMatch[1], 10);
  }

  // Detect memory
  const memVarMatch = content.match(
    new RegExp(`variable\\s+"${tfServiceName}_memory"[\\s\\S]*?default\\s*=\\s*(\\d+)`, "m")
  );
  if (memVarMatch) {
    compute.memory_mb = parseInt(memVarMatch[1], 10);
  }

  if (serviceId === "the-architect") {
    const taskMemMatch = content.match(/variable\s+"task_memory"[\s\S]*?default\s*=\s*(\d+)/m);
    if (taskMemMatch) compute.memory_mb = parseInt(taskMemMatch[1], 10);
  }

  // Detect desired_count
  const countVarMatch = content.match(
    new RegExp(`variable\\s+"${tfServiceName}_desired_count"[\\s\\S]*?default\\s*=\\s*(\\d+)`, "m")
  );
  if (countVarMatch) {
    compute.desired_count = parseInt(countVarMatch[1], 10);
  }

  if (serviceId === "the-architect") {
    const desiredMatch = content.match(/variable\s+"desired_count"[\s\S]*?default\s*=\s*(\d+)/m);
    if (desiredMatch) compute.desired_count = parseInt(desiredMatch[1], 10);
  }

  // Detect spot vs on-demand from capacity_provider_strategy
  const serviceRegex = new RegExp(
    `resource\\s+"aws_ecs_service"\\s+"${tfServiceName}"[\\s\\S]*?(?=resource\\s+"aws_ecs_service"|$)`,
    "m"
  );
  const serviceMatch = content.match(serviceRegex);
  if (serviceMatch) {
    const serviceBlock = serviceMatch[0];
    if (serviceBlock.includes("FARGATE_SPOT")) {
      if (serviceBlock.includes("FARGATE") && !serviceBlock.includes("FARGATE_SPOT")) {
        compute.mode = "on-demand";
      } else {
        compute.mode = "mixed";
      }
    } else if (serviceBlock.includes("FARGATE")) {
      compute.mode = "on-demand";
    }
  }

  // Also check the-architect ECS service (different naming)
  if (serviceId === "the-architect") {
    const archServiceMatch = content.match(
      /resource\s+"aws_ecs_service"\s+"the_architect"[\s\S]*?(?=resource\s+"aws_ecs_service"|$)/m
    );
    if (archServiceMatch) {
      const block = archServiceMatch[0];
      if (block.includes("FARGATE_SPOT")) {
        compute.mode = "mixed";
      } else if (block.includes("FARGATE")) {
        compute.mode = "on-demand";
      }
    }
  }

  return Object.keys(compute).length > 0 ? compute : undefined;
}

function detectNetworking(
  serviceId: string,
  content: string
): Record<string, unknown> | undefined {
  const networking: Record<string, unknown> = {};

  const tfServiceName = serviceId.replace(/-/g, "_");

  // Detect port from variable
  const portVarMatch = content.match(
    new RegExp(`variable\\s+"${tfServiceName}_port"[\\s\\S]*?default\\s*=\\s*(\\d+)`, "m")
  );
  if (portVarMatch) {
    networking.port = parseInt(portVarMatch[1], 10);
  }

  // Detect the-architect port (uses "container_port" variable name)
  if (serviceId === "the-architect") {
    const containerPortMatch = content.match(
      /variable\s+"container_port"[\s\S]*?default\s*=\s*(\d+)/m
    );
    if (containerPortMatch) networking.port = parseInt(containerPortMatch[1], 10);
  }

  // Detect hostname/domain from variable
  const domainVarMatch = content.match(
    new RegExp(`variable\\s+"${tfServiceName}_domain"[\\s\\S]*?default\\s*=\\s*"([^"]+)"`, "m")
  );
  if (domainVarMatch) {
    networking.hostnames = [domainVarMatch[1]];
  }

  if (serviceId === "the-architect") {
    const domainMatch = content.match(/variable\s+"domain"[\s\S]*?default\s*=\s*"([^"]+)"/m);
    if (domainMatch) networking.hostnames = [domainMatch[1]];
  }

  // Detect ALB listener rule
  const listenerRuleRegex = new RegExp(
    `resource\\s+"aws_lb_listener_rule"\\s+"${tfServiceName}"`,
    "m"
  );
  if (listenerRuleRegex.test(content)) {
    networking.alb_listener_rule = `host-based: ${serviceId}`;
  }

  // Detect protocol
  const tgRegex = new RegExp(
    `resource\\s+"aws_lb_target_group"\\s+"${tfServiceName}"[\\s\\S]*?protocol\\s*=\\s*"([^"]+)"`,
    "m"
  );
  const tgMatch = content.match(tgRegex);
  if (tgMatch) {
    const proto = tgMatch[1].toLowerCase();
    networking.protocol = proto === "http" ? "http" : "https";
  }

  // TLS termination — assume Cloudflare for smith-gray.ai
  if (content.includes("cloudflare") || content.includes("smith-gray.ai")) {
    networking.tls_termination = "cloudflare";
  } else if (content.includes("aws_lb_listener") && content.includes("HTTPS")) {
    networking.tls_termination = "alb";
  }

  return Object.keys(networking).length > 0 ? networking : undefined;
}

function detectData(content: string): Record<string, unknown> | undefined {
  const data: Record<string, unknown> = {};

  // Detect RDS instance
  const rdsMatch = content.match(
    /resource\s+"aws_db_instance"\s+"(\w+)"[\s\S]*?engine\s*=\s*"(\w+)"[\s\S]*?engine_version\s*=\s*"([^"]+)"/m
  );
  if (rdsMatch) {
    data.engine = `${rdsMatch[2]} ${rdsMatch[3]}`;
  }

  const instanceClassMatch = content.match(
    /variable\s+"rds_instance_class"[\s\S]*?default\s*=\s*"([^"]+)"/m
  );
  if (instanceClassMatch) {
    data.instance_class = instanceClassMatch[1];
  }

  const multiAzMatch = content.match(
    /variable\s+"rds_multi_az"[\s\S]*?default\s*=\s*(true|false)/m
  );
  if (multiAzMatch) {
    data.multi_az = multiAzMatch[1] === "true";
  }

  const backupMatch = content.match(
    /backup_retention_period\s*=\s*(\d+)/m
  );
  if (backupMatch) {
    data.backup_retention_days = parseInt(backupMatch[1], 10);
  }

  return Object.keys(data).length > 0 ? data : undefined;
}

function detectSecrets(
  _serviceId: string,
  content: string
): Array<Record<string, string>> | undefined {
  const secrets: Array<Record<string, string>> = [];

  // Find secrets referenced in the service's task definition
  // Match: { name = "VAR_NAME", valueFrom = "arn..." }
  const secretRegex = /name\s*=\s*"([^"]+)"\s*,\s*valueFrom\s*=\s*"[^"]*secretsmanager[^"]*"/g;
  let match: RegExpExecArray | null;

  // Also check for SSM parameter references
  const ssmRegex = /name\s*=\s*"([^"]+)"\s*,\s*valueFrom\s*=\s*"[^"]*ssm[^"]*"/g;

  // Get unique secret names
  const secretNames = new Set<string>();
  while ((match = secretRegex.exec(content)) !== null) {
    secretNames.add(match[1]);
  }
  while ((match = ssmRegex.exec(content)) !== null) {
    secretNames.add(match[1]);
  }

  for (const name of secretNames) {
    secrets.push({
      name,
      source: name.match(/PASSWORD|KEY|SECRET|MASTER/) ? "secrets-manager" : "ssm",
      purpose: inferSecretPurpose(name),
    });
  }

  return secrets.length > 0 ? secrets : undefined;
}

function inferSecretPurpose(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("database") || lower.includes("db")) return "Database credential";
  if (lower.includes("master_key") || lower.includes("masterkey")) return "Service master key";
  if (lower.includes("admin")) return "Admin credential";
  if (lower.includes("client_secret")) return "OIDC client secret";
  if (lower.includes("client_id")) return "OIDC client ID";
  if (lower.includes("issuer")) return "OIDC issuer URL";
  if (lower.includes("api_key")) return "API key";
  return "Application secret";
}

function detectMonitoring(
  serviceId: string,
  content: string
): Record<string, unknown> | undefined {
  const monitoring: Record<string, unknown> = {};

  // CloudWatch is the default for AWS
  if (content.includes("aws_cloudwatch_log_group") || content.includes("awslogs")) {
    monitoring.logs = "cloudwatch";
  }

  if (content.includes("containerInsights") || content.includes("cloudwatch")) {
    monitoring.metrics = "cloudwatch";
  }

  // Detect alarms
  const alarmNames: string[] = [];
  const alarmRegex = /resource\s+"aws_cloudwatch_metric_alarm"\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = alarmRegex.exec(content)) !== null) {
    alarmNames.push(match[1]);
  }
  if (alarmNames.length > 0) {
    monitoring.alarms = alarmNames;
  }

  return Object.keys(monitoring).length > 0 ? monitoring : undefined;
}

function detectSelfHosting(
  serviceId: string,
  root: string
): Record<string, unknown> | undefined {
  const selfHosting: Record<string, unknown> = {};

  // Check if there's a Dockerfile in the service directory
  const possiblePaths = [
    path.join(root, "infrastructure", "services", serviceId, "Dockerfile"),
    path.join(root, "infrastructure", serviceId, "Dockerfile"),
    path.join(root, "docker", serviceId, "Dockerfile"),
  ];

  for (const dockerfilePath of possiblePaths) {
    if (fs.existsSync(dockerfilePath)) {
      selfHosting.supported = true;
      selfHosting.requirements = ["Docker", "Environment variables from .env.example"];
      const svcDir = path.dirname(dockerfilePath);
      const readmePath = path.join(svcDir, "README.md");
      selfHosting.guide_ref = fs.existsSync(readmePath)
        ? `infrastructure/services/${serviceId}/README.md`
        : "infrastructure/";
      break;
    }
  }

  // Check docker-compose.yml if no Dockerfile found
  const dockerComposePath = path.join(root, "docker-compose.yml");
  if (fs.existsSync(dockerComposePath) && !selfHosting.supported) {
    try {
      const content = fs.readFileSync(dockerComposePath, "utf-8");
      // Use both dash and underscore forms
      const tfServiceName = serviceId.replace(/-/g, "_");
      if (content.includes(serviceId) || content.includes(tfServiceName)) {
        selfHosting.supported = true;
        selfHosting.requirements = ["Docker Compose", "Environment variables"];
        selfHosting.guide_ref = "docker-compose.yml";
      }
    } catch {
      // Ignore
    }
  }

  return Object.keys(selfHosting).length > 0 ? selfHosting : undefined;
}

// ─── Config reader ───────────────────────────────────────────────────────────

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
