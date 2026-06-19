// Public API exports for the scan module

export { initConfig, writeConfig } from "./init.js";
export { scanStructural } from "./structural.js";
export { extractRoutes, groupRoutesIntoFeatures } from "./routes.js";
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
