// Public API exports for the scan module

export { initConfig, writeConfig } from "./init.js";
export {
  promptFeedbackPolicy,
  applyFeedbackToSystem,
  resolveFeedbackPolicy,
  resolveFeedbackDir,
  FEEDBACK_POLICIES,
  DEFAULT_FEEDBACK_POLICY,
} from "./feedback.js";
export {
  detectUpgrade,
  applyUpgrade,
  getInstalledVersion,
  getProjectVersion,
  compareVersions,
  type UpgradeReport,
  type UpgradeApplyResult,
} from "./upgrade.js";
export { CAPABILITIES, registerCapability, type Capability, type CapabilitySetupResult } from "./capabilities.js";
export { scanStructural } from "./structural.js";
export { detectServices, extractRoutes } from "./multi-lang.js";
export type { DetectedService, DetectedRoute } from "./multi-lang.js";
export { extractRoutes as extractNextJsRoutes, groupRoutesIntoFeatures } from "./routes.js";
export { smartMerge } from "./merge.js";
export { scanInfrastructure } from "./infrastructure.js";
export type { InfrastructureScanOptions, InfrastructureScanResult, ServiceInfraResult } from "./infrastructure.js";
export {
  readPackageJson,
  detectServiceKind,
  detectRuntime,
  detectPort,
  parsePrismaModels,
  parseDockerCompose,
  extractSmithGrayDependencies,
  yamlStringify,
  todayDate,
  shortNameFromPath,
  shortNameFromPackageJson,
} from "./utils.js";

export type {
  UsmConfig,
  UsmConfigSources,
  UsmConfigSharedPackage,
  UsmConfigServiceRule,
  UsmConfigApiRule,
  UsmConfigDataRule,
  UsmConfigFeatures,
  UsmConfigOutputs,
  UsmConfigGeneration,
  UsmConfigLlm,
  ScanResult,
  ScanResultFileWritten,
  ScanResultFileSkipped,
  ScanResultStats,
  ScanOptions,
  InitOptions,
  PackageJsonInfo,
  DetectedWorkspace,
  DetectedPrismaSchema,
  DetectedDockerService,
  ServiceRuleKind,
  SharedPackageKind,
  ApiRuleKind,
  DataRuleKind,
  UsmFileType,
  MergeStrategy,
  LlmProvider,
  FeatureGroupBy,
  RouteType,
  RouteFinding,
  FeatureFinding,
  SmartMergeResult,
} from "./types.js";

export {
  PRESERVE_FIELDS,
  UPDATE_FIELDS,
  MERGE_FIELDS,
} from "./types.js";
