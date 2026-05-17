/**
 * @specforge/scope-gate - Scope Gate module for SpecForge V6
 * 
 * This module enforces P0/P1/P2 scope boundaries as defined in REQ-25
 * of the parent V6 architecture specification.
 */

// Export all types
export type {
  ScopeTag,
  CapabilityDefinition,
  ScopeContext,
  AvailabilityResult,
  ScopeError,
  ValidationResult,
  ScopeViolationAttempt,
  FeatureFlagChange,
  ScopeConfiguration,
  EnvironmentDefaults,
  SourceLocation,
  ScopeValidationCode,
  AgentIdentity,
  ScopeEvent,
  ScopeEventQuery,
  CheckResult
} from './types';

// Export error classes (including ScopeError base class)
export { 
  ScopeBoundaryViolationError,
  CapabilityUnavailableError,
  DependencyError,
  ConfigurationError
} from './types';

// Export REQ-25 Parser and Loader
export { Req25Parser } from './req25-parser';
export type { Req25Data } from './req25-parser';
export { Req25Loader, createReq25Loader, loadAndRegisterCapabilities, loadAndRegisterCapabilitiesSync } from './req25-loader';
export type { 
  LoadResult, 
  ChangeDetectionResult, 
  DetailedChangeDetection,
  CapabilityChangeInfo,
  ChangeCallback,
  WatcherOptions,
  ActiveChangeDetector,
  ArtifactValidationResult
} from './req25-loader';

// Export implementations
export { ScopeRegistry } from './scope-registry';
export { RuntimeScopeChecker } from './runtime-checker';
export { ScopeValidator } from './scope-validator';
export { AuditLogger } from './audit-logger';
export { OptimizedAuditLogger, createOptimizedAuditLogger } from './audit-logger-optimized';
export type { OptimizedAuditLoggerConfig } from './audit-logger-optimized';
export { ScopeTagValidator } from './scope-tag-validator';
export type { 
  SpecConfig, 
  SpecValidationResult, 
  ScopeTagValidationReport,
  // Violation detection types (Task 9.3)
  ViolationType,
  ViolationSeverity,
  Violation,
  ViolationReport
} from './scope-tag-validator';

// Export configuration loader
export { ScopeConfigurationLoader, createDefaultConfigLoader, loadConfigFromFile, createConfigLoader } from './scope-configuration';

// Export Cache Module
export { LRUCache, scopeAvailabilityCacheKey, featureFlagCacheKey, capabilityCacheKey } from './cache';
export type { CacheOptions, CacheStats } from './cache';

// Export Feature Flag Manager
export { FeatureFlagManager, createFeatureFlagManager } from './feature-flag-manager';
export type { FeatureFlag, FeatureFlagChangeLog, FeatureFlagManagerOptions } from './feature-flag-manager';

// Export PBT Generators
export {
  generators,
  createCapabilityArb,
  createContextArb,
  createV60ContextArb,
  createCapabilityIdArb,
  createScopeTagArb,
  createEdgeCaseStringArb,
  createEdgeCaseCapabilityArb,
  createEdgeCaseContextArb,
  createInvalidCapabilityIdArb,
  createInvalidScopeTagArb,
  createInvalidReleaseBranchArb,
  createInvalidEnvironmentArb,
  createInvalidFeatureFlagArb,
  createMixedCapabilityIdArb,
  createMixedScopeTagArb,
  createMixedContextArb,
  createMixedCapabilityArb,
  createFeatureFlagChangeArb,
  createViolationAttemptArb,
  createCyclicDependencyArb,
  createP0DependsOnP1P2Arb,
  createSelfDependencyArb,
  createCapabilityArrayArb,
  createV60ViolationScenarioArb,
  createEnabledScenarioArb,
  createDependencyScenarioArb,
  filterValid,
  mapValid,
  weightedMix
} from './generators';
export type {
  CapabilityArb,
  ContextArb,
  ScopeTagArb,
  CapabilityIdArb,
  FeatureFlagChangeArb,
  ViolationAttemptArb
} from './generators';