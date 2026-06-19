// TypeScript types for usmconfig and scan-result schemas

// ─── usmconfig-v1 types ──────────────────────────────────────────────────────

export interface UsmConfigSources {
  root?: string;
  include?: string[];
  exclude?: string[];
  package_manifests?: string[];
  code_globs?: string[];
}

export type SharedPackageKind =
  | "ui-kit"
  | "orm"
  | "auth-lib"
  | "llm-wrapper"
  | "shared-util"
  | "config"
  | "types"
  | "other";

export interface UsmConfigSharedPackage {
  id: string;
  match: string;
  kind: SharedPackageKind;
  summary?: string;
}

export type ServiceRuleKind =
  | "web-app"
  | "api-server"
  | "worker"
  | "mobile-app"
  | "desktop-app"
  | "database"
  | "cache"
  | "queue"
  | "other";

export interface UsmConfigServiceRule {
  match: string;
  kind: ServiceRuleKind;
  port_from?: string;
  framework_detect?: string[];
  summary?: string;
}

export type ApiRuleKind = "rest" | "graphql" | "grpc" | "nextjs-route" | "other";

export interface UsmConfigApiExtract {
  routes?: boolean;
  request_types?: boolean;
  response_types?: boolean;
  auth_required?: boolean;
}

export interface UsmConfigApiRule {
  match: string;
  kind: ApiRuleKind;
  extract?: UsmConfigApiExtract;
}

export type DataRuleKind = "prisma" | "drizzle" | "typeorm" | "sql" | "other";

export interface UsmConfigDataExtract {
  models?: boolean;
  relations?: boolean;
  enums?: boolean;
}

export interface UsmConfigDataRule {
  match: string;
  kind: DataRuleKind;
  extract?: UsmConfigDataExtract;
}

export type FeatureGroupBy = "directory" | "file" | "tag";

export interface UsmConfigFeatures {
  detect_from?: string[];
  group_by?: FeatureGroupBy;
  exclude_patterns?: string[];
}

export interface UsmConfigOutputs {
  usm_source?: string;
  design_docs?: string;
  help_docs?: string;
  api_docs?: string;
  agent_context?: string;
  tests?: string;
  diagrams?: string;
}

export type MergeStrategy = "smart" | "overwrite" | "skip" | "fail";

export interface UsmConfigGeneration {
  merge_with_existing?: MergeStrategy;
  preserve_comments?: boolean;
  format?: "github-flavored-markdown" | "commonmark";
}

export type LlmProvider = "anthropic" | "openai" | "google";

export interface UsmConfigLlm {
  provider?: LlmProvider;
  model?: string;
  api_key_env?: string;
}

export interface UsmConfig {
  $schema: string;
  version: "1";
  name: string;
  sources?: UsmConfigSources;
  shared?: UsmConfigSharedPackage[];
  services?: UsmConfigServiceRule[];
  apis?: UsmConfigApiRule[];
  data?: UsmConfigDataRule[];
  features?: UsmConfigFeatures;
  outputs?: UsmConfigOutputs;
  generation?: UsmConfigGeneration;
  llm?: UsmConfigLlm;
  enrichment?: EnrichmentConfigSection;
}

// ─── enrichment config types ─────────────────────────────────────────────────

export type EnrichmentProvider = "litellm" | "openai" | "anthropic" | "ollama";

export type EnrichmentField = "summary" | "intent" | "decisions" | "flows" | "contracts" | "tests";

export interface EnrichmentConfigSection {
  enabled?: boolean;
  provider?: EnrichmentProvider;
  url?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  max_tokens_per_file?: number;
  fields?: EnrichmentField[];
  preserve_human_edits?: boolean;
  max_source_file_chars?: number;
}

// ─── scan-result-v1 types ───────────────────────────────────────────────────

export type UsmFileType = "service" | "feature" | "api" | "data" | "system" | "policy" | "operations";

export interface ScanResultFileWritten {
  path: string;
  type: UsmFileType;
  source?: string;
}

export interface ScanResultFileSkipped {
  path: string;
  reason: string;
}

export interface ScanResultStats {
  duration_ms?: number;
  services_found?: number;
  packages_found?: number;
  data_models_found?: number;
  features_found?: number;
}

export interface ScanResult {
  files_written: ScanResultFileWritten[];
  files_skipped: ScanResultFileSkipped[];
  warnings?: string[];
  stats?: ScanResultStats;
}

// ─── Internal types for scan tools ──────────────────────────────────────────

export interface DetectedWorkspace {
  relativePath: string;
  absolutePath: string;
  packageJson: PackageJsonInfo | null;
  isService: boolean;
  kind: ServiceRuleKind | SharedPackageKind;
  name: string;
}

export interface PackageJsonInfo {
  name: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  types?: string;
  exports?: Record<string, string>;
}

export interface DetectedPrismaSchema {
  path: string;
  models: string[];
}

export interface DetectedDockerService {
  name: string;
  image?: string;
  ports?: string[];
  depends_on?: string[];
}

export interface InitOptions {
  root: string;
}

export interface ScanOptions {
  root: string;
  configPath: string;
  force: boolean;
  /** Only extract routes, skip service/package/data detection */
  routesOnly: boolean;
  /** Merge strategy: "smart" preserves human edits, "skip" skips existing, "overwrite" replaces all */
  mergeStrategy: MergeStrategy;
}

// ─── Route detection types ──────────────────────────────────────────────────

export type RouteType = "page" | "api";

export interface RouteFinding {
  /** URL path (e.g. /settings/memory, /api/projects) */
  path: string;
  /** Route type: page or api */
  type: RouteType;
  /** HTTP methods exported (only for API routes) */
  http_methods: string[];
  /** Absolute file path */
  file_path: string;
  /** App name (e.g. "the-architect", "tenant") */
  app: string;
  /** First directory segment under app/ (the area) */
  area: string;
  /** Human-readable name derived from the path */
  name: string;
  /** Request type references (zod schemas or TypeScript types) */
  request_types?: string[];
  /** Response type references */
  response_types?: string[];
  /** Whether the route is in a protected layout */
  auth_required?: boolean;
}

// ─── Feature detection types ────────────────────────────────────────────────

export interface FeatureFinding {
  /** Area name (first directory segment, e.g. "settings", "projects") */
  area: string;
  /** Feature name (kebab-case, e.g. "memory", "projects") */
  name: string;
  /** Human-readable title (e.g. "Memory", "Projects") */
  title: string;
  /** Associated app(s) */
  apps: string[];
  /** Routes grouped under this feature */
  routes: RouteFinding[];
  /** Output file path relative to .usm root (e.g. "features/settings/memory.usm") */
  outputPath: string;
}

// ─── Smart merge types ──────────────────────────────────────────────────────

/** Fields that should be preserved from human edits */
export const PRESERVE_FIELDS: readonly string[] = [
  // Fields humans primarily edit — preserved on re-scan.
  "summary", "intent", "decisions", "flows", "interfaces",
  "contracts", "tests", "see_also", "modules", "implementation",
  // $id and $service are identifiers — humans may choose custom values
  // (e.g. hand-written login.usm has $service: smith-gray/the-architect
  // because architect is the primary consumer, even though the scan finds
  // /login in every app).
  "$id", "$service",
];

/**
 * Fields that should be updated from scan (mechanical / auto-derived).
 * These are derived from code and routes, NOT from human design intent.
 * They are overwritten on re-scan so the .usm file reflects current code.
 */
export const UPDATE_FIELDS: readonly string[] = [
  "$last_updated", "paths", "port", "depends_on", "type", "runtime",
];

/** Fields that should be merged additively */
export const MERGE_FIELDS: readonly string[] = [
  "dev", "prod",
];

export interface SmartMergeResult {
  merged: Record<string, unknown>;
  warnings: string[];
  /** Keys that were preserved from human edits */
  preservedKeys: string[];
  /** Keys that were updated from scan */
  updatedKeys: string[];
  /** Keys that were merged additively */
  mergedKeys: string[];
}
