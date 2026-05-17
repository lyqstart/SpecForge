# Workflow Definition Loader

## Overview

The `WorkflowDefinitionLoader` is a utility class that handles loading and validating workflow definitions from various sources (JSON, YAML, files, or objects). It provides comprehensive validation to ensure workflow definitions conform to the required schema.

## Features

- **Multiple Input Formats**: Load workflow definitions from JSON strings, YAML strings, files, or JavaScript objects
- **Comprehensive Validation**: Validates all required fields and nested structures
- **Schema Version Management**: Automatically manages schema versioning (currently supports 1.0)
- **Detailed Error Reporting**: Provides detailed validation errors with field paths and messages
- **Support for Complex Structures**: Handles simple gates, composite gates, and nested gate hierarchies

## Installation

The `WorkflowDefinitionLoader` is exported from the main `@specforge/workflow-runtime` package:

```typescript
import { WorkflowDefinitionLoader } from '@specforge/workflow-runtime';
```

## Usage

### Loading from JSON String

```typescript
const loader = new WorkflowDefinitionLoader();

const jsonString = `{
  "schema_version": "1.0",
  "id": "my-workflow",
  "displayName": "My Workflow",
  "intent": "Execute a workflow",
  "stateMachine": {
    "schema_version": "1.0",
    "initial": "state1",
    "states": {
      "state1": {
        "schema_version": "1.0",
        "agent": "my-agent",
        "gate": {
          "schema_version": "1.0",
          "type": "simple",
          "id": "gate1",
          "name": "Gate 1"
        },
        "skills": []
      }
    }
  },
  "artifacts": []
}`;

const definition = loader.loadFromJSON(jsonString);
```

### Loading from YAML String

```typescript
const yamlString = `
schema_version: "1.0"
id: my-workflow
displayName: My Workflow
intent: Execute a workflow
stateMachine:
  schema_version: "1.0"
  initial: state1
  states:
    state1:
      schema_version: "1.0"
      agent: my-agent
      gate:
        schema_version: "1.0"
        type: simple
        id: gate1
        name: Gate 1
      skills: []
artifacts: []
`;

const definition = loader.loadFromYAML(yamlString);
```

### Loading from File

```typescript
// Automatically detects format based on file extension (.json, .yaml, .yml)
const definition = await loader.loadFromFile('/path/to/workflow.json');
const definition = await loader.loadFromFile('/path/to/workflow.yaml');
```

### Loading from Object

```typescript
const obj = {
  schema_version: "1.0",
  id: "my-workflow",
  displayName: "My Workflow",
  intent: "Execute a workflow",
  stateMachine: {
    schema_version: "1.0",
    initial: "state1",
    states: {
      state1: {
        schema_version: "1.0",
        agent: "my-agent",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate1",
          name: "Gate 1"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const definition = loader.loadFromObject(obj);
```

### Validating a Definition

```typescript
const result = loader.validate(definition);

if (result.valid) {
  console.log('Workflow definition is valid');
} else {
  console.log('Validation errors:');
  result.errors.forEach(error => {
    console.log(`  ${error.field}: ${error.message}`);
  });
}
```

## Workflow Definition Structure

### Top-Level Fields

- `schema_version` (string): Must be "1.0"
- `id` (string): Unique identifier for the workflow
- `displayName` (string): Human-readable name
- `intent` (string): Description of the workflow's purpose
- `stateMachine` (StateMachine): The state machine definition
- `artifacts` (ArtifactDefinition[]): Optional artifacts

### State Machine Structure

- `schema_version` (string): Must be "1.0"
- `initial` (string): ID of the initial state
- `states` (Record<string, WorkflowState>): Map of state definitions

### State Definition

- `schema_version` (string): Must be "1.0"
- `agent` (string): Agent responsible for this state
- `gate` (GateDefinition): Gate to execute in this state
- `skills` (string[]): Skills available in this state
- `next` (string | Record<string, string>): Next state(s) after gate execution

### Gate Definitions

#### Simple Gate

```typescript
{
  schema_version: "1.0",
  type: "simple",
  id: "gate-id",
  name: "Gate Name",
  checkFn?: () => Promise<GateResult> | GateResult
}
```

#### Composite Gate

```typescript
{
  schema_version: "1.0",
  type: "composite",
  id: "composite-gate-id",
  name: "Composite Gate Name",
  mode: "sequential" | "parallel",
  failPolicy: "fail_fast" | "collect_all",
  children: GateDefinition[]
}
```

## Validation Rules

The loader validates the following:

1. **Schema Version**: Must be "1.0"
2. **Required Fields**: All required fields must be present
3. **Field Types**: Fields must have correct types
4. **State Machine**: Must have at least one state
5. **Initial State**: Must exist in the states map
6. **Gate Types**: Must be "simple" or "composite"
7. **Composite Gates**: Must have mode, failPolicy, and at least one child
8. **Nested Gates**: All nested gates are recursively validated

## Error Handling

The loader throws errors with detailed messages when validation fails:

```typescript
try {
  const definition = loader.loadFromJSON(invalidJson);
} catch (error) {
  console.error(error.message);
  // Output: "Workflow definition validation failed:
  //          id: id is required
  //          displayName: displayName is required"
}
```

## Version Management

The loader automatically manages schema versioning:

- If `schema_version` is missing, it's automatically set to "1.0"
- If `schema_version` is not "1.0", validation fails with a clear error message
- All nested structures (stateMachine, states, gates) also require schema_version

## YAML Parser Limitations

The built-in YAML parser is a simple implementation that handles basic YAML structures. For production use with complex YAML files, consider using a proper YAML library like:

- `yaml` - Pure JavaScript YAML parser
- `js-yaml` - JavaScript YAML parser with better error handling

To use a different YAML parser, you can extend the `WorkflowDefinitionLoader` class and override the `parseYAML` method.

## Integration with WorkflowEngine

```typescript
import { WorkflowEngine, WorkflowDefinitionLoader } from '@specforge/workflow-runtime';

const loader = new WorkflowDefinitionLoader();
const engine = new WorkflowEngine();

// Load definition
const definition = await loader.loadFromFile('workflow.json');

// Load into engine
const workflowId = engine.loadWorkflow(definition);

// Create and execute instance
const instance = engine.createInstance(workflowId);
await engine.execute(instance.id);
```

## API Reference

### `loadFromFile(filePath: string): Promise<WorkflowDefinition>`

Loads a workflow definition from a file. Supports .json, .yaml, and .yml extensions.

**Parameters:**
- `filePath` (string): Path to the workflow definition file

**Returns:** Promise resolving to the loaded WorkflowDefinition

**Throws:** Error if file cannot be read or parsed

### `loadFromJSON(jsonString: string): WorkflowDefinition`

Loads a workflow definition from a JSON string.

**Parameters:**
- `jsonString` (string): JSON string containing the workflow definition

**Returns:** The loaded WorkflowDefinition

**Throws:** Error if JSON is invalid or validation fails

### `loadFromYAML(yamlString: string): WorkflowDefinition`

Loads a workflow definition from a YAML string.

**Parameters:**
- `yamlString` (string): YAML string containing the workflow definition

**Returns:** The loaded WorkflowDefinition

**Throws:** Error if YAML is invalid or validation fails

### `loadFromObject(obj: unknown): WorkflowDefinition`

Loads a workflow definition from a JavaScript object.

**Parameters:**
- `obj` (unknown): Object containing the workflow definition

**Returns:** The loaded WorkflowDefinition

**Throws:** Error if object is invalid or validation fails

### `validate(definition: WorkflowDefinition): ValidationResult`

Validates a workflow definition.

**Parameters:**
- `definition` (WorkflowDefinition): The workflow definition to validate

**Returns:** ValidationResult with `valid` boolean and `errors` array

## Examples

### Example 1: Load and Execute a Workflow

```typescript
import { WorkflowEngine, WorkflowDefinitionLoader } from '@specforge/workflow-runtime';

const loader = new WorkflowDefinitionLoader();
const engine = new WorkflowEngine();

// Load workflow definition
const definition = await loader.loadFromFile('my-workflow.json');

// Load into engine
const workflowId = engine.loadWorkflow(definition);

// Create instance
const instance = engine.createInstance(workflowId);

// Execute workflow
const result = await engine.execute(instance.id);
console.log(`Workflow completed in state: ${result.currentState}`);
```

### Example 2: Validate Before Loading

```typescript
const loader = new WorkflowDefinitionLoader();

const definition = loader.loadFromObject(myObject);
const result = loader.validate(definition);

if (!result.valid) {
  console.error('Validation failed:');
  result.errors.forEach(error => {
    console.error(`  ${error.field}: ${error.message}`);
  });
} else {
  console.log('Workflow definition is valid');
}
```

### Example 3: Handle Validation Errors

```typescript
try {
  const definition = loader.loadFromJSON(jsonString);
} catch (error) {
  if (error instanceof Error) {
    console.error('Failed to load workflow:', error.message);
    // Parse error message to extract validation errors
    const lines = error.message.split('\n');
    lines.forEach(line => {
      if (line.includes(':')) {
        const [field, message] = line.split(':');
        console.error(`  ${field.trim()}: ${message.trim()}`);
      }
    });
  }
}
```

## Testing

The `WorkflowDefinitionLoader` includes comprehensive unit tests covering:

- Loading from JSON, YAML, files, and objects
- Validation of all required fields
- Detection of invalid field types
- Support for composite gates
- Support for nested composite gates
- Schema version management
- Error handling and reporting

Run tests with:

```bash
bun test packages/workflow-runtime/tests/unit/WorkflowDefinitionLoader.test.ts
```

## See Also

- [WorkflowEngine Documentation](./WORKFLOW_ENGINE.md)
- [Gate Definitions](./GATES.md)
- [Workflow Types](./TYPES.md)
