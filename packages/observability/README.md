# @specforge/observability

Observability module for SpecForge V6 - Comprehensive monitoring, logging, and analysis capabilities.

## Overview

The Observability subsystem is a **first-class component** that provides comprehensive monitoring, logging, and analysis capabilities to achieve the North Star goal: "5 minutes from problem occurrence to root cause identification."

## Features

- **Three-Tier Observability Mode**: Minimal, Standard (default), and Deep modes for varying resource constraints
- **Event Bus Integration**: All cross-layer communication captured via Event Bus (Property 2)
- **CAS (Content-Addressable Storage)**: SHA-256 addressed blob storage for large payloads (Property 9)
- **Event Logger with WAL Semantics**: Crash-safe event persistence with fsync guarantees
- **Query API**: Structured access to observability data with filtering and aggregation
- **Analyst Engine**: Core logic for sf-analyst agent with North Star scenario analysis
- **Permission Decision Traceability**: Complete audit trail for all permission decisions (Property 10)
- **Multi-sync Ready Event Schema**: Forward-compatible event schema for future synchronization (Property 30)

## Installation

```bash
bun install @specforge/observability
```

## Usage

```typescript
import { EventBus, CAS, EventLogger, QueryAPI } from '@specforge/observability';

// Initialize observability components
const eventBus = new EventBus();
const cas = new CAS();
const eventLogger = new EventLogger({ eventBus, cas });
const queryAPI = new QueryAPI({ eventLogger, cas });

// Emit events
await eventBus.emit({
  category: 'workflow',
  action: 'workflow.started',
  projectId: 'project-123',
  workItemId: 'workitem-456',
  payload: { workflowName: 'test-workflow' }
});

// Query events
const events = await queryAPI.queryEvents({
  projectId: 'project-123',
  category: 'workflow',
  startTs: Date.now() - 3600000 // Last hour
});
```

## Three-Tier Mode

### Minimal Mode
- Records only decision events (Gate passes/fails, Permission allow/deny, Workflow transitions)
- Event payloads limited to essential metadata
- Designed for low-resource environments and CI pipelines

### Standard Mode (Default)
- Records all events across all components
- Excludes large payloads (> 64 KiB) - stored as CAS blob references
- Balanced detail level for daily development use

### Deep Mode
- Records all events with full payloads
- Large payloads stored as CAS blob references with content preserved
- Used for post-mortem analysis and complex debugging

## Event Schema

```typescript
interface Event {
  schema_version: "1.0";
  eventId: string;                 // UUIDv7 (globally unique, time-ordered)
  ts: number;                      // Monotonic timestamp (nanoseconds)
  monotonicSeq: number;            // Process-internal sequence for same-ts ordering
  projectId: string;               // SHA-256 of project root path (truncated)
  workItemId: string | null;
  actor: AgentIdentity | null;
  category: "workflow" | "gate" | "permission" | "session" | "tool" | "heal" | "modality" | "migration" | "system";
  action: string;                  // e.g., "workflow.started", "permission.evaluated"
  payload?: unknown;
  payloadBlobRef?: string;         // "blob://<sha256>" for payloads > 64 KiB
}
```

## North Star Goal

The Observability subsystem enables the North Star goal: "5 minutes from problem occurrence to root cause identification" across 10 troubleshooting scenarios:

1. Gate repeated fails (Gate repeatedly fails)
2. Agent deviates from prompt (Agent deviates from prompt)
3. Tool invocation errors (Tool invocation errors)
4. Permission denials (Permission denials)
5. Upgrade/installation failures (Upgrade/installation failures)
6. State machine stuck (State machine stuck)
7. Concurrency deadlocks (Concurrency deadlocks)
8. Skill invocation check (Whether Skill was invoked)
9. Workflow execution check (Whether Workflow executed as expected)
10. Workflow result deviation (Workflow execution results deviate from expectations)

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[API Reference](docs/api.md)** - Complete API documentation for all modules
- **[User Guide](docs/user-guide.md)** - Three-tier mode configuration and usage
- **[North Star Scenarios](docs/north-star-scenarios.md)** - Analysis guide for all 10 scenarios
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## Examples

The `examples/` directory contains runnable integration examples:

- **[basic-usage.ts](examples/basic-usage.ts)** - Getting started with Event Bus, CAS, Event Logger, Query API, and Analyst Engine
- **[integration-event-bus.ts](examples/integration-event-bus.ts)** - How to integrate a new component with the Event Bus
- **[integration-query-api.ts](examples/integration-query-api.ts)** - Using Query API for custom analysis and dashboards
- **[integration-north-star.ts](examples/integration-north-star.ts)** - Implementing custom North Star troubleshooting scenarios
- **[integration-cas.ts](examples/integration-cas.ts)** - CAS integration for large payloads and mode-aware handling

Run examples with:

```bash
bun run examples/basic-usage.ts
bun run examples/integration-event-bus.ts
bun run examples/integration-query-api.ts
bun run examples/integration-north-star.ts
bun run examples/integration-cas.ts
```

## Development

```bash
# Install dependencies
bun install

# Build the module
bun run build

# Run tests
bun run test

# Run property-based tests
bun run test:property

# Run unit tests
bun run test:unit

# Run integration tests
bun run test:integration

# Lint code
bun run lint

# Format code
bun run format

# Development mode (watch mode)
bun run dev
```

## Testing Strategy

### Property-Based Tests
- Property 2: Event Bus Traversal
- Property 8: Serialization Round-trip
- Property 9: CAS Content Addressing
- Property 10: Permission Decision Traceability
- Property 30: Event Schema Multi-sync Readiness

### Unit Tests
- Three-tier mode switching and filtering
- Event Bus message routing and delivery
- CAS blob storage and retrieval
- Event Logger WAL semantics and fsync
- Query API filtering and aggregation
- Analyst Engine scenario analysis

### Integration Tests
- End-to-end observability pipeline
- Mode behavior under different workloads
- Crash recovery with WAL reconstruction
- Multi-project observability isolation
- sf-analyst integration and analysis generation
- Permission decision traceability workflow

## Dependencies

- `@specforge/types`: Shared TypeScript types
- `@specforge/daemon-core`: Project context and state management
- `@specforge/permission-engine`: Permission decision events
- `uuid`: UUIDv7 generation for event IDs

## License

MIT