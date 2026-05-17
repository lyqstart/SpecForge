# Workflow Runtime API Documentation

## Overview

The Workflow Runtime module provides a complete execution engine for workflow definitions with support for state machines, gates, and composite gate semantics. This document describes the public API for integrating and using the workflow runtime.

**Version**: 0.1.0  
**Module**: `@specforge/workflow-runtime`

## Table of Contents

1. [Core Classes](#core-classes)
2. [Interfaces](#interfaces)
3. [Functions](#functions)
4. [Error Handling](#error-handling)
5. [Event System](#event-system)

---

## Core Classes

### WorkflowEngine

The main orchestrator for workflow execution. Manages workflow definitions, instances, and state transitions.

#### Constructor

```typescript
constructor(config?: WorkflowEngineConfig)
```

**Parameters:**
- `config` (optional): Configuration object
  - `persistenceDir`: Directory for storing workflow state (default: `./workflows`)
  - `eventBus`: Optional Event Bus instance for publishing events

**Example:**
```typescript
const engine = new WorkflowEngine({
  persistenceDir: './data/workflows',
  eventBus: myEventBus
});
```

#### Methods

##### `loadWorkflow(definition: WorkflowDefinition): string`

Loads a workflow definition into the engine.

**Parameters:**
- `definition`: The workflow definition to load

**Returns:** The workflow ID

**Throws:** `WorkflowError` if the definition is invalid

**Example:**
```typescript
const workflowId = engine.loadWorkflow({
  schema_version: "1.0",
  id: "my-workflow",
  displayName: "My Workflow",
  intent: "Execute a complex process",
  stateMachine: {
    schema_version: "1.0",
    initial: "start",
    states: {
      start: {
        schema_version: "1.0",
        agent: "executor",
        gate: { type: "simple", id: "gate-1", name: "Initial Gate" },
        skills: ["skill-1"],
        next: "end"
      },
      end: {
        schema_version: "1.0",
        agent: "executor",
        gate: { type: "simple", id: "gate-2", name: "Final Gate" },
        skills: []
      }
    }
  },
  artifacts: []
});
```

##### `getWorkflow(workflowId: string): WorkflowDefinition | undefined`

Retrieves a loaded workflow definition.

**Parameters:**
- `workflowId`: The ID of the workflow to retrieve

**Returns:** The workflow definition, or `undefined` if not found

**Example:**
```typescript
const workflow = engine.getWorkflow(workflowId);
if (workflow) {
  console.log(`Workflow: ${workflow.displayName}`);
}
```

##### `createInstance(workflowId: string): WorkflowInstance`

Creates a new instance of a workflow.

**Parameters:**
- `workflowId`: The ID of the workflow to instantiate

**Returns:** The created workflow instance

**Throws:** `WorkflowError` if the workflow is not found

**Example:**
```typescript
const instance = engine.createInstance(workflowId);
console.log(`Created instance: ${instance.id}`);
```

##### `getInstance(instanceId: string): WorkflowInstance | undefined`

Retrieves a workflow instance.

**Parameters:**
- `instanceId`: The ID of the instance to retrieve

**Returns:** The workflow instance, or `undefined` if not found

**Example:**
```typescript
const instance = engine.getInstance(instanceId);
if (instance) {
  console.log(`Current state: ${instance.currentState}`);
}
```

##### `async execute(instanceId: string): Promise<WorkflowInstance>`

Executes a workflow instance from its current state to completion.

**Parameters:**
- `instanceId`: The ID of the instance to execute

**Returns:** The updated workflow instance

**Throws:** `WorkflowError` if execution fails

**Example:**
```typescript
try {
  const result = await engine.execute(instanceId);
  console.log(`Execution completed. Final state: ${result.currentState}`);
} catch (error) {
  console.error(`Execution failed: ${error.message}`);
}
```

##### `transition(instanceId: string, from: string, to: string): boolean`

Performs a state transition on a workflow instance.

**Parameters:**
- `instanceId`: The ID of the instance
- `from`: The current state
- `to`: The target state

**Returns:** `true` if the transition was successful, `false` otherwise

**Example:**
```typescript
const success = engine.transition(instanceId, "start", "processing");
if (success) {
  console.log("Transition successful");
}
```

##### `pause(instanceId: string): WorkflowInstance`

Pauses a running workflow instance.

**Parameters:**
- `instanceId`: The ID of the instance to pause

**Returns:** The paused workflow instance

**Example:**
```typescript
const paused = engine.pause(instanceId);
console.log(`Instance paused at state: ${paused.currentState}`);
```

##### `async resume(instanceId: string): Promise<WorkflowInstance>`

Resumes a paused workflow instance.

**Parameters:**
- `instanceId`: The ID of the instance to resume

**Returns:** The resumed workflow instance

**Throws:** `WorkflowError` if the instance is not paused

**Example:**
```typescript
const resumed = await engine.resume(instanceId);
console.log(`Instance resumed from state: ${resumed.currentState}`);
```

##### `getAllInstances(): WorkflowInstance[]`

Retrieves all workflow instances.

**Returns:** Array of all workflow instances

**Example:**
```typescript
const instances = engine.getAllInstances();
console.log(`Total instances: ${instances.length}`);
```

##### `async executeGate(gate: GateDefinition): Promise<GateResult>`

Executes a gate directly (useful for testing).

**Parameters:**
- `gate`: The gate definition to execute

**Returns:** The gate execution result

**Example:**
```typescript
const result = await engine.executeGate({
  type: "simple",
  id: "test-gate",
  name: "Test Gate"
});
console.log(`Gate passed: ${result.passed}`);
```

##### `setEventPublisher(publisher: EventPublisher): void`

Sets the event publisher for workflow events.

**Parameters:**
- `publisher`: The event publisher instance

**Example:**
```typescript
engine.setEventPublisher(myEventPublisher);
```

##### `getEventPublisher(): EventPublisher | undefined`

Gets the current event publisher.

**Returns:** The event publisher, or `undefined` if not set

##### `onEvent(handler: EventHandler): void`

Registers an event handler for workflow events.

**Parameters:**
- `handler`: Function to handle events

**Example:**
```typescript
engine.onEvent((event) => {
  console.log(`Event: ${event.type} at ${event.timestamp}`);
});
```

##### `offEvent(handler: EventHandler): void`

Unregisters an event handler.

**Parameters:**
- `handler`: The handler to remove

---

### GateRunner

Abstract base class for executing gates. Subclasses implement specific gate types.

#### Constructor

```typescript
constructor(gate: GateDefinition, context?: Record<string, unknown>)
```

**Parameters:**
- `gate`: The gate definition
- `context`: Optional execution context

#### Methods

##### `abstract async check(context?: WorkflowContext): Promise<GateResult>`

Executes the gate and returns the result. Must be implemented by subclasses.

**Parameters:**
- `context`: Optional workflow context

**Returns:** The gate execution result

##### `validate(context: WorkflowContext): boolean`

Validates the gate definition and context.

**Parameters:**
- `context`: The workflow context

**Returns:** `true` if valid, `false` otherwise

##### `getGate(): GateDefinition`

Returns the gate definition.

##### `getContext(): Record<string, unknown>`

Returns the execution context.

##### `setContext(context: Record<string, unknown>): void`

Sets the execution context.

---

### SimpleGateRunner

Executes simple (non-composite) gates.

#### Constructor

```typescript
constructor(gate: SimpleGateDefinition, context?: Record<string, unknown>)
```

#### Methods

##### `async check(context?: WorkflowContext): Promise<GateResult>`

Executes the simple gate.

**Example:**
```typescript
const runner = new SimpleGateRunner({
  type: "simple",
  id: "gate-1",
  name: "Validation Gate"
});

const result = await runner.check();
console.log(`Gate result: ${result.passed}`);
```

---

### CompositeGateRunner

Executes composite gates with support for sequential/parallel execution and fail-fast/collect-all strategies.

#### Constructor

```typescript
constructor(gate: CompositeGateDefinition, context?: Record<string, unknown>)
```

#### Methods

##### `getCompositeGate(): CompositeGateDefinition`

Returns the composite gate definition.

##### `setChildRunners(runners: GateRunner[]): void`

Sets the child gate runners.

**Parameters:**
- `runners`: Array of GateRunner instances

##### `getChildRunners(): GateRunner[]`

Returns the child gate runners.

##### `async check(context?: WorkflowContext): Promise<GateResult>`

Executes the composite gate according to its mode and failure policy.

**Example:**
```typescript
const compositeGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "composite-1",
  name: "Composite Gate",
  mode: "parallel",
  failPolicy: "fail_fast",
  children: [
    { type: "simple", id: "child-1", name: "Child 1" },
    { type: "simple", id: "child-2", name: "Child 2" }
  ]
};

const runner = new CompositeGateRunner(compositeGate);
const result = await runner.check();
console.log(`Composite gate result: ${result.passed}`);
```

---

### EventPublisher

Publishes workflow events to the event bus.

#### Constructor

```typescript
constructor(eventBus: IEventBus)
```

**Parameters:**
- `eventBus`: The event bus instance

#### Methods

##### `publish(event: WorkflowEvent): void`

Publishes a workflow event.

**Parameters:**
- `event`: The event to publish

**Example:**
```typescript
const publisher = new EventPublisher(eventBus);
publisher.publish({
  type: "workflow.started",
  instanceId: "instance-1",
  timestamp: new Date(),
  data: { workflowId: "workflow-1" }
});
```

---

## Interfaces

### WorkflowDefinition

Defines a complete workflow.

```typescript
interface WorkflowDefinition {
  schema_version: "1.0";
  id: string;
  displayName: string;
  intent: string;
  stateMachine: StateMachine;
  artifacts: ArtifactDefinition[];
}
```

**Fields:**
- `schema_version`: Version identifier (always "1.0")
- `id`: Unique workflow identifier
- `displayName`: Human-readable workflow name
- `intent`: Description of the workflow's purpose
- `stateMachine`: The state machine definition
- `artifacts`: Optional artifacts (documents, configs, etc.)

### StateMachine

Defines the state machine for a workflow.

```typescript
interface StateMachine {
  schema_version: "1.0";
  initial: string;
  states: Record<string, WorkflowState>;
}
```

**Fields:**
- `schema_version`: Version identifier
- `initial`: ID of the initial state
- `states`: Map of state ID to state definition

### WorkflowState

Defines a single state in the workflow.

```typescript
interface WorkflowState {
  schema_version: "1.0";
  agent: string;
  gate: GateDefinition;
  skills: string[];
  next?: string | Record<string, string>;
}
```

**Fields:**
- `schema_version`: Version identifier
- `agent`: Agent responsible for this state
- `gate`: Gate to execute in this state
- `skills`: Skills available to the agent
- `next`: Next state(s) - can be a single state ID or a map of conditions to state IDs

### GateDefinition

Union type for all gate definitions.

```typescript
type GateDefinition = SimpleGateDefinition | CompositeGateDefinition;
```

### SimpleGateDefinition

Defines a simple (non-composite) gate.

```typescript
interface SimpleGateDefinition {
  schema_version: "1.0";
  type: 'simple';
  id: string;
  name: string;
  checkFn?: () => Promise<GateResult> | GateResult;
}
```

**Fields:**
- `schema_version`: Version identifier
- `type`: Always "simple"
- `id`: Unique gate identifier
- `name`: Human-readable gate name
- `checkFn`: Optional function to execute for the gate check

### CompositeGateDefinition

Defines a composite gate with multiple child gates.

```typescript
interface CompositeGateDefinition {
  schema_version: "1.0";
  type: 'composite';
  id: string;
  name: string;
  mode: CompositeGateMode;
  failPolicy: FailPolicy;
  children: GateDefinition[];
}
```

**Fields:**
- `schema_version`: Version identifier
- `type`: Always "composite"
- `id`: Unique gate identifier
- `name`: Human-readable gate name
- `mode`: Execution mode ("sequential" or "parallel")
- `failPolicy`: Failure policy ("fail_fast" or "collect_all")
- `children`: Array of child gate definitions

### GateResult

Result of a gate execution.

```typescript
interface GateResult {
  schema_version: "1.0";
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}
```

**Fields:**
- `schema_version`: Version identifier
- `passed`: Whether the gate passed
- `reason`: Optional explanation of the result
- `details`: Optional structured metadata

### WorkflowInstance

Represents a running instance of a workflow.

```typescript
interface WorkflowInstance {
  schema_version: "1.0";
  id: string;
  workflowId: string;
  currentState: string;
  status: WorkflowInstanceStatus;
  history: WorkflowEventData[];
  createdAt: Date;
  updatedAt: Date;
}
```

**Fields:**
- `schema_version`: Version identifier
- `id`: Unique instance identifier
- `workflowId`: ID of the workflow definition
- `currentState`: Current state ID
- `status`: Current status (pending, running, paused, completed, failed)
- `history`: Array of events that occurred during execution
- `createdAt`: Instance creation timestamp
- `updatedAt`: Last update timestamp

### WorkflowContext

Context passed to gate execution.

```typescript
interface WorkflowContext {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
}
```

**Fields:**
- `instance`: The workflow instance
- `definition`: The workflow definition

---

## Functions

### createGateRunner

Factory function to create appropriate gate runner for a gate definition.

```typescript
function createGateRunner(
  gate: GateDefinition,
  context?: Record<string, unknown>
): GateRunner
```

**Parameters:**
- `gate`: The gate definition
- `context`: Optional execution context

**Returns:** Appropriate GateRunner instance (SimpleGateRunner or CompositeGateRunner)

**Example:**
```typescript
const gate: GateDefinition = {
  type: "simple",
  id: "gate-1",
  name: "Test Gate"
};

const runner = createGateRunner(gate);
const result = await runner.check();
```

---

## Error Handling

### WorkflowError

Base error class for workflow-related errors.

```typescript
class WorkflowError extends Error {
  constructor(message: string, public code?: string)
}
```

### GateError

Error during gate execution.

```typescript
class GateError extends WorkflowError {
  constructor(message: string, public gateId?: string)
}
```

### Common Error Scenarios

**Invalid Workflow Definition:**
```typescript
try {
  engine.loadWorkflow(invalidDefinition);
} catch (error) {
  if (error instanceof WorkflowError) {
    console.error(`Workflow error: ${error.message}`);
  }
}
```

**Gate Execution Failure:**
```typescript
try {
  const result = await engine.executeGate(gate);
  if (!result.passed) {
    console.log(`Gate failed: ${result.reason}`);
  }
} catch (error) {
  if (error instanceof GateError) {
    console.error(`Gate error: ${error.message}`);
  }
}
```

---

## Event System

### WorkflowEvent

Events emitted during workflow execution.

```typescript
interface WorkflowEvent {
  type: string;
  instanceId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
```

### Event Types

- `workflow.created`: Workflow instance created
- `workflow.started`: Workflow execution started
- `workflow.state_changed`: State transition occurred
- `workflow.gate_started`: Gate execution started
- `workflow.gate_completed`: Gate execution completed
- `workflow.paused`: Workflow paused
- `workflow.resumed`: Workflow resumed
- `workflow.completed`: Workflow execution completed
- `workflow.failed`: Workflow execution failed

### Event Subscription

```typescript
engine.onEvent((event) => {
  switch (event.type) {
    case 'workflow.state_changed':
      console.log(`State changed to: ${event.data?.newState}`);
      break;
    case 'workflow.gate_completed':
      console.log(`Gate result: ${event.data?.result?.passed}`);
      break;
  }
});
```

---

## Type Definitions

### CompositeGateMode

```typescript
type CompositeGateMode = 'sequential' | 'parallel';
```

- `sequential`: Execute child gates one after another
- `parallel`: Execute child gates concurrently

### FailPolicy

```typescript
type FailPolicy = 'fail_fast' | 'collect_all';
```

- `fail_fast`: Stop execution on first failure
- `collect_all`: Execute all gates and collect all failures

### WorkflowInstanceStatus

```typescript
type WorkflowInstanceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
```

---

## Best Practices

1. **Always validate workflow definitions** before loading them
2. **Use event handlers** to monitor workflow execution
3. **Handle errors gracefully** with try-catch blocks
4. **Use composite gates** for complex conditional logic
5. **Leverage parallel execution** for independent gates
6. **Set appropriate timeouts** for long-running gates
7. **Persist workflow state** for recovery from failures

---

## See Also

- [Usage Examples](./EXAMPLES.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [GateResult Documentation](./GateResult.md)
