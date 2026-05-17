# Scope Gate User Guide

This guide provides practical examples and common use cases for the `@specforge/scope-gate` module. For detailed API reference, see [API Documentation](./api.md). For CLI tools, see [CLI Documentation](./cli.md).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Basic Concepts](#basic-concepts)
- [Common Use Cases](#common-use-cases)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Quick Start

### Installation

```bash
# Using bun (recommended)
bun add @specforge/scope-gate

# Or using npm
npm install @specforge/scope-gate
```

### Your First Scope Check

```typescript
import { ScopeRegistry, RuntimeScopeChecker, loadAndRegisterCapabilities } from '@specforge/scope-gate';

async function main() {
  // 1. Create registry and load capabilities from REQ-25
  const registry = new ScopeRegistry();
  await loadAndRegisterCapabilities(registry);
  
  // 2. Create scope context
  const context = {
    releaseBranch: 'v6.0' as const,
    featureFlags: new Set<string>(),
    environment: 'production' as const
  };
  
  // 3. Create runtime checker
  const checker = new RuntimeScopeChecker(registry, context);
  
  // 4. Check if a capability is available
  const result = registry.isAvailable('daemon-core', context);
  console.log('Available:', result.available); // true for P0 in v6.0
  
  // 5. Try to use a P1 capability (will fail in v6.0)
  const p1Result = registry.isAvailable('knowledge-graph', context);
  console.log('Available:', p1Result.available); // false
  console.log('Reason:', p1Result.reason); // "P1 capability not available in v6.0"
}

main();
```

---

## Basic Concepts

### Scope Tags

Scope-gate classifies capabilities into three tags:

| Tag | Description | Availability in v6.0 |
|-----|-------------|---------------------|
| **P0** | Core capabilities required for release | Always enabled |
| **P1** | Enhanced capabilities | Disabled by default, enable via feature flag |
| **P2** | Advanced capabilities | Disabled by default, enable via feature flag |

### Key Components

1. **ScopeRegistry** - Maintains the mapping of capabilities to scope tags
2. **RuntimeScopeChecker** - Enforces scope boundaries at runtime
3. **FeatureFlagManager** - Manages feature flags for enabling P1/P2
4. **AuditLogger** - Logs all scope-related decisions

---

## Common Use Cases

### Use Case 1: Protecting P1/P2 Entry Points

Protect methods that use P1 or P2 capabilities:

```typescript
import { ScopeRegistry, RuntimeScopeChecker, loadAndRegisterCapabilities } from '@specforge/scope-gate';

const registry = new ScopeRegistry();
await loadAndRegisterCapabilities(registry);

const checker = new RuntimeScopeChecker(registry, {
  releaseBranch: 'v6.0',
  featureFlags: new Set(['enable_workflow-runtime']), // Enable P1 capability
  environment: 'production'
});

// Using the guard decorator
class WorkflowService {
  @checker.guardCapability('workflow-runtime')
  async runWorkflow(workflowId: string) {
    // This code only runs if the capability is available
    return await executeWorkflow(workflowId);
  }
  
  // Manual check for non-decorator scenarios
  async processRequest(request: Request) {
    checker.checkCapability('workflow-runtime', checker.getCurrentContext());
    // Proceed with processing
  }
}
```

### Use Case 2: Enabling P1/P2 Capabilities

Enable P1 or P2 capabilities for development or testing:

```typescript
import { FeatureFlagManager } from '@specforge/scope-gate';

// Create feature flag manager
const flagManager = new FeatureFlagManager();

// Register capabilities with their scope tags
flagManager.registerCapability('knowledge-graph', 'p1');
flagManager.registerCapability('multimodal', 'p2');

// Enable a single capability
flagManager.enable('enable_knowledge-graph', 'Enabling for development', 'developer-1');

// Enable all P1 capabilities
flagManager.enableByScope('p1', 'Testing P1 features', 'developer-1');

// Check if enabled
if (flagManager.isEnabled('enable_knowledge-graph')) {
  console.log('Knowledge Graph is available');
}

// Create scope context from feature flags
const context = flagManager.createScopeContext({
  releaseBranch: 'v6.0',
  environment: 'development'
});
```

### Use Case 3: Validating Code Dependencies

Ensure P0 code doesn't depend on P1/P2:

```typescript
import { ScopeValidator } from '@specforge/scope-gate';
import { createCapabilityArb } from '@specforge/scope-gate';

// Create validator
const validator = new ScopeValidator();

// Set capabilities
const capabilities = [
  { id: 'daemon-core', displayName: 'Daemon', scopeTag: 'p0', ... },
  { id: 'workflow-runtime', displayName: 'Workflow', scopeTag: 'p1', ... }
];
validator.setCapabilities(capabilities);

// Validate codebase for scope violations
const results = validator.validateCodeDependencies('./packages');

// Check results
const errors = results.filter(r => r.type === 'error');
if (errors.length > 0) {
  console.error('Scope violations found:');
  errors.forEach(e => console.error(`  - ${e.code}: ${e.message}`));
}
```

### Use Case 4: Batch Capability Checks

Check multiple capabilities at once:

```typescript
const capabilitiesToCheck = [
  'daemon-core',      // P0
  'configuration',    // P0  
  'workflow-runtime', // P1
  'knowledge-graph'   // P1
];

const results = checker.checkCapabilities(capabilitiesToCheck, context);

results.forEach(result => {
  if (!result.available) {
    console.log(`[${result.capabilityId}] ${result.reason}`);
  }
});
```

### Use Case 5: Dynamic Feature Flag Management

Manage feature flags with persistence:

```typescript
import { FeatureFlagManager } from '@specforge/scope-gate';

const flagManager = new FeatureFlagManager({
  persistPath: './config/feature-flags.json'
});

// Enable with tracking
flagManager.enable('enable_workflow-runtime', 'Q2 testing', 'test-user');

// Export current state
const flags = flagManager.export();
console.log(flags);
// { enable_workflow_runtime: true, ... }

// Import state (e.g., from config file)
flagManager.import({
  enable_workflow_runtime: true,
  enable_knowledge_graph: false
});

// View change history
const history = flagManager.getHistory();
history.forEach(change => {
  console.log(`[${change.timestamp}] ${change.action} ${change.flagName} by ${change.userId}`);
});
```

---

## Configuration

### Configuration File

Create a `scope-gate.config.json` file:

```json
{
  "schema_version": "1.0",
  "enforcementMode": "strict",
  "defaultContext": {
    "releaseBranch": "v6.0",
    "environment": "production"
  },
  "environmentDefaults": {
    "production": {
      "enforcementMode": "strict",
      "allowedScopes": ["p0"]
    },
    "staging": {
      "enforcementMode": "warning",
      "allowedScopes": ["p0", "p1"]
    },
    "development": {
      "enforcementMode": "warning",
      "allowedScopes": ["p0", "p1", "p2"]
    },
    "test": {
      "enforcementMode": "disabled",
      "allowedScopes": ["p0", "p1", "p2"]
    }
  },
  "featureFlags": {
    "enable_workflow-runtime": {
      "enabled": false,
      "scopeTag": "p1"
    }
  }
}
```

### Loading Configuration

```typescript
import { ScopeConfigurationLoader } from '@specforge/scope-gate';

const loader = new ScopeConfigurationLoader({
  configPath: './scope-gate.config.json'
});

const config = await loader.load();
console.log('Enforcement mode:', config.enforcementMode);
console.log('Default context:', config.defaultContext);

// Get environment-specific defaults
const envDefaults = loader.getEnvironmentDefaults('development');
console.log('Dev allowed scopes:', envDefaults.allowedScopes);
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCOPEGATE_RELEASE_BRANCH` | Release branch | v6.0 |
| `SCOPEGATE_ENVIRONMENT` | Environment | production |
| `SCOPEGATE_CONFIG_PATH` | Config file path | - |
| `SCOPEGATE_AUDIT_LOG` | Audit log directory | ./logs |

---

## Error Handling

### Handling Scope Errors

```typescript
import { 
  ScopeError, 
  ScopeBoundaryViolationError, 
  CapabilityUnavailableError,
  DependencyError 
} from '@specforge/scope-gate';

try {
  checker.checkCapability('knowledge-graph', context);
} catch (error) {
  if (error instanceof ScopeBoundaryViolationError) {
    console.error(`P1/P2 capability used without feature flag: ${error.capabilityId}`);
    console.error(`Required flag: ${error.requiredFlag}`);
  } else if (error instanceof CapabilityUnavailableError) {
    console.error(`Capability not available: ${error.capabilityId}`);
  } else if (error instanceof DependencyError) {
    console.error(`P0 cannot depend on P1/P2: ${error.capabilityId} -> ${error.dependencyId}`);
  } else {
    throw error;
  }
}
```

### Error Types

| Error | Code | When Thrown |
|-------|------|-------------|
| `ScopeBoundaryViolationError` | `SCOPE_BOUNDARY_VIOLATION` | P1/P2 used in v6.0 without flag |
| `CapabilityUnavailableError` | `CAPABILITY_UNAVAILABLE` | Capability not registered or dependencies missing |
| `DependencyError` | `DEPENDENCY_VIOLATION` | P0 capability depends on P1/P2 |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid or missing configuration |

---

## Best Practices

### 1. Always Load REQ-25 First

```typescript
// ✅ Correct
await loadAndRegisterCapabilities(registry);

// ❌ Incorrect - registry will be empty
const registry = new ScopeRegistry();
// ... use empty registry
```

### 2. Use Feature Flags for P1/P2

```typescript
// ✅ Correct - check flag before using P1/P2
if (flagManager.isEnabled('enable_workflow-runtime')) {
  await runWorkflow(id);
}

// ❌ Incorrect - will throw in production
checker.checkCapability('workflow-runtime', context);
```

### 3. Log All Scope Decisions

```typescript
import { AuditLogger } from '@specforge/scope-gate';

const logger = new AuditLogger('./logs', { 
  agentId: 'my-agent', 
  role: 'developer' 
});

// Log violations
await logger.logViolationAttempt({
  capabilityId: 'knowledge-graph',
  attemptedAt: new Date(),
  context: { releaseBranch: 'v6.0', environment: 'production' }
});

// Log flag changes
await logger.logFeatureFlagChange({
  flagName: 'enable_workflow-runtime',
  action: 'enable',
  userId: 'developer-1',
  reason: 'Testing',
  timestamp: new Date()
});
```

### 4. Use Appropriate Enforcement Mode

| Environment | Mode | Behavior |
|-------------|------|----------|
| Production | `strict` | Throws errors for violations |
| Staging | `warning` | Logs warnings, allows execution |
| Development | `warning` | Logs warnings, allows execution |
| Test | `disabled` | No enforcement |

### 5. Validate Early in CI/CD

```bash
# Add to your CI pipeline
bun run packages/scope-gate/bin/scope-validate.ts --path ./packages

# Exit code 0 = pass, 1 = fail
```

---

## Related Documentation

- [API Documentation](./api.md) - Complete API reference
- [CLI Documentation](./cli.md) - CLI tool reference
- [Design Document](../.kiro/specs/scope-gate/design.md) - Architecture details
- [Requirements](../.kiro/specs/scope-gate/requirements.md) - Module requirements