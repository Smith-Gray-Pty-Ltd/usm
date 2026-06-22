// Common fields present in all .usm files
export interface UsmCommon {
  $schema: string;
  $id: string;
  $type: "system" | "service" | "feature" | "api" | "data" | "policy" | "operations";
  $version: number;
  $last_updated?: string;
  summary: string;
}

// System file types
export interface SystemIdentity {
  name: string;
  domain: string;
  contact?: string;
}

export interface FeatureRef {
  id: string;
  name: string;
  ref: string;
  status?: "active" | "planned" | "deprecated" | "experimental";
  tags?: string[];
}

export interface ServiceRef {
  id: string;
  name: string;
  ref: string;
  port?: number;
  depends_on?: string[];
}

export interface ApiRef {
  id: string;
  name: string;
  ref: string;
}

export interface DataRef {
  id: string;
  name: string;
  ref: string;
}

export interface Infrastructure {
  cloud?: string;
  region?: string;
  terraform_ref?: string;
  dns?: string;
  ssl?: string;
  [key: string]: unknown;
}

export interface DeploymentEnvironment {
  name: string;
  url?: string;
  type?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface Deployment {
  environments: DeploymentEnvironment[];
  [key: string]: unknown;
}

export interface Operations {
  monitoring?: string;
  alerts?: string;
  on_call?: string;
  [key: string]: unknown;
}

export interface Policies {
  refs?: string[];
  [key: string]: unknown;
}

export interface SystemUsm extends UsmCommon {
  $type: "system";
  identity: SystemIdentity;
  status?: "planned" | "in-progress" | "built" | "deprecated";
  index?: FeatureRef[];
  services?: ServiceRef[];
  apis?: ApiRef[];
  data?: DataRef[];
  infrastructure?: Infrastructure;
  deployment?: Deployment;
  operations?: Operations;
  policies?: Policies;
  risks?: Risk[];
  roadmap?: RoadmapItem[];
  agent_context?: string;
  conventions?: string[];
  mandatory_reading?: MandatoryReadingItem[];
  nextjs_breaking_changes?: string;
  principles?: Principle[];
  local_development?: LocalDevelopment;
}

export interface Principle {
  key: string;
  name: string;
  statement: string;
  rationale: string;
  implications?: string[];
}

export interface MandatoryReadingItem {
  path: string;
  description?: string;
}

// Local development types (system file only)
export interface LocalDevMonorepo {
  package_manager?: string;
  package_manager_version?: string;
  node_version?: string;
  install_command?: string;
  workspace_pattern?: string;
}

export interface LocalDevApp {
  name?: string;
  port?: number;
  dev_command?: string;
  url_local?: string;
  requires_db?: boolean;
}

export interface LocalDevExternalService {
  name?: string;
  port?: number;
  purpose?: string;
  managed_by?: string;
}

export interface LocalDevEnvironment {
  root_env?: string;
  per_app_env?: string[];
  required_vars?: string[];
}

export interface LocalDevLogLocations {
  dev_server?: string;
  build_output?: string;
  test_output?: string;
}

export interface LocalDevQuirk {
  id?: string;
  title?: string;
  description?: string;
  workaround?: string;
  affected_command?: string;
  fixed_in?: string;
}

export interface LocalDevelopment {
  monorepo?: LocalDevMonorepo;
  apps?: LocalDevApp[];
  external_services?: LocalDevExternalService[];
  environment?: LocalDevEnvironment;
  log_locations?: LocalDevLogLocations;
  known_quirks?: LocalDevQuirk[];
}

// Service file types
export interface DevConfig {
  command?: string;
  url?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface ProdConfig {
  url?: string;
  region?: string;
  deployment_ref?: string;
  [key: string]: unknown;
}

export interface TestingConfig {
  framework?: string;
  command?: string;
  coverage_target?: string;
  [key: string]: unknown;
}

export interface SecurityConfig {
  auth_method?: string;
  secrets_ref?: string;
  [key: string]: unknown;
}

export interface DecisionAlternative {
  option: string;
  rejected_because: string;
}

export interface Decision {
  id: string;
  decision: string;
  rationale: string;
  date?: string;
  status?: "proposed" | "accepted" | "rejected" | "superseded";
  alternatives?: DecisionAlternative[];
  consequences?: string;
}

export interface Risk {
  id: string;
  title: string;
  description: string;
  severity?: "low" | "medium" | "high" | "critical";
  status?: "identified" | "mitigated" | "accepted" | "materialized";
  mitigation?: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status?: "planned" | "in-progress" | "shipped" | "cancelled";
  target_date?: string;
}

export interface FeatureStatus {
  status?: "planned" | "in-progress" | "built" | "deprecated";
}

export interface Module {
  name: string;
  purpose: string;
  paths?: string[];
}

export interface RbacRole {
  name: string;
  level: string;
  helper?: string;
}

export interface RbacHelper {
  name: string;
  purpose: string;
}

export interface RbacConfig {
  description?: string;
  roles?: RbacRole[];
  helpers?: RbacHelper[];
}

export interface PatternDetail {
  key: string;
  value: string;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  implementation?: string;
  details?: PatternDetail[];
}

export interface TestingDetails {
  framework?: string;
  e2e_path?: string;
  command?: string;
  auth_testing?: string;
  [key: string]: unknown;
}

export interface ServiceUsm extends UsmCommon {
  $type: "service";
  $system: string;
  name?: string;
  status?: "planned" | "in-progress" | "built" | "deprecated";
  type: "web-app" | "api" | "worker" | "idp" | "llm-gateway" | "agent-flows" | "database" | "cache" | "queue";
  runtime: string;
  port?: number;
  paths?: string[];
  depends_on?: string[];
  dev?: DevConfig;
  prod?: ProdConfig;
  testing?: TestingConfig;
  security?: SecurityConfig;
  risks?: string[];
  future?: string[];
  decisions?: Decision[];
  modules?: Module[];
  project_structure?: string;
  rbac?: RbacConfig;
  tech_stack?: Record<string, string>;
  conventions?: string[];
  testing_details?: TestingDetails;
  patterns?: Pattern[];
  runtime_details?: string;
  infrastructure?: ServiceInfrastructure;
}

export interface InfrastructureCompute {
  type?: "fargate" | "ec2" | "lambda" | "cloud-run" | "cloud-function" | "other";
  mode?: "on-demand" | "spot" | "mixed";
  cpu?: number;
  memory_mb?: number;
  desired_count?: number;
}

export interface InfrastructureNetworking {
  alb_listener_rule?: string;
  hostnames?: string[];
  port?: number;
  protocol?: "http" | "https" | "grpc";
  tls_termination?: "alb" | "cloudflare" | "service" | "none";
}

export interface InfrastructureData {
  engine?: string;
  instance_class?: string;
  multi_az?: boolean;
  backup_retention_days?: number;
}

export interface InfrastructureScaling {
  min?: number;
  max?: number;
  target_cpu_percent?: number;
}

export interface InfrastructureSecret {
  name?: string;
  source?: "ssm" | "secrets-manager" | "env" | "vault";
  purpose?: string;
}

export interface InfrastructureMonitoring {
  logs?: "cloudwatch" | "loki" | "datadog" | "none";
  metrics?: "cloudwatch" | "prometheus" | "datadog" | "none";
  alarms?: string[];
}

export interface InfrastructureCost {
  monthly_estimate_usd?: number;
  optimization_notes?: string;
}

export interface InfrastructureDisasterRecovery {
  backup_strategy?: string;
  rto_minutes?: number;
  rpo_minutes?: number;
}

export interface InfrastructureSelfHosting {
  supported?: boolean;
  requirements?: string[];
  guide_ref?: string;
}

export interface ServiceInfrastructure {
  provider?: "aws" | "gcp" | "azure" | "other";
  region?: string;
  compute?: InfrastructureCompute;
  networking?: InfrastructureNetworking;
  data?: InfrastructureData;
  scaling?: InfrastructureScaling;
  secrets?: InfrastructureSecret[];
  monitoring?: InfrastructureMonitoring;
  cost?: InfrastructureCost;
  disaster_recovery?: InfrastructureDisasterRecovery;
  self_hosting?: InfrastructureSelfHosting;
}

// Feature file types
export interface FlowStep {
  id: string;
  action: string; // Free-form verb: navigate, click, fill, observe, submit, get, post, etc.
  target?: string;
  expect?: Record<string, unknown>[];
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
}

export interface Element {
  id: string;
  type?: string;
  target?: string;
  label?: string;
  visible_when?: string;
  [key: string]: unknown;
}

export interface VisibilityRule {
  [key: string]: unknown;
}

export interface Interface {
  page?: string;
  elements?: Element[];
  visibility?: VisibilityRule[];
  [key: string]: unknown;
}

export interface Contract {
  id: string;
  description: string;
  applies_after?: string[];
  must_have?: (string | Record<string, unknown>)[];
}

export interface FlowRef {
  ref: string;
  steps_until?: string;
}

export interface TestSetup {
  [key: string]: unknown;
}

export interface TestExpectation {
  [key: string]: unknown;
}

export interface FeatureTest {
  id: string;
  flow?: string | FlowRef;
  setup?: TestSetup;
  expect: TestExpectation[];
  contracts?: string[];
}

export interface Implementation {
  primary?: string;
  ui?: string;
  test_code?: string;
  test_code_generated_from?: string;
  test_code_status?: "none" | "generated" | "manual" | "mixed";
  test_code_last_generated?: string;
  [key: string]: unknown;
}

export interface FeatureRoute {
  path: string;
  type: "page" | "api";
  http_methods?: string[];
  file_path?: string;
  app?: string;
  auth_required?: boolean;
}

export interface FeatureUsm extends UsmCommon {
  $type: "feature";
  $system: string;
  $service: string;
  status?: "planned" | "in-progress" | "built" | "deprecated";
  intent: string;
  decisions?: Decision[];
  flows?: Flow[];
  interfaces?: Interface[];
  contracts?: Contract[];
  tests?: FeatureTest[];
  implementation?: Implementation;
  see_also?: string[];
  routes?: FeatureRoute[];
  apps?: string[];
  source?: string;
}

// Union type
export interface DataUsm {
  $schema?: string;
  $id: string;
  $type: "data";
  $version: number;
  $last_updated?: string;
  $system: string;
  summary: string;
  type?: string;        // e.g., "postgres", "mysql"
  runtime?: string;     // e.g., "prisma", "drizzle"
  port?: number;
  paths?: string[];
  schema_source?: string;
  models?: string[];
  modules?: Array<{ name: string; purpose: string; paths?: string[] }>;
  dev?: { command?: string; url?: string; env?: Record<string, string> };
}

export type UsmFile = SystemUsm | ServiceUsm | FeatureUsm | DataUsm;

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

// Generation result
export interface GenerationResult {
  outputs: Array<{
    path: string;
    content: string;
  }>;
}
