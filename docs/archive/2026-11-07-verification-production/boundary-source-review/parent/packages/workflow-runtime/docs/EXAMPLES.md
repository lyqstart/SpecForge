# Workflow Runtime Usage Examples

This document provides practical examples of using the Workflow Runtime module.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Simple Workflow](#simple-workflow)
3. [Composite Gates](#composite-gates)
4. [Event Handling](#event-handling)
5. [Error Handling](#error-handling)
6. [Advanced Patterns](#advanced-patterns)

---

## Basic Setup

### Installation

```bash
bun install @specforge/workflow-runtime
```

### Initialization

```typescript
import { WorkflowEngine, EventPublisher } from '@specforge/workflow-runtime';

// Create engine with default configuration
const engine = new WorkflowEngine({
  persistenceDir: './data/workflows'
});

// Optional: Set up event publisher
// const publisher = new EventPublisher(eventBus);
// engine.setEventPublisher(publisher);
```

---

## Simple Workflow

### Example 1: Basic Linear Workflow

A simple workflow with sequential states.

```typescript
import { WorkflowEngine, WorkflowDefinition } from '@specforge/workflow-runtime';

const engine = new WorkflowEngine();

// Define a simple workflow
const workflowDef: WorkflowDefinition = {
  schema_version: "1.0",
  id: "simple-workflow",
  displayName: "Simple Workflow",
  intent: "Execute a basic sequential workflow",
  stateMachine: {
    schema_version: "1.0",
    initial: "start",
    states: {
      start: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-start",
          name: "Start Gate"
        },
        skills: ["skill-1"],
        next: "processing"
      },
      processing: {
        schema_version: "1.0",
        agent: "processor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-process",
          name: "Process Gate"
        },
        skills: ["skill-2"],
        next: "end"
      },
      end: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-end",
          name: "End Gate"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

// Load the workflow
const workflowId = engine.loadWorkflow(workflowDef);
console.log(`Loaded workflow: ${workflowId}`);

// Create an instance
const instance = engine.createInstance(workflowId);
console.log(`Created instance: ${instance.id}`);

// Execute the workflow
try {
  const result = await engine.execute(instance.id);
  console.log(`Workflow completed. Final state: ${result.currentState}`);
  console.log(`Status: ${result.status}`);
} catch (error) {
  console.error(`Workflow failed: ${error.message}`);
}
```

### Example 2: Workflow with Conditional Transitions

A workflow where the next state depends on conditions.

```typescript
const conditionalWorkflow: WorkflowDefinition = {
  schema_version: "1.0",
  id: "conditional-workflow",
  displayName: "Conditional Workflow",
  intent: "Workflow with conditional state transitions",
  stateMachine: {
    schema_version: "1.0",
    initial: "validate",
    states: {
      validate: {
        schema_version: "1.0",
        agent: "validator",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-validate",
          name: "Validation Gate"
        },
        skills: ["validation"],
        next: {
          "valid": "process",
          "invalid": "error_handling"
        }
      },
      process: {
        schema_version: "1.0",
        agent: "processor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-process",
          name: "Process Gate"
        },
        skills: ["processing"],
        next: "complete"
      },
      error_handling: {
        schema_version: "1.0",
        agent: "error_handler",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-error",
          name: "Error Handler Gate"
        },
        skills: ["error_handling"],
        next: "complete"
      },
      complete: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-complete",
          name: "Complete Gate"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const workflowId = engine.loadWorkflow(conditionalWorkflow);
const instance = engine.createInstance(workflowId);

// Manually transition based on validation result
const isValid = true; // Simulate validation result
const nextState = isValid ? "process" : "error_handling";
engine.transition(instance.id, "validate", nextState);

const result = await engine.execute(instance.id);
console.log(`Workflow completed at state: ${result.currentState}`);
```

---

## Composite Gates

### Example 3: Sequential Composite Gate

Execute multiple gates in sequence, stopping on first failure.

```typescript
import { CompositeGateDefinition } from '@specforge/workflow-runtime';

const sequentialCompositeGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "sequential-composite",
  name: "Sequential Validation",
  mode: "sequential",
  failPolicy: "fail_fast",
  children: [
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-1",
      name: "Check Requirements"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-2",
      name: "Check Design"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-3",
      name: "Check Implementation"
    }
  ]
};

const workflowWithSequential: WorkflowDefinition = {
  schema_version: "1.0",
  id: "workflow-sequential",
  displayName: "Workflow with Sequential Gates",
  intent: "Execute gates sequentially",
  stateMachine: {
    schema_version: "1.0",
    initial: "validate",
    states: {
      validate: {
        schema_version: "1.0",
        agent: "validator",
        gate: sequentialCompositeGate,
        skills: ["validation"],
        next: "complete"
      },
      complete: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-complete",
          name: "Complete"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const workflowId = engine.loadWorkflow(workflowWithSequential);
const instance = engine.createInstance(workflowId);
const result = await engine.execute(instance.id);

console.log(`Sequential execution completed: ${result.status}`);
```

### Example 4: Parallel Composite Gate with Fail-Fast

Execute multiple gates in parallel, canceling remaining on first failure.

```typescript
const parallelFailFastGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "parallel-fail-fast",
  name: "Parallel Validation (Fail Fast)",
  mode: "parallel",
  failPolicy: "fail_fast",
  children: [
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-requirements",
      name: "Validate Requirements"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-design",
      name: "Validate Design"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-tests",
      name: "Validate Tests"
    }
  ]
};

const workflowWithParallel: WorkflowDefinition = {
  schema_version: "1.0",
  id: "workflow-parallel",
  displayName: "Workflow with Parallel Gates",
  intent: "Execute gates in parallel",
  stateMachine: {
    schema_version: "1.0",
    initial: "validate",
    states: {
      validate: {
        schema_version: "1.0",
        agent: "validator",
        gate: parallelFailFastGate,
        skills: ["validation"],
        next: "complete"
      },
      complete: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-complete",
          name: "Complete"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const workflowId = engine.loadWorkflow(workflowWithParallel);
const instance = engine.createInstance(workflowId);
const result = await engine.execute(instance.id);

console.log(`Parallel execution completed: ${result.status}`);
if (!result.status.includes('completed')) {
  console.log(`Execution stopped early due to failure`);
}
```

### Example 5: Parallel Composite Gate with Collect-All

Execute all gates in parallel, collecting all failures.

```typescript
const parallelCollectAllGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "parallel-collect-all",
  name: "Parallel Validation (Collect All)",
  mode: "parallel",
  failPolicy: "collect_all",
  children: [
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-lint",
      name: "Lint Check"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-types",
      name: "Type Check"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-tests",
      name: "Test Check"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-coverage",
      name: "Coverage Check"
    }
  ]
};

const workflowWithCollectAll: WorkflowDefinition = {
  schema_version: "1.0",
  id: "workflow-collect-all",
  displayName: "Workflow with Collect-All Gates",
  intent: "Execute all gates and collect failures",
  stateMachine: {
    schema_version: "1.0",
    initial: "validate",
    states: {
      validate: {
        schema_version: "1.0",
        agent: "validator",
        gate: parallelCollectAllGate,
        skills: ["validation"],
        next: "report"
      },
      report: {
        schema_version: "1.0",
        agent: "reporter",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-report",
          name: "Report Results"
        },
        skills: ["reporting"],
        next: "complete"
      },
      complete: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-complete",
          name: "Complete"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const workflowId = engine.loadWorkflow(workflowWithCollectAll);
const instance = engine.createInstance(workflowId);
const result = await engine.execute(instance.id);

console.log(`All validations completed`);
console.log(`Final status: ${result.status}`);
console.log(`Event history: ${result.history.length} events`);
```

---

## Event Handling

### Example 6: Monitoring Workflow Execution

Subscribe to workflow events to monitor execution.

```typescript
const engine = new WorkflowEngine();

// Register event handler
engine.onEvent((event) => {
  console.log(`[${event.timestamp.toISOString()}] ${event.type}`);
  
  switch (event.type) {
    case 'workflow.created':
      console.log(`  Workflow instance created: ${event.instanceId}`);
      break;
    
    case 'workflow.started':
      console.log(`  Workflow execution started`);
      break;
    
    case 'workflow.state_changed':
      console.log(`  State changed to: ${event.data?.newState}`);
      break;
    
    case 'workflow.gate_started':
      console.log(`  Gate started: ${event.data?.gateId}`);
      break;
    
    case 'workflow.gate_completed':
      const gateResult = event.data?.result;
      console.log(`  Gate completed: ${gateResult?.passed ? 'PASSED' : 'FAILED'}`);
      if (gateResult?.reason) {
        console.log(`    Reason: ${gateResult.reason}`);
      }
      break;
    
    case 'workflow.completed':
      console.log(`  Workflow execution completed`);
      break;
    
    case 'workflow.failed':
      console.log(`  Workflow execution failed: ${event.data?.error}`);
      break;
  }
});

// Execute workflow - events will be logged
const workflowId = engine.loadWorkflow(workflowDef);
const instance = engine.createInstance(workflowId);
await engine.execute(instance.id);
```

### Example 7: Custom Event Processing

Process events for custom logic.

```typescript
const eventLog: Array<{ timestamp: Date; type: string; duration?: number }> = [];
let stateChangeTime: Date | null = null;

engine.onEvent((event) => {
  if (event.type === 'workflow.state_changed') {
    stateChangeTime = event.timestamp;
  }
  
  if (event.type === 'workflow.gate_completed') {
    const duration = stateChangeTime 
      ? event.timestamp.getTime() - stateChangeTime.getTime()
      : undefined;
    
    eventLog.push({
      timestamp: event.timestamp,
      type: event.type,
      duration
    });
    
    if (duration && duration > 5000) {
      console.warn(`Slow gate execution: ${duration}ms`);
    }
  }
});

// Execute workflow
const workflowId = engine.loadWorkflow(workflowDef);
const instance = engine.createInstance(workflowId);
await engine.execute(instance.id);

// Analyze performance
console.log(`Total events: ${eventLog.length}`);
const slowGates = eventLog.filter(e => e.duration && e.duration > 5000);
console.log(`Slow gates: ${slowGates.length}`);
```

---

## Error Handling

### Example 8: Handling Workflow Errors

Properly handle errors during workflow execution.

```typescript
import { WorkflowError, GateError } from '@specforge/workflow-runtime';

const engine = new WorkflowEngine();

try {
  const workflowId = engine.loadWorkflow(workflowDef);
  const instance = engine.createInstance(workflowId);
  
  try {
    const result = await engine.execute(instance.id);
    console.log(`Workflow completed: ${result.status}`);
  } catch (error) {
    if (error instanceof GateError) {
      console.error(`Gate execution failed: ${error.message}`);
      console.error(`Gate ID: ${error.gateId}`);
      
      // Attempt recovery
      const currentInstance = engine.getInstance(instance.id);
      if (currentInstance) {
        console.log(`Current state: ${currentInstance.currentState}`);
        // Optionally pause and resume
        engine.pause(instance.id);
        // ... perform recovery actions ...
        await engine.resume(instance.id);
      }
    } else if (error instanceof WorkflowError) {
      console.error(`Workflow error: ${error.message}`);
      console.error(`Error code: ${error.code}`);
    } else {
      console.error(`Unexpected error: ${error}`);
    }
  }
} catch (error) {
  if (error instanceof WorkflowError) {
    console.error(`Failed to load workflow: ${error.message}`);
  }
}
```

### Example 9: Pause and Resume

Handle long-running workflows with pause/resume.

```typescript
const engine = new WorkflowEngine();

const workflowId = engine.loadWorkflow(workflowDef);
const instance = engine.createInstance(workflowId);

// Start execution in background
const executionPromise = engine.execute(instance.id);

// After some time, pause the workflow
setTimeout(() => {
  console.log('Pausing workflow...');
  const paused = engine.pause(instance.id);
  console.log(`Paused at state: ${paused.currentState}`);
  console.log(`Status: ${paused.status}`);
}, 5000);

// Later, resume the workflow
setTimeout(async () => {
  console.log('Resuming workflow...');
  try {
    const resumed = await engine.resume(instance.id);
    console.log(`Resumed from state: ${resumed.currentState}`);
    console.log(`Status: ${resumed.status}`);
  } catch (error) {
    console.error(`Failed to resume: ${error.message}`);
  }
}, 10000);

// Wait for execution to complete
try {
  const result = await executionPromise;
  console.log(`Workflow completed: ${result.status}`);
} catch (error) {
  console.error(`Workflow failed: ${error.message}`);
}
```

---

## Advanced Patterns

### Example 10: Nested Composite Gates

Create composite gates that contain other composite gates.

```typescript
const innerCompositeGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "inner-composite",
  name: "Inner Validation",
  mode: "parallel",
  failPolicy: "collect_all",
  children: [
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-a",
      name: "Check A"
    },
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-b",
      name: "Check B"
    }
  ]
};

const outerCompositeGate: CompositeGateDefinition = {
  schema_version: "1.0",
  type: "composite",
  id: "outer-composite",
  name: "Outer Validation",
  mode: "sequential",
  failPolicy: "fail_fast",
  children: [
    innerCompositeGate,
    {
      schema_version: "1.0",
      type: "simple",
      id: "gate-c",
      name: "Check C"
    }
  ]
};

const workflowWithNested: WorkflowDefinition = {
  schema_version: "1.0",
  id: "workflow-nested",
  displayName: "Workflow with Nested Composite Gates",
  intent: "Execute nested composite gates",
  stateMachine: {
    schema_version: "1.0",
    initial: "validate",
    states: {
      validate: {
        schema_version: "1.0",
        agent: "validator",
        gate: outerCompositeGate,
        skills: ["validation"],
        next: "complete"
      },
      complete: {
        schema_version: "1.0",
        agent: "executor",
        gate: {
          schema_version: "1.0",
          type: "simple",
          id: "gate-complete",
          name: "Complete"
        },
        skills: []
      }
    }
  },
  artifacts: []
};

const workflowId = engine.loadWorkflow(workflowWithNested);
const instance = engine.createInstance(workflowId);
const result = await engine.execute(instance.id);

console.log(`Nested composite gates executed: ${result.status}`);
```

### Example 11: Querying Workflow State

Query and analyze workflow state during execution.

```typescript
const engine = new WorkflowEngine();

const workflowId = engine.loadWorkflow(workflowDef);
const instance = engine.createInstance(workflowId);

// Get all instances
const allInstances = engine.getAllInstances();
console.log(`Total instances: ${allInstances.length}`);

// Get specific instance
const currentInstance = engine.getInstance(instance.id);
if (currentInstance) {
  console.log(`Instance ID: ${currentInstance.id}`);
  console.log(`Workflow ID: ${currentInstance.workflowId}`);
  console.log(`Current State: ${currentInstance.currentState}`);
  console.log(`Status: ${currentInstance.status}`);
  console.log(`Created: ${currentInstance.createdAt}`);
  console.log(`Updated: ${currentInstance.updatedAt}`);
  console.log(`Events: ${currentInstance.history.length}`);
  
  // Analyze event history
  currentInstance.history.forEach((event, index) => {
    console.log(`  [${index}] ${event.type} at ${event.timestamp}`);
  });
}

// Get workflow definition
const workflow = engine.getWorkflow(workflowId);
if (workflow) {
  console.log(`Workflow: ${workflow.displayName}`);
  console.log(`Intent: ${workflow.intent}`);
  console.log(`States: ${Object.keys(workflow.stateMachine.states).join(', ')}`);
}
```

---

## See Also

- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [GateResult Documentation](./GateResult.md)
