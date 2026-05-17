# API Documentation

This document provides comprehensive API reference for the `@specforge/scope-gate` module.

## Table of Contents

- [Types](#types)
- [Core Classes](#core-classes)
- [Utility Functions](#utility-functions)
- [Generators](#generators)

---

## Types

### ScopeTag

```typescript
type ScopeTag = "p0" | "p1" | "p2";
```

Scope tag classification for capabilities:
- **p0**: P0 capabilities - required for V6.0 release
- **p1**: P1 capabilities - can be enabled via feature flags
- **p2**: P2 capabilities - can be enabled via feature flags

---

### CapabilityDefinition

```typescript
interface CapabilityDefinition {
  id: string;
  displayName: string;
  scopeTag: ScopeTag;
  entryPoints: string[];
  dependencies: string[];
  description: string;
}
```

Definition of a capability with its scope classification.

**Properties:**
- `id` - Unique identifier (e.g., "bugfix-workflow")
- `displayName` - Human-readable name
- `scopeTag` - P0/P1/P2 classification
- `entryPoints` - Function/method names that trigger this capability
- `dependencies` - IDs of other capabilities this depends on
- `description` - Detailed description

---

### ScopeContext

```typescript
interface ScopeContext {
  releaseBranch: "v6.0" | "v6.1" | "v6.x" | "development";
  featureFlags: Set<string>;
  environment: "production" | "staging" | "development" | "test";
}
```

Context for scope boundary checking.

**Properties:**
- `releaseBranch` - Current release branch
- `featureFlags` - Set of enabled feature flags
- `environment` - Current environment

---

### AvailabilityResult

```typescript
interface AvailabilityResult {
  available: boolean;
  reason?: string;
  requiredFlag?: string;
}
```

Result of a capability availability check.

**Properties:**
- `available` - Whether the capability is available
- `reason` - Reason if unavailable
- `requiredFlag` - Feature flag needed to enable (if applicable)

---

### ScopeError

```typescript
class ScopeError extends Error {
  code: "SCOPE_BOUNDARY_VIOLATION" | "FEATURE_FLAG_REQUIRED" | "CAPABILITY_UNAVAILABLE";
  capabilityId: string;
  requiredFlag?: string;
  scopeTag: ScopeTag;

  constructor(
    code: ScopeErrorCode,
    message: string,
    capabilityId: string,
    scopeTag: ScopeTag,
    requiredFlag?: string
  );
}
```

Base error class for scope-related errors.

---

### ScopeBoundaryViolationError

```typescript
class ScopeBoundaryViolationError extends ScopeError {
  constructor(capabilityId: string, scopeTag: ScopeTag, requiredFlag?: string);
}
```

Error thrown when a scope boundary is violated (P1/P2 used in V6.0 without flag).

---

### CapabilityUnavailableError

```typescript
class CapabilityUnavailableError extends ScopeError {
  constructor(capabilityId: string, scopeTag: ScopeTag, requiredFlag?: string);
}
```

Error thrown when a required capability is not available.

---

### DependencyError

```typescript
class DependencyError extends ScopeError {
  dependencyId: string;
  constructor(capabilityId: string, dependencyId: string, scopeTag: ScopeTag);
}
```

Error thrown when a dependency constraint is violated.

---

### ConfigurationError

```typescript
class ConfigurationError extends ScopeError {
  configKey?: string;
  constructor(message: string, capabilityId: string, configKey?: string);
}
```

Error thrown when scope configuration is invalid or missing.

---

### ValidationResult

```typescript
interface ValidationResult {
  type: "error" | "warning" | "info";
  code: ScopeValidationCode;
  message: string;
  location?: SourceLocation;
  context?: Record<string, unknown>;
}
```

Result of scope validation.

---

### ScopeConfiguration

```typescript
interface ScopeConfiguration {
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
  featureFlags: Record<string, FeatureFlagConfig>;
  overrides: CapabilityOverride[];
}
```

Main configuration interface for scope gate.

---

## Core Classes

### ScopeRegistry

Maintains the authoritative mapping of capabilities to their scope tags (P0/P1/P2).

```typescript
class ScopeRegistry {
  constructor();
  
  /**
   * Load scope definitions from REQ-25 of parent spec
   */
  async loadFromParentSpec(parentSpecPath?: string): Promise<void>;
  
  /**
   * Synchronous version of loadFromParentSpec
   */
  loadFromParentSpecSync(parentSpecPath?: string): void;
  
  /**
   * Register a capability with its scope tag
   */
  registerCapability(capability: CapabilityDefinition): void;
  
  /**
   * Check if a capability is available in current scope
   */
  isAvailable(capabilityId: string, context: ScopeContext): AvailabilityResult;
  
  /**
   * Get all capabilities with a specific scope tag
   */
  getCapabilitiesByScope(scopeTag: ScopeTag): CapabilityDefinition[];
  
  /**
   * Validate scope dependencies (no P0 depending on P1/P2)
   */
  validateDependencies(): ValidationResult[];
  
  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): CapabilityDefinition[];
  
  /**
   * Check if a capability is registered
   */
  hasCapability(capabilityId: string): boolean;
  
  /**
   * Get capability by ID
   */
  getCapability(capabilityId: string): CapabilityDefinition | undefined;
}
```

**Usage:**

```typescript
import { ScopeRegistry } from '@specforge/scope-gate';

const registry = new ScopeRegistry();
await registry.loadFromParentSpec();

const context = {
  releaseBranch: 'v6.0',
  featureFlags: new Set(),
  environment: 'production'
};

const result = registry.isAvailable('bugfix-workflow', context);
console.log(result.available); // false for P1/P2 in V6.0
```

---

### RuntimeScopeChecker

Enforces scope boundaries at runtime with decorators and manual checks.

```typescript
class RuntimeScopeChecker {
  constructor(registry: ScopeRegistry, initialContext: ScopeContext);
  
  /**
   * Decorator/guard for P1/P2 capability entry points
   */
  guardCapability(capabilityId: string): MethodDecorator;
  
  /**
   * Manual check (for non-decorator contexts)
   * Throws ScopeError if capability is not available
   */
  checkCapability(capabilityId: string, context: ScopeContext): void;
  
  /**
   * Batch check multiple capabilities
   */
  checkCapabilities(capabilityIds: string[], context: ScopeContext): CheckResult[];
  
  /**
   * Check all registered capabilities
   */
  checkAll(context: ScopeContext): CheckResult[];
  
  /**
   * Get current scope context
   */
  getCurrentContext(): ScopeContext;
  
  /**
   * Update current scope context
   */
  updateContext(newContext: Partial<ScopeContext>): void;
  
  /**
   * Enable a feature flag in current context
   */
  enableFeatureFlag(flag: string): void;
  
  /**
   * Disable a feature flag in current context
   */
  disableFeatureFlag(flag: string): void;
  
  /**
   * Check if a feature flag is enabled
   */
  isFeatureFlagEnabled(flag: string): boolean;
}
```

**Usage:**

```typescript
import { ScopeRegistry, RuntimeScopeChecker } from '@specforge/scope-gate';

const registry = new ScopeRegistry();
await registry.loadFromParentSpec();

const checker = new RuntimeScopeChecker(registry, {
  releaseBranch: 'v6.0',
  featureFlags: new Set(),
  environment: 'production'
});

// Using the decorator
class MyService {
  @checker.guardCapability('bugfix-workflow')
  async runBugfix() {
    // This will throw if capability is not available
    return 'result';
  }
}

// Manual check
checker.checkCapability('bugfix-workflow', checker.getCurrentContext());
```

---

### Req25Parser

Parses REQ-25 section from parent specification markdown.

```typescript
class Req25Parser {
  /**
   * Parse REQ-25 from markdown
   */
  parseReq25(markdown: string): Req25Data;
}
```

---

### Req25Loader

Automatically loads REQ-25 from parent specification.

```typescript
class Req25Loader {
  constructor();
  
  /**
   * Load REQ-25 from parent specification
   */
  loadFromParentSpec(parentSpecPath: string, forceRefresh?: boolean): LoadResult;
  
  /**
   * Load using default parent spec path
   */
  load(forceRefresh?: boolean): LoadResult;
  
  /**
   * Get capabilities grouped by scope tag
   */
  getCapabilitiesByScope(parentSpecPath?: string): {
    p0: CapabilityDefinition[];
    p1: CapabilityDefinition[];
    p2: CapabilityDefinition[];
  };
  
  /**
   * Check if parent spec REQ-25 has changed
   */
  hasChanged(parentSpecPath: string): boolean;
  
  /**
   * Get cached data
   */
  getCachedData(): Req25Data | null;
  
  /**
   * Clear the cache
   */
  clearCache(): void;
  
  /**
   * Detect changes in REQ-25
   */
  detectChanges(parentSpecPath: string): ChangeDetectionResult;
  
  /**
   * Start file watching for passive change detection
   */
  startWatching(parentSpecPath: string, callback?: ChangeCallback): FSWatcher | null;
  
  /**
   * Stop all file watchers
   */
  stopWatching(): void;
}
```

---

### AuditLogger

Logs all scope-related decisions and violations.

```typescript
class AuditLogger {
  constructor(logDirectory?: string, actor?: AgentIdentity);
  
  /**
   * Log scope boundary violation attempt
   */
  logViolationAttempt(violation: ScopeViolationAttempt): Promise<void>;
  
  /**
   * Log feature flag enablement/disablement
   */
  logFeatureFlagChange(change: FeatureFlagChange): Promise<void>;
  
  /**
   * Log scope validation results
   */
  logValidationResults(results: ValidationResult[]): Promise<void>;
  
  /**
   * Query scope-related events
   */
  queryScopeEvents(query: ScopeEventQuery): Promise<ScopeEvent[]>;
  
  /**
   * Set the current actor
   */
  setActor(actor: AgentIdentity | undefined): void;
  
  /**
   * Get the current actor
   */
  getActor(): AgentIdentity | undefined;
  
  /**
   * Clear the log file
   */
  clearLogs(): Promise<void>;
  
  /**
   * Get log file statistics
   */
  getLogStats(): Promise<{
    fileSize: number;
    eventCount: number;
    lastEventTime?: Date;
    eventTypes: Record<string, number>;
  }>;
}
```

---

### ScopeTagValidator

Validates .config.kiro scope tags against REQ-25.

```typescript
class ScopeTagValidator {
  constructor(options?: {
    parentSpecPath?: string;
    specsPath?: string;
  });
  
  /**
   * Load REQ-25 capabilities from parent spec
   */
  loadCapabilities(): boolean;
  
  /**
   * Get capabilities grouped by scope
   */
  getCapabilitiesByScope(): { p0: CapabilityDefinition[]; p1: CapabilityDefinition[]; p2: CapabilityDefinition[] };
  
  /**
   * Validate a single spec's .config.kiro file
   */
  validateSpec(specPath: string): SpecValidationResult;
  
  /**
   * Validate all specs in the specs directory
   */
  validateAllSpecs(specsPath?: string): ScopeTagValidationReport;
  
  /**
   * Generate capability alignment report
   */
  generateCapabilityAlignmentReport(specsPath?: string): CapabilityAlignmentReport;
}
```

---

### ScopeValidator

Performs static validation of scope boundaries across the codebase.

```typescript
class ScopeValidator {
  constructor();
  
  /**
   * Set capabilities from registry for validation
   */
  setCapabilities(capabilities: CapabilityDefinition[]): void;
  
  /**
   * Static analysis: check for P0 code depending on P1/P2
   */
  validateCodeDependencies(codebasePath: string): ValidationResult[];
  
  /**
   * Validate spec .config.kiro files have correct scopeTag
   */
  validateSpecScopeTags(specsPath: string): ValidationResult[];
  
  /**
   * Check that runtime feature flags are properly guarded
   */
  validateFeatureFlagGuards(codebasePath: string): ValidationResult[];
  
  /**
   * Generate a comprehensive validation report
   */
  generateValidationReport(codebasePath: string, specsPath: string): ValidationReport;
}
```

---

### FeatureFlagManager

Manages hierarchical feature flags with priority-based evaluation.

```typescript
class FeatureFlagManager {
  constructor(options?: FeatureFlagManagerOptions);
  
  /**
   * Enable a feature flag
   */
  enable(flagName: string, reason?: string, userId?: string): boolean;
  
  /**
   * Disable a feature flag
   */
  disable(flagName: string, reason?: string, userId?: string): boolean;
  
  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flagName: string): boolean;
  
  /**
   * Check if a capability is enabled via its per-capability flag
   */
  isCapabilityEnabled(capabilityId: string): boolean;
  
  /**
   * Get all feature flags
   */
  getAll(): FeatureFlag[];
  
  /**
   * Get a specific feature flag
   */
  get(flagName: string): FeatureFlag | undefined;
  
  /**
   * Get all enabled flags
   */
  getEnabled(): FeatureFlag[];
  
  /**
   * Get change history
   */
  getHistory(): FeatureFlagChangeLog[];
  
  /**
   * Get change history for a specific flag
   */
  getHistoryForFlag(flagName: string): FeatureFlagChangeLog[];
  
  /**
   * Register a capability with its scope tag
   */
  registerCapability(capabilityId: string, scopeTag: ScopeTag): void;
  
  /**
   * Bulk enable capabilities by scope tag
   */
  enableByScope(scopeTag: ScopeTag, reason?: string, userId?: string): number;
  
  /**
   * Bulk disable capabilities by scope tag
   */
  disableByScope(scopeTag: ScopeTag, reason?: string, userId?: string): number;
  
  /**
   * Export current flags as object
   */
  export(): Record<string, boolean>;
  
  /**
   * Import flags from object
   */
  import(flags: Record<string, boolean>, reason?: string, userId?: string): void;
  
  /**
   * Get statistics about flags
   */
  getStats(): FlagStats;
  
  /**
   * Create a scope context with current feature flags
   */
  createScopeContext(overrides?: Partial<ScopeContext>): ScopeContext;
}
```

---

### ScopeConfigurationLoader

Loads and manages scope configuration from various sources.

```typescript
class ScopeConfigurationLoader {
  constructor(options?: ConfigLoaderOptions);
  
  /**
   * Load configuration from file and environment
   */
  async load(): Promise<ScopeConfiguration>;
  
  /**
   * Get environment-specific defaults
   */
  getEnvironmentDefaults(env: Environment): EnvironmentDefaults;
  
  /**
   * Check if P1 capabilities are allowed in current environment
   */
  isP1Allowed(): boolean;
  
  /**
   * Check if P2 capabilities are allowed in current environment
   */
  isP2Allowed(): boolean;
  
  /**
   * Check if a capability with given scope tag is allowed
   */
  isScopeTagAllowed(scopeTag: "p0" | "p1" | "p2"): boolean;
  
  /**
   * Get effective enforcement mode for current environment
   */
  getEffectiveEnforcementMode(): "strict" | "warning" | "disabled";
  
  /**
   * Get the current configuration
   */
  getConfig(): ScopeConfiguration;
  
  /**
   * Get the default scope context
   */
  getDefaultContext(): ScopeContext;
  
  /**
   * Validate configuration
   */
  validate(): string[];
  
  /**
   * Dispose of resources
   */
  dispose(): void;
}
```

---

## Utility Functions

### createFeatureFlagManager

```typescript
function createFeatureFlagManager(options?: FeatureFlagManagerOptions): FeatureFlagManager
```

Create a FeatureFlagManager with default settings.

---

### createDefaultConfigLoader

```typescript
function createDefaultConfigLoader(): ScopeConfigurationLoader
```

Create a configuration loader with default settings.

---

### loadConfigFromFile

```typescript
async function loadConfigFromFile(filePath: string): Promise<ScopeConfigurationLoader>
```

Create a configuration loader from file.

---

### createConfigLoader

```typescript
function createConfigLoader(options?: ConfigLoaderOptions): ScopeConfigurationLoader
```

Create a configuration loader with custom options.

---

### loadAndRegisterCapabilities

```typescript
async function loadAndRegisterCapabilities(
  registry: ScopeRegistry,
  parentSpecPath?: string
): Promise<LoadResult>
```

Load REQ-25 and register capabilities to registry (async).

---

### loadAndRegisterCapabilitiesSync

```typescript
function loadAndRegisterCapabilitiesSync(
  registry: ScopeRegistry,
  parentSpecPath?: string
): LoadResult
```

Load REQ-25 and register capabilities to registry (sync).

---

## Generators

The module provides comprehensive fast-check generators for property-based testing.

### Standard Generators

```typescript
// Valid CapabilityDefinition
createCapabilityArb(): fc.Arbitrary<CapabilityDefinition>

// Valid ScopeContext
createContextArb(): fc.Arbitrary<ScopeContext>

// V6.0-specific context
createV60ContextArb(): fc.Arbitrary<ScopeContext>

// Valid capability ID
createCapabilityIdArb(): fc.Arbitrary<string>

// Specific scope tag
createScopeTagArb(scopeTag: ScopeTag): fc.Arbitrary<ScopeTag>
```

### Edge Case Generators

```typescript
// Edge case strings
createEdgeCaseStringArb(): fc.Arbitrary<string>

// Edge case capabilities
createEdgeCaseCapabilityArb(): fc.Arbitrary<CapabilityDefinition>

// Edge case contexts
createEdgeCaseContextArb(): fc.Arbitrary<ScopeContext>
```

### Invalid Input Generators

```typescript
// Invalid capability IDs
createInvalidCapabilityIdArb(): fc.Arbitrary<string>

// Invalid scope tags
createInvalidScopeTagArb(): fc.Arbitrary<string>

// Invalid release branches
createInvalidReleaseBranchArb(): fc.Arbitrary<string>

// Invalid environments
createInvalidEnvironmentArb(): fc.Arbitrary<string>

// Invalid feature flags
createInvalidFeatureFlagArb(): fc.Arbitrary<string>
```

### Specialized Generators

```typescript
// FeatureFlagChange events
createFeatureFlagChangeArb(): fc.Arbitrary<FeatureFlagChange>

// ScopeViolationAttempt events
createViolationAttemptArb(): fc.Arbitrary<ScopeViolationAttempt>

// Circular dependencies
createCyclicDependencyArb(numCapabilities?: number): fc.Arbitrary<CapabilityDefinition[]>

// P0 depending on P1/P2
createP0DependsOnP1P2Arb(dependsOnP1?: boolean): fc.Arbitrary<{...}>

// V6.0 violation scenario
createV60ViolationScenarioArb(): fc.Arbitrary<{...}>

// Enabled scenario
createEnabledScenarioArb(): fc.Arbitrary<{...}>

// Dependency scenario
createDependencyScenarioArb(): fc.Arbitrary<{...}>
```

**Usage:**

```typescript
import * as fc from 'fast-check';
import { createCapabilityArb, createContextArb } from '@specforge/scope-gate';

fc.assert(
  fc.property(createCapabilityArb(), createContextArb(), (capability, context) => {
    // Test property
  })
);
```

---

## Error Handling

The module provides specific error types for different failure scenarios:

| Error Type | Use Case |
|------------|----------|
| `ScopeError` | Base class for all scope errors |
| `ScopeBoundaryViolationError` | P1/P2 capability used in V6.0 without feature flag |
| `CapabilityUnavailableError` | Capability not available (not registered, dependencies missing) |
| `DependencyError` | P0 capability depends on P1/P2 |
| `ConfigurationError` | Invalid or missing configuration |

---

## TypeScript Configuration

For optimal TypeScript support, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```