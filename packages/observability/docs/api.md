# API Reference: Observability Module

## Overview

The `@specforge/observability` module provides comprehensive monitoring, logging, and analysis capabilities for SpecForge V6. This document covers the complete API for all public interfaces.

**North Star Goal**: "5 minutes from problem occurrence to root cause identification" across 10 troubleshooting scenarios.

---

## Table of Contents

1. [Event Bus](#event-bus)
2. [CAS (Content-Addressable Storage)](#cas-content-addressable-storage)
3. [Event Logger](#event-logger)
4. [Query API](#query-api)
5. [Analyst Engine](#analyst-engine)
6. [sf-analyst Agent](#sf-analyst-agent)
7. [Mode Switch](#mode-switch)
8. [Types](#types)

---

## Event Bus

The Event Bus implements **Property 2**: All cross-layer communication must pass through the Event Bus.

### Class: `EventBus`

```typescript
import { EventBus } from '@specforge/observability';

const eventBus = new EventBus();
```

#### Methods

##### `emit(eventData): Promise<void>`

Emit an event through the Event Bus. Events are filtered based on the current mode.

```typescript
await eventBus.emit({
  category: 'workflow',
  action: 'workflow.started',
  projectId: 'project-123',
  workItemId: 'workitem-456',
  payload: { workflowName: 'my-workflow' }
});
```

**Parameters**:
- `eventData`: `Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'>`

**Behavior**:
- Automatically generates `eventId` (UUIDv7), `ts` (monotonic timestamp), and `monotonicSeq`
- Applies mode filtering (minimal/standard/deep)
- Notifies all subscribers

##### `subscribe(pattern): AsyncIterable<Event>`

Subscribe to events matching a pattern. Uses wildcard matching.

```typescript
// Subscribe to all workflow events
for await (const event of eventBus.subscribe('workflow.*')) {
  console.log(event.action, event.payload);
}

// Subscribe to specific action
for await (const event of eventBus.subscribe('permission.evaluated')) {
  console.log('Permission decision:', event.payload);
}
```

**Pattern Format**: `category.action` with wildcards (`*`)
- `workflow.*` - All workflow events
- `*.started` - All "started" events
- `permission.evaluated` - Specific action

##### `getMode(): ObservabilityMode`

Get the current observability mode.

```typescript
const mode = eventBus.getMode(); // 'minimal' | 'standard' | 'deep'
```

##### `setMode(mode): void`

Set the observability mode at runtime.

```typescript
eventBus.setMode('deep'); // Enable deep mode for debugging
```

---

## CAS (Content-Addressable Storage)

CAS implements **Property 9**: Content addressing with SHA-256 hash.

### Class: `CAS`

```typescript
import { CAS } from '@specforge/observability';

const cas = new CAS('./data/cas/blobs');
await cas.initialize();
```

#### Methods

##### `store(content): Promise<string>`

Store content and return a blob reference. The reference format is `blob://<sha256>`.

```typescript
// Store text content
const textRef = await cas.store('Hello, World!');

// Store binary content
const binaryData = new Uint8Array([1, 2, 3, 4]);
const binaryRef = await cas.store(binaryData);

// Both return blob references:
// textRef: "blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
// binaryRef: "blob://..."
```

**Property 9 Compliance**:
- `store(content).id === "blob://" + sha256(content)`
- Identical content produces identical IDs (deduplication)

##### `retrieve(ref): Promise<Uint8Array | string | null>`

Retrieve content from CAS.

```typescript
const content = await cas.retrieve('blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');

if (content !== null) {
  if (typeof content === 'string') {
    console.log('Text content:', content);
  } else {
    console.log('Binary content:', content);
  }
}
```

##### `exists(ref): Promise<boolean>`

Check if a blob exists.

```typescript
const exists = await cas.exists('blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
```

##### `delete(ref): Promise<void>`

Delete a blob reference. Uses reference counting - actual blob is deleted when count reaches 0.

```typescript
await cas.delete('blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
```

#### Utility Functions

##### `createCAS(basePath?): CAS`

Create a CAS instance with default configuration.

```typescript
const cas = createCAS('./custom/path');
```

---

## Event Logger

Event Logger implements WAL (Write-Ahead Log) semantics and **Property 8** (serialization round-trip).

### Class: `EventLogger`

```typescript
import { EventLogger } from '@specforge/observability';

const eventLogger = new EventLogger('./data/observability');
await eventLogger.initialize();
```

#### Methods

##### `append(event): Promise<void>`

Append an event to the WAL with fsync.

```typescript
const event: Event = {
  schema_version: '1.0',
  eventId: '...',
  ts: Date.now() * 1000000, // nanoseconds
  monotonicSeq: 1,
  projectId: 'project-123',
  workItemId: 'workitem-456',
  actor: { id: 'agent-1', name: 'sf-planner', type: 'agent' },
  category: 'workflow',
  action: 'workflow.started',
  payload: { workflowName: 'test' }
};

await eventLogger.append(event);
```

**WAL Semantics**:
1. Write event to `events.jsonl`
2. Fsync to ensure data is persisted
3. Update lastEventId only after successful fsync
4. Update project index

##### `getEvents(filter?): AsyncIterable<Event>`

Get events with optional filtering.

```typescript
// Get all events
for await (const event of eventLogger.getEvents()) {
  console.log(event.action);
}

// Filter by category
for await (const event of eventLogger.getEvents({ category: 'workflow' })) {
  console.log(event.action);
}

// Filter with multiple criteria
for await (const event of eventLogger.getEvents({
  projectId: 'project-123',
  startTs: Date.now() - 3600000, // Last hour (nanoseconds)
  endTs: Date.now(),
  action: 'workflow.started',
  limit: 100
})) {
  console.log(event);
}
```

**Filter Options**:
| Field | Type | Description |
|-------|------|-------------|
| `projectId` | string | Filter by project |
| `workItemId` | string | Filter by work item |
| `category` | EventCategory | Filter by category |
| `action` | string | Filter by action (partial match) |
| `startTs` | number | Start timestamp (nanoseconds) |
| `endTs` | number | End timestamp (nanoseconds) |
| `actor` | Partial\<AgentIdentity\> | Filter by actor |
| `limit` | number | Maximum events to return |

##### `getEventsAcrossAllProjects(filter?): Promise<Event[]>`

Query events across all projects.

```typescript
const events = await eventLogger.getEventsAcrossAllProjects({
  category: 'permission'
});
```

##### `rebuildState(): Promise<...>`

Rebuild derived state from events.jsonl for fast startup after crash.

```typescript
const state = await eventLogger.rebuildState();
console.log(state.eventCount, state.lastEventId);
```

##### `getKnownProjects(): Promise<string[]>`

Get list of all project IDs with events.

```typescript
const projects = await eventLogger.getKnownProjects();
```

##### `getProjectStats(projectId): Promise<...>`

Get statistics for a specific project.

```typescript
const stats = await eventLogger.getProjectStats('project-123');
// Returns: { eventCount, firstEventTs, lastEventTs }
```

##### `getLastEventId(): string | null`

Get the last event ID.

##### `getEventCount(): number`

Get total event count.

#### Serialization (Property 8)

```typescript
const event: Event = /* ... */;

// Serialize
const json = EventLogger.serialize(event);

// Deserialize
const restored = EventLogger.deserialize(json);

// Verify round-trip
const isValid = EventLogger.verifySerializationRoundTrip(event);
```

---

## Query API

Query API provides structured access to observability data with support for multi-project queries.

### Class: `QueryAPI`

```typescript
import { QueryAPI } from '@specforge/observability';

const queryAPI = new QueryAPI({
  eventLogger,
  cas,
  maxEventsPerQuery: 1000
});
```

#### Methods

##### `queryEvents(filter, options?): Promise<PaginatedResult<Event>>`

Query events with pagination.

```typescript
const result = await queryAPI.queryEvents(
  { category: 'workflow', startTs: Date.now() - 3600000 },
  { page: 0, pageSize: 50, sortOrder: 'desc' }
);

console.log(result.items.length);
console.log(result.hasMore); // true/false
```

##### `queryEventsSync(filter): Promise<Event[]>`

Simple synchronous query without pagination.

```typescript
const events = await queryAPI.queryEventsSync({ category: 'permission' });
```

##### `queryEventsCrossProject(filter, options?): Promise<MultiProjectQueryResult>`

Query events across all projects with project statistics.

```typescript
const result = await queryAPI.queryEventsCrossProject(
  { action: 'workflow.started' },
  { pageSize: 100 }
);

console.log(result.totalProjects);
console.log(result.projects); // [{ projectId, eventCount }, ...]
```

##### `analyzeScenario(scenario, timeRange): Promise<AnalysisResult>`

Analyze a North Star troubleshooting scenario.

```typescript
const result = await queryAPI.analyzeScenario('gate-repeated-failure', {
  start: Date.now() - 3600000,
  end: Date.now()
});

console.log(result.rootCause);
console.log(result.confidence);
console.log(result.recommendations);
```

**Supported Scenarios**:
- `gate-repeated-failure`
- `agent-deviation`
- `tool-invocation-error`
- `permission-denial`
- `upgrade-installation-failure`
- `state-machine-stuck`
- `concurrency-deadlock`
- `skill-invocation-check`
- `workflow-execution-check`
- `workflow-result-deviation`

##### `getPermissionTrace(decisionId): Promise<PermissionTrace>`

Get complete traceability for a permission decision (**Property 10**).

```typescript
const trace = await queryAPI.getPermissionTrace('event-id-here');

console.log(trace.decision.payload.matched_rule);
console.log(trace.decision.payload.rule_layer);
console.log(trace.relatedEvents);
```

##### `getBlobContent(ref): Promise<Uint8Array | string | null>`

Get blob content from CAS.

```typescript
const content = await queryAPI.getBlobContent('blob://...');
```

##### `setProjectMode(projectId, mode): void`

Set observability mode for a specific project.

```typescript
queryAPI.setProjectMode('project-123', 'deep');
```

##### `getProjectMode(projectId): ObservabilityMode`

Get observability mode for a project.

```typescript
const mode = queryAPI.getProjectMode('project-123');
```

##### `getStats(): Promise<...>`

Get event statistics.

```typescript
const stats = await queryAPI.getStats();
// { eventCount, lastEventId, categories }
```

---

## Analyst Engine

Analyst Engine provides scenario-specific analysis logic for the sf-analyst agent.

### Class: `AnalystEngine`

```typescript
import { AnalystEngine } from '@specforge/observability';

const engine = new AnalystEngine();
```

#### Methods

Each method analyzes a specific North Star scenario:

```typescript
// Scenario 1: Gate repeated failures
await engine.analyzeGateFailures('workitem-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 2: Agent deviation
await engine.analyzeAgentDeviation('session-123');

// Scenario 3: Tool invocation errors
await engine.analyzeToolErrors('tool-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 4: Permission denials
await engine.analyzePermissionDenials('project-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 5: Upgrade/installation failures
await engine.analyzeUpgradeFailures('project-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 6: State machine stuck
await engine.analyzeStateMachineStuck('workitem-123');

// Scenario 7: Concurrency deadlocks
await engine.analyzeConcurrencyDeadlocks('project-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 8: Skill invocation check
await engine.analyzeSkillInvocation('skill-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 9: Workflow execution check
await engine.analyzeWorkflowExecution('workflow-123', { start: Date.now() - 3600000, end: Date.now() });

// Scenario 10: Workflow result deviation
await engine.analyzeWorkflowResultDeviation('workitem-123');
```

---

## sf-analyst Agent

sf-analyst provides integration for the built-in sf-analyst agent.

### Class: `SfAnalyst`

```typescript
import { SfAnalyst, createSfAnalyst } from '@specforge/observability';

const analyst = createSfAnalyst({
  eventLogger,
  cas,
  maxConcurrent: 3,
  defaultTimeoutMs: 60000
});
```

#### Methods

##### `getDataAccess(): AnalystDataAccess`

Get read-only data access interface.

```typescript
const dataAccess = analyst.getDataAccess();

const events = await dataAccess.queryEvents({ category: 'workflow' });
const stats = await dataAccess.getStats();
const trace = await dataAccess.getPermissionTrace('event-id');
```

##### `executeAnalysis(request): Promise<AnalysisReport>`

Execute analysis synchronously.

```typescript
const report = await analyst.executeAnalysis({
  requestId: 'req-123',
  scenario: 'gate-repeated-failure',
  timeRange: { start: Date.now() - 3600000, end: Date.now() },
  workItemId: 'workitem-123'
});

console.log(report.result.rootCause);
console.log(report.analysisTimeMs);
```

##### `scheduleAnalysis(request): string`

Schedule analysis for asynchronous execution.

```typescript
const requestId = analyst.scheduleAnalysis({
  requestId: 'req-123',
  scenario: 'permission-denial',
  timeRange: { start: Date.now() - 3600000, end: Date.now() },
  priority: 5,
  onComplete: (result) => console.log('Done:', result),
  onError: (error) => console.error('Error:', error)
});
```

##### `getScheduledAnalysis(requestId): ScheduledAnalysis | undefined`

Get scheduled analysis status.

##### `getReport(reportId): AnalysisReport | undefined`

Get completed report.

##### `formatResult(result): {...}`

Format analysis result for user display.

```typescript
const formatted = analyst.formatResult(result);
// { summary, details, recommendations, confidence }
```

##### `getQueueStatus(): {...}`

Get analysis queue status.

```typescript
const status = analyst.getQueueStatus();
// { pending, running, completed, failed }
```

##### `cancelAnalysis(requestId): boolean`

Cancel a pending analysis.

---

## Mode Switch

Mode Switch provides three-tier observability mode configuration.

### Class: `ModeSwitch`

```typescript
import { ModeSwitch } from '@specforge/observability';

const modeSwitch = new ModeSwitch();
```

#### Methods

##### `getMode(): ObservabilityMode`

Get current mode.

##### `setMode(mode): void`

Set mode.

```typescript
modeSwitch.setMode('minimal');
```

##### `shouldRecordEvent(event): boolean`

Check if event should be recorded in current mode.

##### `shouldIncludePayload(event): boolean`

Check if payload should be included in current mode.

---

## Types

### Core Types

```typescript
// Three-tier mode
type ObservabilityMode = 'minimal' | 'standard' | 'deep';

// Event categories
type EventCategory = 
  | 'workflow'
  | 'gate'
  | 'permission'
  | 'session'
  | 'tool'
  | 'heal'
  | 'modality'
  | 'migration'
  | 'system';

// Event interface (Property 30)
interface Event {
  schema_version: '1.0';
  eventId: string;           // UUIDv7
  ts: number;                // Monotonic timestamp (nanoseconds)
  monotonicSeq: number;      // Process-internal sequence
  projectId: string;         // SHA-256 of project path
  workItemId: string | null;
  actor: AgentIdentity | null;
  category: EventCategory;
  action: string;
  payload?: unknown;
  payloadBlobRef?: string;   // "blob://<sha256>" for >64KiB
}

// Agent identity
interface AgentIdentity {
  id: string;
  name: string;
  type: string;
}

// Event filter
interface EventFilter {
  projectId?: string;
  workItemId?: string;
  category?: EventCategory;
  action?: string;
  actor?: Partial<AgentIdentity>;
  startTs?: number;
  endTs?: number;
  limit?: number;
}

// Time range
interface TimeRange {
  start: number;  // milliseconds
  end: number;    // milliseconds
}
```

### North Star Scenarios

```typescript
type NorthStarScenario =
  | 'gate-repeated-failure'
  | 'agent-deviation'
  | 'tool-invocation-error'
  | 'permission-denial'
  | 'upgrade-installation-failure'
  | 'state-machine-stuck'
  | 'concurrency-deadlock'
  | 'skill-invocation-check'
  | 'workflow-execution-check'
  | 'workflow-result-deviation';
```

### Analysis Types

```typescript
interface AnalysisResult {
  scenario: NorthStarScenario;
  rootCause: string | null;
  confidence: number;      // 0-1
  evidence: Event[];
  recommendations: string[];
  timeToIdentify: number;  // milliseconds
}

interface PermissionTrace {
  decision: PermissionDecisionEvent;
  rule: unknown;
  context: Record<string, unknown>;
  relatedEvents: Event[];
}

interface PermissionDecisionEvent extends Event {
  category: 'permission';
  action: 'permission.evaluated';
  payload: {
    actor: AgentIdentity;
    action: string;
    resource: { type: string; id: string };
    matched_rule: string;
    rule_layer: 'hard' | 'builtin' | 'user';
    reason: string;
    effect: 'allow' | 'deny';
  };
}
```

---

## Property Compliance

This module implements the following Correctness Properties:

| Property | Description | Implementation |
|----------|-------------|----------------|
| Property 2 | Event Bus Traversal | All cross-layer communication via EventBus |
| Property 8 | Serialization Round-trip | EventLogger.serialize/deserialize |
| Property 9 | CAS Content Addressing | CAS.store returns `blob://sha256(content)` |
| Property 10 | Permission Decision Traceability | getPermissionTrace provides full audit trail |
| Property 30 | Event Schema Multi-sync | UUIDv7, monotonic ts, projectId aggregation |

---

## Usage Example

Complete example combining all components:

```typescript
import { 
  EventBus, 
  CAS, 
  EventLogger, 
  QueryAPI, 
  createSfAnalyst 
} from '@specforge/observability';

// Initialize components
const eventBus = new EventBus();
const cas = new CAS('./data/cas');
await cas.initialize();

const eventLogger = new EventLogger('./data/observability');
await eventLogger.initialize();

const queryAPI = new QueryAPI({ eventLogger, cas });

// Integrate EventBus with EventLogger (for persistence)
eventBus.subscribe('*').then(async (events) => {
  for await (const event of events) {
    await eventLogger.append(event);
  }
});

// Emit an event
await eventBus.emit({
  category: 'workflow',
  action: 'workflow.started',
  projectId: 'project-123',
  workItemId: 'workitem-456',
  payload: { workflowName: 'test' }
});

// Query events
const events = await queryAPI.queryEventsSync({
  projectId: 'project-123',
  category: 'workflow'
});

// Analyze scenario
const analysis = await queryAPI.analyzeScenario('gate-repeated-failure', {
  start: Date.now() - 3600000,
  end: Date.now()
});

console.log(analysis.rootCause);
console.log(analysis.recommendations);
```

---

## Error Handling

All async methods may throw errors. It's recommended to use try-catch:

```typescript
try {
  const content = await cas.retrieve('blob://...');
  if (content === null) {
    console.log('Blob not found');
  }
} catch (error) {
  console.error('CAS error:', error);
}
```

---

## Performance Notes

- Event logging overhead: < 5ms per event
- Standard mode events.jsonl: < 1GB per day
- CAS uses reference counting for garbage collection
- Query API supports pagination for large result sets
- Project indices are cached in memory for fast queries