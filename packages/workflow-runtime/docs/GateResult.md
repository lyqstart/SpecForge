# GateResult Interface Documentation

## Overview

`GateResult` is the standard interface for representing the outcome of a Gate execution in the workflow runtime. It provides a consistent way to communicate whether a Gate check passed or failed, along with optional metadata about the execution.

## Interface Definition

```typescript
export interface GateResult {
  /** Schema version for forward compatibility (currently "1.0") */
  schema_version: "1.0";
  
  /** Whether the Gate check passed (true) or failed (false) */
  passed: boolean;
  
  /** Optional reason for the result, especially useful for failures */
  reason?: string;
  
  /** Optional detailed metadata about the execution result */
  details?: Record<string, unknown>;
}
```

## Fields

### `schema_version` (required)
- **Type**: `"1.0"` (literal string)
- **Purpose**: Ensures forward compatibility when the interface evolves
- **Current Value**: Always `"1.0"`

### `passed` (required)
- **Type**: `boolean`
- **Purpose**: Indicates whether the Gate check succeeded (`true`) or failed (`false`)
- **Usage**: Used by the workflow engine to determine next steps

### `reason` (optional)
- **Type**: `string | undefined`
- **Purpose**: Provides a human-readable explanation of the result
- **Best Practices**:
  - For failures: Explain why the check failed
  - For successes: Can be omitted or provide context
  - Keep messages concise and actionable

### `details` (optional)
- **Type**: `Record<string, unknown> | undefined`
- **Purpose**: Carries structured metadata about the execution
- **Common Fields**:
  - `checkedItems`: Number of items checked
  - `failedItems`: Number of items that failed
  - `errors`: Array of error messages
  - `executionTime`: Time taken in milliseconds
  - `timestamp`: ISO 8601 timestamp of execution

## Usage Examples

### Success Result

```typescript
const result: GateResult = {
  schema_version: "1.0",
  passed: true,
  reason: "All requirements validated successfully",
  details: {
    validatedCount: 15,
    duration: 234,
    timestamp: "2024-01-15T10:30:00Z"
  }
};
```

### Failure Result

```typescript
const result: GateResult = {
  schema_version: "1.0",
  passed: false,
  reason: "Design validation failed",
  details: {
    errors: [
      "Missing component documentation",
      "Invalid state transitions"
    ],
    failedAt: "design-gate-2",
    failedCount: 2
  }
};
```

### Timeout Result

```typescript
const result: GateResult = {
  schema_version: "1.0",
  passed: false,
  reason: "Gate execution timeout",
  details: {
    timeoutMs: 5000,
    elapsedMs: 5001,
    operation: "verification-gate"
  }
};
```

### Error Result

```typescript
const result: GateResult = {
  schema_version: "1.0",
  passed: false,
  reason: "Gate execution error",
  details: {
    errorType: "ValidationError",
    errorMessage: "Invalid workflow definition",
    stack: "Error: Invalid workflow definition\n    at ..."
  }
};
```

## Implementation in Gate Runners

All Gate runners must return a `GateResult` from their `check()` method:

```typescript
class MyGateRunner extends GateRunner {
  async check(): Promise<GateResult> {
    try {
      // Perform gate checks
      const isValid = await validateSomething();
      
      if (isValid) {
        return {
          schema_version: "1.0",
          passed: true,
          reason: "Validation passed",
          details: { checkedItems: 10 }
        };
      } else {
        return {
          schema_version: "1.0",
          passed: false,
          reason: "Validation failed",
          details: { 
            errors: ["Item 1 failed", "Item 3 failed"],
            failedCount: 2
          }
        };
      }
    } catch (error) {
      return {
        schema_version: "1.0",
        passed: false,
        reason: `Execution error: ${error.message}`,
        details: {
          errorType: error.constructor.name,
          errorMessage: error.message
        }
      };
    }
  }
}
```

## Serialization

`GateResult` is fully JSON serializable:

```typescript
const result: GateResult = {
  schema_version: "1.0",
  passed: true,
  reason: "Test passed",
  details: { key: "value" }
};

// Serialize to JSON
const json = JSON.stringify(result);
// {"schema_version":"1.0","passed":true,"reason":"Test passed","details":{"key":"value"}}

// Deserialize from JSON
const parsed = JSON.parse(json) as GateResult;
```

## Type Safety

The `GateResult` interface enforces type safety at compile time:

```typescript
// ✅ Valid
const result: GateResult = {
  schema_version: "1.0",
  passed: true
};

// ❌ Invalid - schema_version must be "1.0"
const invalid: GateResult = {
  schema_version: "2.0",
  passed: true
};

// ❌ Invalid - passed must be boolean
const invalid2: GateResult = {
  schema_version: "1.0",
  passed: "true"
};
```

## Related Interfaces

- **GateDefinition**: Defines the structure of a Gate
- **GateRunner**: Base class for executing Gates and returning GateResult
- **WorkflowInstance**: Contains the history of GateResult executions

## Validation Requirements

According to **Requirements 2.2** (Gate Execution Determinism):
- For the same Gate and identical inputs, `check()` must return the same `GateResult`
- The `passed` field must accurately reflect the execution outcome
- The `reason` field should provide actionable information for failures

## Testing

Comprehensive tests for `GateResult` are available in:
- `tests/unit/GateResult.test.ts` - Type definition and structure tests
- `tests/unit/GateDefinition.test.ts` - Integration with GateDefinition

Run tests with:
```bash
bun test packages/workflow-runtime/tests/unit/GateResult.test.ts
```
