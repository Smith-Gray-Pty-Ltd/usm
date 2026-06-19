// @smith-gray/usm — Universal System Map SDK
// Parse, validate, and generate from .usm spec files.

export { parseUsm, parseUsmFile, isSystemFile, isServiceFile, isFeatureFile, findUsmFiles, findAllUsmFiles, findAllUsmDirs } from "./parse.js";
export { validateUsm, validateUsmString, validateUsmFile } from "./validate.js";
export { generate, type Generator } from "./generate.js";
export {
  generateMarkdown,
  generateAreaOverviews,
  generateSurfaceTables,
  generateSharedServicesIndex,
  generatePackagesIndex,
  generateRisksDoc,
  generateRoadmapDoc,
  generateDataModelDoc,
  generateDataIndex,
  generatePerAppDecisions,
  generatePerAppApiReference,
  generatePerAppApiContracts,
  generatePerAppUiMap,
  generatePerAppTestSpecs,
} from "./generators/markdown.js";
export {
  generateAppAgentsMd,
  generateRootAgentsMd,
  generateAllAppAgentsMd,
} from "./generators/agentsMd.js";
export {
  generateOpenApiSpec,
  generateOpenApiTypes,
} from "./generators/openapi.js";
export {
  generateTestSpec,
  generateAllTestSpecs,
  generateAggregatedSpecs,
} from "./generators/testSpecs.js";
export {
  generateAllTogafDeliverables,
} from "./generators/togaf.js";
export {
  generateArchiMateModel,
} from "./generators/archimate.js";
export type {
  UsmCommon,
  UsmFile,
  SystemUsm,
  ServiceUsm,
  FeatureUsm,
  DataUsm,
  SystemIdentity,
  FeatureRef,
  ServiceRef,
  ApiRef,
  DataRef,
  Infrastructure,
  DeploymentEnvironment,
  Deployment,
  Operations,
  Policies,
  DevConfig,
  ProdConfig,
  TestingConfig,
  SecurityConfig,
  Decision,
  Risk,
  RoadmapItem,
  Module,
  FlowStep,
  Flow,
  Element,
  VisibilityRule,
  Interface,
  Contract,
  FlowRef,
  TestSetup,
  TestExpectation,
  FeatureTest,
  FeatureRoute,
  FeatureStatus,
  Implementation,
  ValidationResult,
  GenerationResult,
} from "./types.js";

// Scan & Init (code-to-.usm direction)
export { initConfig, writeConfig, scanStructural } from "./scan/index.js";
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
  EnrichmentProvider,
  EnrichmentField,
  EnrichmentConfigSection,
} from "./scan/types.js";

// Enrich (LLM-based semantic enrichment)
export { enrichFile, enrichDirectory } from "./enrich/index.js";
export { createLlmClient } from "./enrich/llm.js";
export { buildEnrichmentContext } from "./enrich/context.js";
export { SYSTEM_PROMPT, buildUserPrompt } from "./enrich/prompts.js";
export type {
  EnrichmentConfig,
  EnrichmentResult,
  EnrichmentContext,
  EnrichOptions,
} from "./enrich/types.js";
export type { LlmClient, LlmResponse } from "./enrich/llm.js";
