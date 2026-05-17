/**
 * Type definitions for Scope Gate module
 * 
 * This file contains all TypeScript interfaces and types
 * for the Scope Gate module as defined in the design document.
 */

export type ScopeTag = "p0" | "p1" | "p2";

export interface CapabilityDefinition {
  id: string;
  displayName: string;
  scopeTag: ScopeTag;
  entryPoints: string[];  // Function/method names that trigger this capability
  dependencies: string[]; // IDs of other capabilities this depends on
  description: string;
}

export interface ScopeContext {
  releaseBranch: "v6.0" | "v6.1" | "v6.x" | "development";
  featureFlags: Set<string>;  // Enabled feature flags
  environment: "production" | "staging" | "development" | "test";
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string | undefined;
  requiredFlag?: string | undefined;  // Feature flag needed to enable
}

export class ScopeError extends Error {
  code: "SCOPE_BOUNDARY_VIOLATION" | "FEATURE_FLAG_REQUIRED" | "CAPABILITY_UNAVAILABLE";
  capabilityId: string;
  requiredFlag?: string | undefined;
  scopeTag: ScopeTag;
  
  constructor(
    code: "SCOPE_BOUNDARY_VIOLATION" | "FEATURE_FLAG_REQUIRED" | "CAPABILITY_UNAVAILABLE",
    message: string,
    capabilityId: string,
    scopeTag: ScopeTag,
    requiredFlag?: string | undefined
  ) {
    super(message);
    this.code = code;
    this.capabilityId = capabilityId;
    this.scopeTag = scopeTag;
    this.requiredFlag = requiredFlag;
    this.name = "ScopeError";
  }
}

/**
 * Error thrown when a scope boundary is violated (P1/P2 used in V6.0)
 */
export class ScopeBoundaryViolationError extends ScopeError {
  constructor(
    capabilityId: string,
    scopeTag: ScopeTag,
    requiredFlag?: string | undefined
  ) {
    const scopeLabel = scopeTag === "p1" ? "P1" : "P2";
    super(
      "SCOPE_BOUNDARY_VIOLATION",
      `${scopeLabel} capability '${capabilityId}' is not available in V6.0 release branch. ${requiredFlag ? `Enable feature flag '${requiredFlag}' to use this capability.` : ""}`,
      capabilityId,
      scopeTag,
      requiredFlag
    );
    this.name = "ScopeBoundaryViolationError";
  }
}

/**
 * Error thrown when a required feature flag is not enabled
 */
export class CapabilityUnavailableError extends ScopeError {
  constructor(
    capabilityId: string,
    scopeTag: ScopeTag,
    requiredFlag?: string | undefined
  ) {
    super(
      "CAPABILITY_UNAVAILABLE",
      `Capability '${capabilityId}' is currently unavailable. ${requiredFlag ? `Enable feature flag '${requiredFlag}' to use this capability.` : "Contact your administrator for access."}`,
      capabilityId,
      scopeTag,
      requiredFlag
    );
    this.name = "CapabilityUnavailableError";
  }
}

/**
 * Error thrown when a dependency constraint is violated
 */
export class DependencyError extends ScopeError {
  dependencyId: string;
  
  constructor(
    capabilityId: string,
    dependencyId: string,
    scopeTag: ScopeTag
  ) {
    super(
      "SCOPE_BOUNDARY_VIOLATION",
      `Capability '${capabilityId}' cannot be used because it depends on '${dependencyId}' which is ${scopeTag.toUpperCase()}`,
      capabilityId,
      scopeTag
    );
    this.name = "DependencyError";
    this.dependencyId = dependencyId;
  }
}

/**
 * Error thrown when scope configuration is invalid or missing
 */
export class ConfigurationError extends ScopeError {
  configKey?: string;
  
  constructor(
    message: string,
    capabilityId: string,
    configKey?: string | undefined
  ) {
    super(
      "CAPABILITY_UNAVAILABLE",
      message,
      capabilityId,
      "p0" // Default to p0 for config errors
    );
    this.name = "ConfigurationError";
    if (configKey) {
      this.configKey = configKey;
    }
  }
}

export interface ValidationResult {
  type: "error" | "warning" | "info";
  code: ScopeValidationCode;
  message: string;
  location?: SourceLocation | undefined;
  context?: Record<string, unknown> | undefined;
}

export type ScopeValidationCode = 
  | "p0_depends_on_p1"
  | "p0_depends_on_p2"
  | "missing_scope_tag"
  | "incorrect_scope_tag"
  | "missing_feature_flag_guard"
  | "unregistered_capability"
  | "scope_tag_mismatch";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface ScopeViolationAttempt {
  capabilityId: string;
  scopeTag: ScopeTag;
  context: ScopeContext;
  stackTrace?: string | undefined;
  userId?: string | undefined;
  sessionId?: string | undefined;
  timestamp: Date;
}

export interface FeatureFlagChange {
  flag: string;
  oldValue: boolean;
  newValue: boolean;
  reason: string;
  userId?: string | undefined;
  timestamp: Date;
}

export interface ScopeConfiguration {
  schema_version: "1.0";
  
  // Enforcement mode
  enforcementMode: "strict" | "warning" | "disabled";
  
  // Default scope context
  defaultContext: {
    releaseBranch: "v6.0" | "v6.1" | "v6.x" | "development";
    environment: "production" | "staging" | "development" | "test";
  };
  
  // Environment-specific defaults
  environmentDefaults: {
    production: EnvironmentDefaults;
    staging: EnvironmentDefaults;
    development: EnvironmentDefaults;
    test: EnvironmentDefaults;
  };
  
  // Feature flag mappings
  featureFlags: Record<string, {
    description: string;
    default: boolean;
    capabilities: string[];  // Capability IDs this flag enables
    environments: string[];  // Where this flag can be set
  }>;
  
  // Overrides (for testing/development)
  overrides: Array<{
    capabilityId: string;
    available: boolean;
    reason: string;
    expiresAt?: Date | undefined;
  }>;
}

/**
 * Environment-specific default configuration
 */
export interface EnvironmentDefaults {
  /** Enforcement mode for this environment */
  enforcementMode: "strict" | "warning" | "disabled";
  /** Whether P1 capabilities are allowed in this environment */
  allowP1: boolean;
  /** Whether P2 capabilities are allowed in this environment */
  allowP2: boolean;
  /** Default feature flags for this environment */
  defaultFeatureFlags: Record<string, boolean>;
}

export interface AgentIdentity {
  id: string;
  name: string;
  type: "user" | "system" | "agent";
}

export interface ScopeEvent {
  eventId: string;
  type: "scope_violation" | "feature_flag_change" | "scope_validation";
  payload: unknown;
  timestamp: Date;
  actor?: AgentIdentity | undefined;
}

export interface ScopeEventQuery {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  eventType?: "scope_violation" | "feature_flag_change" | "scope_validation" | undefined;
  capabilityId?: string | undefined;
  actorId?: string | undefined;
}

// Interface definitions for main components
export interface ScopeRegistry {
  loadFromParentSpec(parentSpecPath: string): Promise<void>;
  registerCapability(capability: CapabilityDefinition): void;
  isAvailable(capabilityId: string, context: ScopeContext): AvailabilityResult;
  getCapabilitiesByScope(scopeTag: ScopeTag): CapabilityDefinition[];
  validateDependencies(): ValidationResult[];
}

export interface RuntimeScopeChecker {
  guardCapability(capabilityId: string): MethodDecorator;
  checkCapability(capabilityId: string, context: ScopeContext): void;
  checkCapabilities(capabilityIds: string[], context: ScopeContext): CheckResult[];
  getCurrentContext(): ScopeContext;
}

export interface CheckResult {
  capabilityId: string;
  available: boolean;
  error?: ScopeError | undefined;
}

export interface ScopeValidator {
  validateCodeDependencies(codebasePath: string): ValidationResult[];
  validateSpecScopeTags(specsPath: string): ValidationResult[];
  validateFeatureFlagGuards(codebasePath: string): ValidationResult[];
}

export interface AuditLogger {
  logViolationAttempt(violation: ScopeViolationAttempt): Promise<void>;
  logFeatureFlagChange(change: FeatureFlagChange): Promise<void>;
  logValidationResults(results: ValidationResult[]): Promise<void>;
  queryScopeEvents(query: ScopeEventQuery): Promise<ScopeEvent[]>;
}

// Re-export Req25Data interface (defined in req25-parser.ts)
export interface Req25Data {
  p0: CapabilityDefinition[];
  p1: CapabilityDefinition[];
  p2: CapabilityDefinition[];
  lastUpdated: Date;
  sourceHash: string;
}