# Requirements Document: Daemon Core

## Introduction

This specification defines the **Daemon Core** module for SpecForge V6. The Daemon Core is the central process that serves as the **Single Source of Truth** for the entire V6 architecture, maintaining all authoritative state, managing sessions, and enforcing architectural invariants.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 1: Single Source of Truth
*For all* state change paths P, if P changes V6's authoritative state, THEN P must pass through Daemon's HTTP API or internal Tool calls, and produce an event written to events.jsonl; there must be no authoritative state write paths that bypass the Daemon.

**Validates: Requirements 30.1, 1.1, 4.1**

### Property 2: Event Bus Traversal  
*For all* cross-layer communication messages m, m must pass through the Event Bus; there must be no direct function calls that cross observability boundaries.

**Validates: Requirements 30.2**

### Property 5: Session Identity Stability
*For all* events e arriving at the Daemon and their associated `sessionId` s, the AgentIdentity obtained via `SessionRegistry.lookupBySessionId(s)` must remain consistent throughout the session lifecycle; the Daemon must not rely on the `agent` field in OpenCode Plugin Hook inputs as an identity key.

**Validates: Requirements 30.5, 6.1, 6.5**

### Property 6: Idempotent Recovery
*For all* consistent event streams E, `rebuild(E) == rebuild(E)`, and executing `rebuild(E)` on different machines or at different times must produce ProjectState with identical byte order (excluding observational fields like `lastEventTs`).

**Validates: Requirements 30.6, 6.6, 12.2**

### Property 7: WAL Ordering
*For all* state change write paths W, W must first complete "event append + fsync to events.jsonl" before updating state.json. Any write path where "state.json is persisted before events.jsonl fsync" constitutes an architectural violation.

**Validates: Requirements 30.7, 12.1**

### Property 20: Recovery Consistency Repair
*For all* inconsistent (events.jsonl, state.json) combinations detected at startup, the Migration/Recovery subsystem must roll back to a consistent snapshot s' according to predefined repair rules, and write a `recovery.repaired` event recording the repair path; after repair, `rebuild(events) == s'` must hold.

**Validates: Requirements 12.3**

### Property 21: Session WAL Replay Scope
*For all* Daemon runtime event streams, WAL-replay-based session state reconstruction may only occur within the Daemon startup process; after startup completes, the Daemon must not automatically initiate session state reconstruction via WAL replay.

**Validates: Requirements 12.4, 12.5**

### Property 22: Project Isolation
*For all* two different projects P1 ≠ P2 and any operations (op1 on P1, op2 on P2), op1's writes to events/state must not reach P2's events.jsonl/state.json; op1 and op2 must not block each other. Concurrent writes on the same project are serialized by a per-project write lock.

**Validates: Requirements 13.1, 13.2, 13.3, 13.4**

### Property 30: Event Schema Multi-sync Readiness
*For all* events e written to events.jsonl, `e.eventId` must be globally unique (UUIDv7 or equivalent), `e.ts` must be monotonically non-decreasing within a single machine, `e.projectId` must be non-empty and aggregatable by project dimension; this schema must remain forward-compatible for future multi-machine synchronization.

**Validates: Requirements 19.2**

## Requirements

### Requirement 1: Daemon Process Model Implementation

**User Story:** As a system architect, I want the Daemon process model from REQ-4 to be fully implemented, so that the V6 architecture has a stable, single-instance central authority.

#### Acceptance Criteria

1. THE Daemon_Core SHALL enforce that only one Daemon instance runs on a machine at any time.
2. THE Daemon_Core SHALL support maintaining multiple project contexts within a single instance.
3. THE Daemon_Core SHALL implement the three startup modes from REQ-4.2:
   - Thin Plugin on-demand startup (when OpenCode starts and no Daemon is running)
   - CLI startup (when `specforge` command is first used)
   - Manual startup (`specforge daemon start --detach`)
4. WHEN OpenCode process closes and Daemon was started by Thin Plugin or CLI, THE Daemon_Core SHALL automatically exit after 30 seconds of idle time.
5. WHERE Daemon is started via `specforge daemon start --detach`, THE Daemon_Core SHALL ignore the 30-second idle exit rule and continue running until explicit `specforge daemon stop`.
6. THE Daemon_Core SHALL support headless OpenCode mode for Telegram/OpenClaw scenarios.

### Requirement 2: Communication Protocol Implementation

**User Story:** As a client developer, I want the Daemon to implement the HTTP/1.1 + SSE protocol from REQ-5, so that all clients (CLI, Thin Plugin, future Web UI) can communicate with a consistent contract.

#### Acceptance Criteria

1. THE Daemon_Core SHALL implement HTTP/1.1 + SSE as its external communication protocol.
2. THE Daemon_Core SHALL listen on dynamic ports on 127.0.0.1.
3. WHEN Daemon starts successfully, THE Daemon_Core SHALL write a handshake file to `~/.specforge/runtime/daemon.sock.json` containing at least `pid`, `port`, `token` fields with file permissions `0600`.
4. WHEN clients send HTTP requests to Daemon, THE Daemon_Core SHALL require valid `Authorization: Bearer <token>` header matching the handshake file token.
5. IF HTTP request lacks valid Bearer Token, THEN THE Daemon_Core SHALL return HTTP 401 and record a permission denied event.
6. WHERE request or response bodies contain content > 64 KiB, THE Daemon_Core SHALL use CAS blob references (`blob://<sha256>`) instead of inline data.
7. THE Daemon_Core SHALL allow future Web UI to reuse the same HTTP port without introducing a second listening port.

### Requirement 3: Session Registry Implementation

**User Story:** As an observability and permission system, I want a stable Session Registry from REQ-6, so that all events and permissions can be accurately attributed to specific agent sessions.

#### Acceptance Criteria

1. THE Daemon_Core SHALL implement Session Registry with "pre-registration + first-contact binding" strategy: Daemon generates `spawnIntentId` and registers pending record, Thin Plugin/Adapter binds real `sessionId` on first event arrival.
2. THE Daemon_Core SHALL maintain three record types: `pending`, `active`, `history`.
3. THE Daemon_Core SHALL define AgentIdentity structure with at least: `sessionId`, `agentRole`, `workflowRole`, `parentSessionId`, `workItemId`, `spawnIntentId`.
4. THE Daemon_Core SHALL support Session Tree structure (via `parentSessionId`) for future nested subagent capabilities.
5. IF OpenCode Plugin Hook inputs lack stable `agent` field, THEN THE Daemon_Core SHALL use `sessionId` as the sole identity key for lookup, not relying on OpenCode-provided agent names.
6. WHEN Daemon restarts after crash, THE Daemon_Core SHALL rebuild Session Registry state from events.jsonl, using state.json as acceleration checkpoint.

### Requirement 4: Multi-project Support Implementation

**User Story:** As a developer maintaining multiple repositories, I want the Daemon to support multiple projects from REQ-13, so that I can work across projects without running multiple Daemon instances.

#### Acceptance Criteria

1. THE Daemon_Core SHALL maintain multiple project contexts within a single instance, isolated by project root path (absolute path).
2. THE Daemon_Core SHALL maintain independent `state.json`, `events.jsonl`, `runtime/` files per project context.
3. THE Daemon_Core SHALL maintain per-project write locks; reads/writes across projects must not block each other.
4. WHERE two OpenCode sessions concurrently operate on the same project's same work item, THE Daemon_Core SHALL serialize writes using per-project lock to avoid data races.
5. THE Daemon_Core SHALL enable cross-project knowledge sharing via shared `~/.specforge/knowledge/` directory (automatic extraction not required for V6.0).

### Requirement 5: Crash Recovery Implementation

**User Story:** As a reliability engineer, I want the Daemon to implement crash recovery from REQ-12, so that system crashes or power outages don't result in data loss.

#### Acceptance Criteria

1. THE Daemon_Core SHALL implement WAL semantics for all state changes: first append event to `events.jsonl` and `fsync`, then update `state.json`.
2. WHEN Daemon starts, THE Daemon_Core SHALL rebuild state from `events.jsonl`, using `state.json` as acceleration checkpoint for alignment.
3. IF startup detects inconsistency between `state.json` and `events.jsonl`, THEN THE Daemon_Core SHALL roll back to consistent state per predefined repair rules and record repair event.
4. WHEN Daemon restarts and finds previously bound OpenCode session still alive, THE Daemon_Core SHALL attempt to reconnect to that session rather than create new one.
5. THE Daemon_Core SHALL only attempt reconnection to old OpenCode sessions during startup process; after startup completes, no automatic reconnection attempts.
6. WHILE Daemon is in RECOVERING or RECONNECTING_SESSION state, THE Daemon_Core SHALL report "Daemon reconnecting..." status to Thin Plugin.
7. THE Daemon_Core SHALL pass crash recovery tests: 0 data loss in 10 random kill tests.

### Requirement 6: Multi-sync Readiness Implementation

**User Story:** As a future multi-device/team sync planner, I want the Daemon's event schema to be ready for synchronization from REQ-19, so that we don't need to refactor the event system later.

#### Acceptance Criteria

1. THE Daemon_Core SHALL implement events.jsonl schema with:
   - Globally unique `eventId` (UUIDv7 or equivalent)
   - Monotonically non-decreasing `ts` within single machine
   - Non-empty `projectId` aggregatable by project dimension
2. THE Daemon_Core SHALL ensure event schema remains forward-compatible for future multi-machine synchronization.
3. THE Daemon_Core SHALL NOT implement actual multi-machine synchronization in V6.0 (per REQ-19.1).

## Glossary

- **Daemon**: The SpecForge V6 independent long-lived process. Only one instance runs per machine, maintaining multiple project contexts, serving as Source of Truth for all state, permissions, workflows, and events.
- **Source of Truth**: Authoritative truth source. In V6, Daemon is the only Source of Truth; no component may bypass Daemon to modify authoritative state.
- **Session Registry**: Registry within Daemon managing session identity mappings, maintaining pending/active/history records, and serving as authoritative "sessionID → AgentIdentity" mapping.
- **AgentIdentity**: Structure representing an agent session's identity, containing `sessionId`, `agentRole`, `workflowRole`, `parentSessionId`, `workItemId`, `spawnIntentId`.
- **WAL**: Write-Ahead Log, crash-safe semantics where events are written to log and fsynced before state is updated.
- **Project Context**: Isolated environment within Daemon for a specific project (repository), with its own state, events, and runtime files.
- **Handshake File**: File written by Daemon at `~/.specforge/runtime/daemon.sock.json` containing `pid`, `port`, `token` for client authentication.
- **CAS**: Content-Addressable Storage, storing blobs by their SHA-256 hash as address.
- **Event Bus**: Unified event bus inside Daemon. All cross-layer communication must pass through Event Bus, not via direct function calls across observability boundaries.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 1 Test**: Verify that all state change paths go through Daemon and produce events
2. **Property 2 Test**: Verify that all cross-layer communication passes through Event Bus
3. **Property 5 Test**: Verify session identity stability across session lifecycle
4. **Property 6 Test**: Verify idempotent recovery from event streams
5. **Property 7 Test**: Verify WAL ordering (events.jsonl fsync before state.json update)
6. **Property 20 Test**: Verify recovery consistency repair rules
7. **Property 21 Test**: Verify session WAL replay scope limitation to startup only
8. **Property 22 Test**: Verify project isolation (no cross-project state leakage)
9. **Property 30 Test**: Verify event schema multi-sync readiness properties

### Unit Tests

1. Daemon process model tests (single instance enforcement, startup modes)
2. Communication protocol tests (HTTP/SSE, authentication, blob reference handling)
3. Session Registry tests (registration, lookup, tree structure, crash recovery)
4. Multi-project isolation tests (per-project locks, state separation)
5. Crash recovery tests (WAL semantics, state reconstruction, repair rules)
6. Event schema tests (UUID uniqueness, timestamp monotonicity, project aggregation)

### Integration Tests

1. End-to-end Daemon startup and shutdown
2. Client (CLI, Thin Plugin) communication with Daemon
3. Cross-project operation isolation
4. Crash recovery scenario simulations
5. Session lifecycle management

## Notes

- This spec implements the **daemon-core** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- All persistent files must include `schema_version` field for future migration support.
