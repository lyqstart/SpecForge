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
    entryPoints: string[];
    dependencies: string[];
    description: string;
}
export interface ScopeContext {
    releaseBranch: "v6.0" | "v6.1" | "v6.x" | "development";
    featureFlags: Set<string>;
    environment: "production" | "staging" | "development" | "test";
}
export interface AvailabilityResult {
    available: boolean;
    reason?: string | undefined;
    requiredFlag?: string | undefined;
}
export declare class ScopeError extends Error {
    code: "SCOPE_BOUNDARY_VIOLATION" | "FEATURE_FLAG_REQUIRED" | "CAPABILITY_UNAVAILABLE";
    capabilityId: string;
    requiredFlag?: string | undefined;
    scopeTag: ScopeTag;
    constructor(code: "SCOPE_BOUNDARY_VIOLATION" | "FEATURE_FLAG_REQUIRED" | "CAPABILITY_UNAVAILABLE", message: string, capabilityId: string, scopeTag: ScopeTag, requiredFlag?: string | undefined);
}
/**
 * Error thrown when a scope boundary is violated (P1/P2 used in V6.0)
 */
export declare class ScopeBoundaryViolationError extends ScopeError {
    constructor(capabilityId: string, scopeTag: ScopeTag, requiredFlag?: string | undefined);
}
/**
 * Error thrown when a required feature flag is not enabled
 */
export declare class CapabilityUnavailableError extends ScopeError {
    constructor(capabilityId: string, scopeTag: ScopeTag, requiredFlag?: string | undefined);
}
/**
 * Error thrown when a dependency constraint is violated
 */
export declare class DependencyError extends ScopeError {
    dependencyId: string;
    constructor(capabilityId: string, dependencyId: string, scopeTag: ScopeTag);
}
/**
 * Error thrown when scope configuration is invalid or missing
 */
export declare class ConfigurationError extends ScopeError {
    configKey?: string;
    constructor(message: string, capabilityId: string, configKey?: string | undefined);
}
export interface ValidationResult {
    type: "error" | "warning" | "info";
    code: ScopeValidationCode;
    message: string;
    location?: SourceLocation | undefined;
    context?: Record<string, unknown> | undefined;
}
export type ScopeValidationCode = "p0_depends_on_p1" | "p0_depends_on_p2" | "missing_scope_tag" | "incorrect_scope_tag" | "missing_feature_flag_guard" | "unregistered_capability" | "scope_tag_mismatch";
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
    enforcementMode: "strict" | "warning" | "disabled";
    defaultContext: {
        releaseBranch: "v6.0" | "v6.1" | "v6.x" | "development";
        environment: "production" | "staging" | "development" | "test";
    };
    environmentDefaults: {
        production: EnvironmentDefaults;
        staging: EnvironmentDefaults;
        development: EnvironmentDefaults;
        test: EnvironmentDefaults;
    };
    featureFlags: Record<string, {
        description: string;
        default: boolean;
        capabilities: string[];
        environments: string[];
    }>;
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
export interface Req25Data {
    p0: CapabilityDefinition[];
    p1: CapabilityDefinition[];
    p2: CapabilityDefinition[];
    lastUpdated: Date;
    sourceHash: string;
}
//# sourceMappingURL=types.d.ts.map