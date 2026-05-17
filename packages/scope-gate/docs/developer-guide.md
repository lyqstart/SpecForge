# Scope Gate Developer Guide

This guide explains how to extend the Scope Gate module to support new capabilities, feature flags, validation rules, and scope tags.

---

## Table of Contents

- [Adding New Capabilities](#adding-new-capabilities)
- [Registering Custom Feature Flags](#registering-custom-feature-flags)
- [Extending Validation Rules](#extending-validation-rules)
- [Adding New Scope Tags](#adding-new-scope-tags)
- [Complete Extension Example](#complete-extension-example)

---

## Adding New Capabilities

### Understanding Capability Definition

Capabilities are defined using the `CapabilityDefinition` interface:

```typescript
interface CapabilityDefinition {
  id: string;           // Unique identifier (e.g., "bugfix-workflow")
  displayName: string;  // Human-readable name
  scopeTag: ScopeTag;   // "p0" | "p1" | "p2"
  entryPoints: string[]; // Function/method names that trigger this capability
  dependencies: string[]; // IDs of other capabilities this depends on
  description: string;
}
```

### Method 1: Registering Capabilities Programmatically

```typescript
import { ScopeRegistry, ScopeContext } from '@specforge/scope-gate';

const registry = new ScopeRegistry();

// Define your capability
const myCapability = {
  id: 'my-feature',
  displayName: 'My Feature',
  scopeTag: 'p1' as const,
  entryPoints: ['executeMyFeature', 'processMyFeature'],
  dependencies: ['daemon-core'],  // P0 capability this depends on
  description: 'A new P1 feature for enhanced functionality'
};

// Register the capability
registry.registerCapability(myCapability);

// Check availability
const context: ScopeContext = {
  releaseBranch: 'v6.0',
  featureFlags: new Set(['enable_my-feature']),
  environment: 'production'
};

const result = registry.isAvailable('my-feature', context);
console.log(result.available); // true if flag is enabled, false otherwise
```

### Method 2: Adding Capabilities to REQ-25

The recommended approach for permanent capabilities is adding them to the REQ-25 section of the parent specification:

1. Open `.kiro/specs/v6-architecture-overview/requirements.md`
2. Find the REQ-25 section
3. Add your capability to the appropriate list (P0/P1/P2)

Example REQ-25 format:

```markdown
## REQ-25: P0/P1/P2 Scope Boundaries

### P0 Capabilities (Required for V6.0)
- daemon-core: Core daemon functionality
- configuration: Configuration management
- permission-engine: Access control

### P1 Capabilities (Enhanced - Disabled by Default)
- knowledge-graph: Knowledge graph capabilities
- my-new-feature: My new feature description
```

### Method 3: Loading Capabilities from Registry

For testing or temporary capabilities:

```typescript
import { loadAndRegisterCapabilities } from '@specforge/scope-gate';

const registry = new ScopeRegistry();

// Load from parent spec and add custom capabilities
await loadAndRegisterCapabilities(registry);

// Add custom capability after loading
registry.registerCapability({
  id: 'experimental-feature',
  displayName: 'Experimental Feature',
  scopeTag: 'p2',
  entryPoints: ['runExperimental'],
  dependencies: [],
  description: 'Experimental feature for testing'
});
```

---

## Registering Custom Feature Flags

### Understanding Feature Flags

Feature flags control the availability of P1/P2 capabilities. The flag naming convention is `enable_<capability-id>`.

### Using FeatureFlagManager

```typescript
import { FeatureFlagManager } from '@specforge/scope-gate';

// Create with default settings
const flagManager = new FeatureFlagManager();

// Or with options
const flagManagerWithOptions = new FeatureFlagManager({
  persistPath: './config/feature-flags.json',  // Persist to file
  defaultFlags: { enable_my_feature: false }
});

// Register capability with its scope tag
flagManager.registerCapability('my-feature', 'p1');

// Enable a feature flag
flagManager.enable('enable_my-feature', 'Enabling for Q2 testing', 'developer-1');

// Disable a feature flag
flagManager.disable('enable_my-feature', 'Disabling for release', 'admin');

// Check if enabled
if (flagManager.isEnabled('enable_my-feature')) {
  console.log('My feature is available');
}

// Bulk operations by scope
flagManager.enableByScope('p1', 'Enable all P1 for testing', 'tester');

// View change history
const history = flagManager.getHistory();
history.forEach(change => {
  console.log(`${change.timestamp}: ${change.action} ${change.flagName} by ${change.userId}`);
});
```

### Configuring Feature Flags in Config File

Create or update `scope-gate.config.json`:

```json
{
  "schema_version": "1.0",
  "enforcementMode": "strict",
  "defaultContext": {
    "releaseBranch": "v6.0",
    "environment": "production"
  },
  "featureFlags": {
    "enable_knowledge-graph": {
      "description": "Enable knowledge graph capabilities",
      "default": false,
      "capabilities": ["knowledge-graph"],
      "environments": ["staging", "development", "test"]
    },
    "enable_custom-feature": {
      "description": "Enable custom feature",
      "default": false,
      "capabilities": ["custom-feature"],
      "environments": ["development", "test"]
    }
  }
}
```

### Custom Flag Naming

You can use custom flag names (not just `enable_*`):

```typescript
// Custom flag name
flagManager.enable('my_custom_flag', 'Custom reason', 'user-1');

// Check using capability-based lookup
flagManager.isCapabilityEnabled('my-feature'); // Checks for enable_my-feature
```

---

## Extending Validation Rules

### Adding Custom Validation to ScopeValidator

```typescript
import { ScopeValidator, ScopeValidationCode } from '@specforge/scope-gate';

const validator = new ScopeValidator();

// Set capabilities
validator.setCapabilities([
  { id: 'my-feature', displayName: 'My Feature', scopeTag: 'p1', ... }
]);

// Validate code dependencies
const results = validator.validateCodeDependencies('./packages');

// Filter results by type
const errors = results.filter(r => r.type === 'error');
const warnings = results.filter(r => r.type === 'warning');
```

### Creating Custom Validation Rules

Implement custom validation logic:

```typescript
import { ValidationResult, SourceLocation } from '@specforge/scope-gate';

function validateCustomRule(
  codebasePath: string,
  ruleName: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  
  // Your custom validation logic here
  // Example: Check for specific patterns
  
  return results;
}

// Use in validation pipeline
const customResults = validateCustomRule('./packages', 'my-custom-rule');
```

### Extending ScopeTagValidator

For spec-level validation:

```typescript
import { ScopeTagValidator } from '@specforge/scope-gate';

const validator = new ScopeTagValidator({
  parentSpecPath: './.kiro/specs/v6-architecture-overview',
  specsPath: './.kiro/specs'
});

// Validate all specs
const report = validator.validateAllSpecs();

// Generate capability alignment report
const alignment = validator.generateCapabilityAlignmentReport();

// Check specific spec
const specResult = validator.validateSpec('./.kiro/specs/my-spec/.config.kiro');
```

### Custom Validation Messages

Extend validation results with custom messages:

```typescript
const result: ValidationResult = {
  type: 'warning',
  code: 'custom_validation_warning' as ScopeValidationCode,
  message: 'Custom validation message describing the issue',
  location: {
    file: './packages/my-module/src/index.ts',
    line: 42,
    column: 5
  },
  context: {
    capabilityId: 'my-feature',
    suggestion: 'Consider enabling the feature flag for this capability'
  }
};
```

---

## Adding New Scope Tags

### Understanding Scope Tags

The default scope tags are:
- **p0**: Core capabilities, always enabled in V6.0
- **p1**: Enhanced capabilities, disabled by default
- **p2**: Advanced capabilities, disabled by default

### Extending ScopeTag Type

To add a new scope tag, update the type definition:

```typescript
// Extend the ScopeTag type (requires TypeScript module augmentation)
type ExtendedScopeTag = ScopeTag | 'p3' | 'experimental';

// Update capability definition
const extendedCapability = {
  id: 'experimental-feature',
  displayName: 'Experimental Feature',
  scopeTag: 'experimental' as ExtendedScopeTag,
  entryPoints: ['runExperimental'],
  dependencies: [],
  description: 'An experimental feature'
};
```

### Implementing Custom Scope Logic

Override availability checks for custom tags:

```typescript
import { ScopeRegistry, ScopeContext, AvailabilityResult } from '@specforge/scope-gate';

class CustomScopeRegistry extends ScopeRegistry {
  protected isAvailableWithCustomLogic(
    capabilityId: string,
    context: ScopeContext,
    capability: CapabilityDefinition
  ): AvailabilityResult {
    // Custom logic for extended tags
    if (capability.scopeTag === 'experimental') {
      // Experimental features require explicit enablement
      if (!context.featureFlags.has(`enable_${capabilityId}`)) {
        return {
          available: false,
          reason: 'Experimental capability requires explicit enablement',
          requiredFlag: `enable_${capabilityId}`
        };
      }
    }
    
    // Fall back to default logic
    return super.isAvailable(capabilityId, context);
  }
}
```

### Environment-Specific Scope Handling

Configure environment-specific behavior:

```typescript
import { ScopeConfigurationLoader } from '@specforge/scope-gate';

const loader = new ScopeConfigurationLoader({
  configPath: './scope-gate.config.json'
});

const config = await loader.load();

// Access environment-specific settings
const envDefaults = loader.getEnvironmentDefaults('development');
console.log('Development allowed scopes:', envDefaults.allowedScopes);
// Output: ["p0", "p1", "p2", "experimental"]
```

---

## Complete Extension Example

Here's a complete example demonstrating all extension points:

```typescript
import {
  ScopeRegistry,
  RuntimeScopeChecker,
  FeatureFlagManager,
  ScopeValidator,
  ScopeContext,
  CapabilityDefinition
} from '@specforge/scope-gate';

async function extendScopeGate() {
  // 1. Create and configure registry
  const registry = new ScopeRegistry();
  
  // 2. Register custom capabilities
  const customCapabilities: CapabilityDefinition[] = [
    {
      id: 'custom-p1-feature',
      displayName: 'Custom P1 Feature',
      scopeTag: 'p1',
      entryPoints: ['executeCustomP1'],
      dependencies: ['daemon-core'],
      description: 'A custom P1 feature'
    },
    {
      id: 'custom-p2-feature',
      displayName: 'Custom P2 Feature', 
      scopeTag: 'p2',
      entryPoints: ['executeCustomP2'],
      dependencies: ['custom-p1-feature'],
      description: 'A custom P2 feature'
    }
  ];
  
  customCapabilities.forEach(cap => registry.registerCapability(cap));
  
  // 3. Configure feature flags
  const flagManager = new FeatureFlagManager();
  
  // Register capabilities with their scope tags
  flagManager.registerCapability('custom-p1-feature', 'p1');
  flagManager.registerCapability('custom-p2-feature', 'p2');
  
  // Enable P1 feature
  flagManager.enable('enable_custom-p1-feature', 'Enabling for testing', 'dev');
  
  // 4. Create runtime checker
  const context: ScopeContext = {
    releaseBranch: 'v6.0',
    featureFlags: flagManager.export() as unknown as Set<string>,
    environment: 'development'
  };
  
  const checker = new RuntimeScopeChecker(registry, context);
  
  // 5. Use guard decorator
  class MyService {
    @checker.guardCapability('custom-p1-feature')
    async runP1() {
      return 'P1 feature executed';
    }
    
    @checker.guardCapability('custom-p2-feature')
    async runP2() {
      return 'P2 feature executed';
    }
  }
  
  // 6. Run validation
  const validator = new ScopeValidator();
  validator.setCapabilities(registry.getAllCapabilities());
  
  const validationResults = validator.validateCodeDependencies('./packages');
  const errors = validationResults.filter(r => r.type === 'error');
  
  if (errors.length > 0) {
    console.error('Validation errors:', errors);
  }
  
  // 7. Check availability programmatically
  const p1Result = registry.isAvailable('custom-p1-feature', context);
  const p2Result = registry.isAvailable('custom-p2-feature', context);
  
  console.log('P1 available:', p1Result.available); // true (flag enabled)
  console.log('P2 available:', p2Result.available); // false (P2 disabled in v6.0)
  
  return {
    registry,
    checker,
    flagManager,
    validationResults
  };
}

extendScopeGate();
```

---

## Best Practices

### 1. Follow Naming Conventions

- Capability IDs: lowercase with hyphens (e.g., `knowledge-graph`)
- Feature flags: `enable_<capability-id>` (e.g., `enable_knowledge-graph`)
- Entry points: descriptive method names (e.g., `executeWorkflow`)

### 2. Document Dependencies

Always specify dependencies for capabilities:

```typescript
{
  id: 'my-feature',
  // ... other fields
  dependencies: ['daemon-core', 'configuration']  // P0 dependencies
}
```

### 3. Use Appropriate Scope Tags

| Tag | When to Use |
|-----|-------------|
| p0 | Core functionality required for V6.0 |
| p1 | Enhanced features for post-V6.0 releases |
| p2 | Advanced features with limited audience |

### 4. Test Extensibility

Always test custom extensions with property-based tests:

```typescript
import * as fc from 'fast-check';
import { createCapabilityArb, createContextArb } from '@specforge/scope-gate';

fc.assert(
  fc.property(
    createCapabilityArb(),
    createContextArb(),
    (capability, context) => {
      // Test that custom extensions work correctly
      const registry = new ScopeRegistry();
      registry.registerCapability(capability);
      const result = registry.isAvailable(capability.id, context);
      expect(result).toBeDefined();
    }
  )
);
```

### 5. Audit Extensions

Log all custom feature flag changes:

```typescript
import { AuditLogger } from '@specforge/scope-gate';

const logger = new AuditLogger('./logs', { agentId: 'my-extension' });

await logger.logFeatureFlagChange({
  flagName: 'enable_custom-feature',
  action: 'enable',
  userId: 'developer',
  reason: 'Enabling for testing',
  timestamp: new Date()
});
```

---

## Related Documentation

- [API Documentation](./api.md) - Complete API reference
- [User Guide](./user-guide.md) - End-user guide
- [CLI Documentation](./cli.md) - CLI tool reference
- [Design Document](../.kiro/specs/scope-gate/design.md) - Architecture details
- [Requirements](../.kiro/specs/scope-gate/requirements.md) - Module requirements