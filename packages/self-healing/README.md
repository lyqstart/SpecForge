# Self-Healing Subsystem

The Self-Healing Subsystem implements the automated diagnosis and repair capabilities for SpecForge V6. This module focuses on the **Diagnose phase** (V6.0, P0), with the complete self-healing loop (Propose/Approve/Apply/Verify) deferred to V6.x (P2).

## Overview

### V6.0 Scope

- **Diagnose Phase**: Automated detection, analysis, and diagnosis of issues
- **Safety First**: Strict allowed list of error types, iteration bounds, no automated repairs
- **Observability Integration**: All activities emit events, use CAS for evidence storage
- **Human-in-the-Loop**: V6.0 provides diagnosis reports for manual repair

### Key Features

1. **HealingState Data Model**: Represents the current state of the self-healing system for a work item
2. **State Machine**: Implements `idle → triggered → diagnosing → (idle|blocked)` transitions
3. **Iteration Bound**: Enforces maximum 3 self-healing attempts per work item (Property 25)
4. **Allowed List**: Configurable list of error types that can trigger automatic diagnosis
5. **Diagnosis Analysis**: Structured analysis framework for root cause identification
6. **Risk Tier Classification**: L1/L2/L3 classification of repair actions
7. **Observability Integration**: Event Bus and CAS integration for full traceability

## Installation

```bash
bun install
```

## Usage

### Creating a HealingState

```typescript
import { createHealingState } from '@specforge/self-healing'

const state = createHealingState('work-item-123')
// {
//   schema_version: '1.0',
//   workItemId: 'work-item-123',
//   currentPhase: 'idle',
//   iteration: 1,
//   history: [{ phase: 'idle', enteredAt: <timestamp> }]
// }
```

### State Transitions

```typescript
import { transitionHealingState } from '@specforge/self-healing'

// Transition to triggered
let state = transitionHealingState(state, 'triggered', 'user_request')

// Transition to diagnosing
state = transitionHealingState(state, 'diagnosing', 'analysis_started')

// Transition back to idle
state = transitionHealingState(state, 'idle', 'analysis_complete')
```

### Serialization

```typescript
import { serializeHealingState, deserializeHealingState } from '@specforge/self-healing'

// Serialize to JSON
const json = serializeHealingState(state)

// Deserialize from JSON
const restored = deserializeHealingState(json)
```

### Querying State

```typescript
import { 
  getCurrentPhase, 
  isBlocked, 
  hasReachedIterationLimit,
  getLastHistoryEntry 
} from '@specforge/self-healing'

const phase = getCurrentPhase(state)
const blocked = isBlocked(state)
const limitReached = hasReachedIterationLimit(state)
const lastEntry = getLastHistoryEntry(state)
```

## Data Models

### HealingState

Represents the current state of the self-healing system for a work item.

```typescript
interface HealingState {
  schema_version: '1.0'
  workItemId: string
  currentPhase: HealingPhase
  iteration: number  // 1-3, enforced by Property 25
  history: HealingStateHistoryEntry[]
  blocked?: BlockedStateDetails
}
```

### HealingPhase

```typescript
type HealingPhase = 
  | 'idle'
  | 'triggered'
  | 'diagnosing'
  | 'proposing'      // P2 stub
  | 'approving'      // P2 stub
  | 'applying'       // P2 stub
  | 'verifying'      // P2 stub
  | 'blocked'
```

## Invariants

1. **schema_version**: Must be '1.0' for V6.0
2. **iteration**: Must be between 1 and 3 (Property 25)
3. **currentPhase**: Must be a valid HealingPhase
4. **history**: Must be non-empty (at least one entry)
5. **blocked**: Must be present if currentPhase is 'blocked'

## Property 25: Healing Iteration Bound

The self-healing system enforces a maximum of 3 healing attempts per work item:

- **Iteration 1**: Initial state
- **Iteration 2**: First healing attempt
- **Iteration 3**: Second healing attempt
- **4th Attempt**: Blocked with `iteration_limit_exceeded` reason

```typescript
// After 3 attempts, further attempts are blocked
state = transitionHealingState(state, 'triggered', 'attempt_1')  // iteration: 2
state = transitionHealingState(state, 'idle')
state = transitionHealingState(state, 'triggered', 'attempt_2')  // iteration: 3
state = transitionHealingState(state, 'idle')
state = transitionHealingState(state, 'triggered', 'attempt_3')  // blocked!
// state.currentPhase === 'blocked'
// state.blocked.reason === 'iteration_limit_exceeded'
```

## Testing

### Run All Tests

```bash
bun test
```

### Run Tests in Watch Mode

```bash
bun run test:watch
```

### Run Tests with Coverage

```bash
bun run test:coverage
```

## Development

### Build

```bash
bun run build
```

### Watch Mode

```bash
bun run watch
```

### Linting

```bash
bun run lint
bun run lint:fix
```

### Formatting

```bash
bun run format
bun run format:check
```

## Architecture

### State Machine (V6.0)

```
idle → triggered → diagnosing → (idle | blocked)
```

**V6.0 Transitions**:
- `idle → triggered`: Gate failure (error type in allowed list) OR user `specforge heal` command
- `triggered → diagnosing`: Validation passes, begin diagnosis analysis
- `diagnosing → blocked`: Error type not allowed, requires external resources, or destructive operation
- `diagnosing → idle`: Diagnosis complete, report generated and stored

**P2 Stub Transitions** (not implemented in V6.0):
- `diagnosing → proposing`: Generate repair plan
- `proposing → approving`: Obtain approval
- `approving → applying`: Apply changes
- `applying → verifying`: Verify repair success
- `verifying → idle`: Success, cleanup
- `verifying → applying`: Failure, rollback and retry

### Integration Points

1. **Event Bus**: All healing activities emit events for observability
2. **CAS**: Large evidence collections and diagnosis reports use CAS blob references
3. **sf-analyst**: Complex diagnosis scenarios delegate to sf-analyst
4. **CLI**: User interface via `specforge heal` command family
5. **Configuration System**: Allowed list and risk tier rules use three-layer configuration

## Requirements

This module implements the following requirements from the Self-Healing Subsystem specification:

- **SH-1**: Self-Healing State Machine (Diagnose Phase Only)
- **SH-2**: Self-Healing Allowed List
- **SH-3**: Diagnosis Analysis Framework
- **SH-4**: Risk Tier Classification
- **SH-5**: Integration with Observability

## Properties

This module implements the following Correctness Properties:

- **Property 24**: Healing Rollback Precondition (P2 preparation)
- **Property 25**: Healing Iteration Bound (V6.0 implementation)

## License

MIT
