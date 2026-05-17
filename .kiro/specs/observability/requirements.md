# Requirements Document: Observability

## Introduction

This specification defines the **Observability** module for SpecForge V6. The Observability subsystem is a **first-class component** that provides comprehensive monitoring, logging, and analysis capabilities to achieve the North Star goal: "5 minutes from problem occurrence to root cause identification."

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 2: Event Bus Traversal
*For all* cross-layer communication messages m (from Agent to Daemon, from Daemon to Observability, from Daemon to Self-healing, from any component to another across boundaries), m must pass through the Event Bus; there must be no direct function calls that cross observability boundaries.

**Validates: Requirements 30.2**

### Property 8: Serialization Round-trip
*For all* persisted data objects x ∈ { AgentIdentity, Event, ProjectState, WorkflowDefinitionFile, HandshakeFile, PermissionRule, PluginManifest, SkillMetadata, MergedConfig, UserMessage, WorkItemState }, `parse(serialize(x)) == x`.

**Validates: Requirements 30.8, 6.3**

### Property 9: CAS Content Addressing
*For all* binary or text content c, the blob reference id obtained by storing this content in CAS satisfies `id == "blob://" + sha256(c)`; two `store(c)` operations on identical content produce the same id; `store` results for different content must have different ids (collision probability equals SHA-256 theoretical value).

**Validates: Requirements 30.9, 5.6, 14.2**

### Property 10: Permission Decision Traceability
*For all* Permission Engine decisions d (allow or deny), there exists a unique event e in events.jsonl where `e.action == "permission.evaluated"` and `e.payload` contains all six fields `{ actor, action, resource, matched_rule, rule_layer, reason }`; given any deny result d, one can trace back to `matched_rule` and `rule_layer` via events.jsonl.

**Validates: Requirements 30.10**

### Property 30: Event Schema Multi-sync Readiness
*For all* events e written to events.jsonl, `e.eventId` is globally unique (UUIDv7 or equivalent), `e.ts` is monotonically non-decreasing within a single machine, `e.projectId` is non-empty and aggregatable by project dimension; this schema remains forward-compatible for future multi-machine synchronization.

**Validates: Requirements 19.2**

## Requirements

### Requirement 1: Three-Tier Observability Mode Implementation

**User Story:** As a user with varying hardware constraints and analysis needs, I want the Observability subsystem to support three distinct operational modes, so I can balance detail level with resource consumption.

#### Acceptance Criteria

1. THE Observability_Subsystem SHALL implement three operational modes:
   - **minimal**: Records only decision events (Gate / Permission / Workflow transition).
   - **standard** (default): Records all events, excluding large payloads.
   - **deep**: Records all events including payload blob references.
2. THE Observability_Subsystem SHALL allow mode switching at runtime via configuration.
3. THE Observability_Subsystem SHALL ensure the North Star goal ("5 minutes to root cause") is achievable in all three modes.
4. THE Observability_Subsystem SHALL record each modality adaptation decision (input modality, target model, whether downgraded, derived blob reference used) as per REQ-14.6.

### Requirement 2: Event Bus and CAS Integration

**User Story:** As a system architect, I want the Event Bus and CAS to be tightly integrated with the Observability subsystem, so that all cross-layer communication is captured and large payloads are efficiently stored.

#### Acceptance Criteria

1. THE Observability_Subsystem SHALL implement Event Bus traversal for all cross-layer communication (Property 2).
2. THE Observability_Subsystem SHALL integrate with CAS for storing payloads > 64 KiB as blob references (`blob://<sha256>`).
3. THE Observability_Subsystem SHALL enforce CAS content addressing property: `store(content).id == sha256(content)` (Property 9).
4. THE Observability_Subsystem SHALL ensure serialization round-trip consistency for all persisted data objects (Property 8).
5. THE Observability_Subsystem SHALL implement events.jsonl as a Write-Ahead Log (WAL) with proper fsync semantics before state.json updates.

### Requirement 3: North Star Goal Support

**User Story:** As a product owner, I want the Observability subsystem to enable the North Star goal of "5 minutes from problem occurrence to root cause identification" across 10 troubleshooting scenarios.

#### Acceptance Criteria

1. THE Observability_Subsystem SHALL provide analysis capabilities covering all 10 troubleshooting scenarios from REQ-3.2:
   - Gate反复失败 (Gate repeatedly fails)
   - Agent偏离prompt (Agent deviates from prompt)
   - Tool调用错误 (Tool invocation errors)
   - 权限拒绝 (Permission denials)
   - 升级/安装失败 (Upgrade/installation failures)
   - 状态机卡住 (State machine stuck)
   - 并发死锁 (Concurrency deadlocks)
   - Skill是否被调用 (Whether Skill was invoked)
   - Workflow是否按预期执行 (Whether Workflow executed as expected)
   - Workflow执行结果偏离预期 (Workflow execution results deviate from expectations)
2. THE Observability_Subsystem SHALL enable sf-analyst agent to read observability data and generate structured analysis results.
3. THE Observability_Subsystem SHALL separate sf-analyst from sf-debugger: sf-analyst performs architectural-level sensory analysis while sf-debugger fixes code issues.
4. THE Observability_Subsystem SHALL support event schema with multi-sync readiness fields (Property 30).

### Requirement 4: Multi-sync Readiness and Event Schema

**User Story:** As a future multi-device/team sync planner, I want the Observability event schema to be ready for synchronization, so we don't need to refactor the event system later.

#### Acceptance Criteria

1. THE Observability_Subsystem SHALL implement events.jsonl schema with:
   - Globally unique `eventId` (UUIDv7 or equivalent)
   - Monotonically non-decreasing `ts` within single machine
   - Non-empty `projectId` aggregatable by project dimension
2. THE Observability_Subsystem SHALL ensure event schema remains forward-compatible for future multi-machine synchronization.
3. THE Observability_Subsystem SHALL NOT implement actual multi-machine synchronization in V6.0 (per REQ-19.1).
4. THE Observability_Subsystem SHALL implement permission decision traceability (Property 10).

### Requirement 5: Agent Roster Integration

**User Story:** As a workflow designer, I want the Observability subsystem to integrate with the V6.0 Agent Roster, particularly sf-analyst, to provide comprehensive analysis capabilities.

#### Acceptance Criteria

1. THE Observability_Subsystem SHALL support sf-analyst agent with the responsibility "read observability data → generate structured analysis results."
2. THE Observability_Subsystem SHALL allow sf-analyst to be scheduled by sf-debugger or users.
3. THE Observability_Subsystem SHALL maintain clear separation between sf-analyst (architectural analysis) and sf-debugger (code repair).
4. THE Observability_Subsystem SHALL provide observability data access interfaces for all 10 V6.0 built-in Agents.

## Glossary

- **Observability**: The capability to understand system behavior through monitoring, logging, tracing, and analysis. In V6, Observability is a first-class component, not an add-on capability.
- **Event Bus**: Unified event bus inside Daemon. All cross-layer communication must pass through Event Bus, not via direct function calls across observability boundaries.
- **CAS (Content-Addressable Storage)**: Storage system where blobs are addressed by their SHA-256 hash. Used for storing large payloads (images, audio, video, long text).
- **Three-Tier Mode**: Three operational modes for observability: minimal (decision events only), standard (all events without large payloads), deep (all events with payload blob references).
- **North Star Goal**: Core verifiable target for V6: "5 minutes from problem occurrence to root cause identification" across 10 troubleshooting scenarios.
- **sf-analyst**: V6.0 built-in Agent responsible for reading observability data and generating structured analysis results.
- **WAL (Write-Ahead Log)**: Crash-safe semantics where events are written to log and fsynced before state is updated.
- **events.jsonl**: Event Bus persistence file using WAL semantics, the single source of truth for state reconstruction.
- **state.json**: Derived state checkpoint file, calculated from events.jsonl for fast startup.
- **Blob Reference**: Reference format `blob://<sha256>` for content stored in CAS, used when payload > 64 KiB.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 2 Test**: Verify that all cross-layer communication passes through Event Bus
2. **Property 8 Test**: Verify serialization round-trip consistency for all persisted data objects
3. **Property 9 Test**: Verify CAS content addressing (SHA-256 hash as blob ID)
4. **Property 10 Test**: Verify permission decision traceability in events.jsonl
5. **Property 30 Test**: Verify event schema multi-sync readiness properties

### Unit Tests

1. Three-tier mode implementation tests (mode switching, event filtering)
2. Event Bus integration tests (cross-layer communication capture)
3. CAS integration tests (blob storage and retrieval, content addressing)
4. North Star goal scenario tests (10 troubleshooting scenarios)
5. sf-analyst integration tests (data access, analysis generation)
6. Event schema tests (UUID uniqueness, timestamp monotonicity, project aggregation)
7. Permission decision traceability tests

### Integration Tests

1. End-to-end observability pipeline (event emission → Event Bus → CAS → events.jsonl)
2. Three-tier mode behavior under different workloads
3. North Star goal validation across 10 scenarios
4. sf-analyst data analysis and report generation
5. Crash recovery with WAL semantics
6. Multi-project observability isolation

## Notes

- This spec implements the **observability** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- The North Star goal ("5 minutes to root cause") is a critical quality gate for V6.0 release (REQ-27).
- Observability is a first-class component in V6, not an add-on capability (Core Design Principle 4).
- All persistent files must include `schema_version` field for future migration support.
- Event schema must be designed with future multi-machine synchronization in mind (REQ-19).
