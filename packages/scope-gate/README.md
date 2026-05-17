# @specforge/scope-gate

Scope Gate module for SpecForge V6 - Enforces P0/P1/P2 scope boundaries.

## Overview

The Scope Gate is a **P0 enforcement module** within the SpecForge V6 architecture. Its primary responsibility is to **enforce the P0/P1/P2 scope boundaries** defined in REQ-25 of the parent V6 architecture specification.

## Features

- **Scope Boundary Enforcement**: Ensures P1/P2 capabilities are disabled by default in V6.0
- **Runtime Scope Checking**: Enforces scope boundaries at runtime with clear error messages
- **Feature Flag Integration**: Supports enabling P1/P2 capabilities via explicit feature flags
- **Audit Logging**: Logs all scope-related decisions and violations to events.jsonl
- **Static Validation**: Performs static analysis to detect scope boundary violations
- **Parent Spec Integration**: Integrates with parent V6 architecture specification

## Installation

```bash
bun install @specforge/scope-gate
```

## Usage

### Basic Usage

```typescript
import { ScopeRegistry, RuntimeScopeChecker } from '@specforge/scope-gate';

// Initialize scope registry
const registry = new ScopeRegistry();
await registry.loadFromParentSpec('../v6-architecture-overview/requirements.md');

// Check capability availability
const context = {
  releaseBranch: 'v6.0',
  featureFlags: new Set(),
  environment: 'production'
};

const result = registry.isAvailable('some-p1-capability', context);
console.log(result.available); // false for P1/P2 capabilities in V6.0
```

### Runtime Scope Checking

```typescript
import { guardCapability } from '@specforge/scope-gate';

class MyService {
  @guardCapability('some-p1-capability')
  async doSomething() {
    // This method will throw ScopeError if capability is unavailable
    return 'result';
  }
}
```

## Development Tools

### CLI Tools

The package provides four CLI tools for managing scope boundaries:

| Tool | Purpose |
|------|---------|
| `capability-list` | List all registered capabilities with scope tags |
| `feature-flag` | Manage feature flags for P1/P2 capabilities |
| `scope-context` | Inspect current scope context |
| `scope-validate` | Validate scope tags in code and specs |

See [CLI Documentation](./docs/cli.md) for detailed usage.

### Setup

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun run test

# Run property-based tests
bun run test:property

# Run with watch mode
bun run dev
```

### Testing Strategy

This module uses comprehensive testing including:

1. **Unit Tests**: Test individual components
2. **Property-Based Tests**: Verify universal properties using fast-check
3. **Integration Tests**: Test integration with other modules
4. **End-to-End Tests**: Complete workflow scenarios

### Property-Based Tests

Key property-based tests include:

- **Property 15**: P1/P2 capabilities disabled by default in V6.0
- **Property SG-1**: Consistent scope tagging
- **Property SG-2**: Feature flag determinism
- **Property SG-3**: Audit trail completeness
- **Property SG-4**: No silent failures

## API Documentation

See [CLI Documentation](./docs/cli.md) for CLI tool usage.

See [API Documentation](./docs/api.md) for detailed API reference.

## Contributing

See [Contributing Guidelines](./CONTRIBUTING.md) for development guidelines.

## License

MIT