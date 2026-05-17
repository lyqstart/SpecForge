# Self-Healing Module Boundaries and Responsibilities

## Module Overview

The Self-Healing Subsystem (`@specforge/self-healing`) implements automated diagnosis and repair capabilities for SpecForge V6. This document defines the module's public API surface, internal structure, and integration points.

## Public API Surface

### Exported Types

All types are exported from the main `index.ts` barrel export:

```typescript
import {
  // Core interfaces
  SelfHealingStateMachine,
  AllowedListValidator,
  DiagnosisAnalysisEngine,
  RiskTierClassifier,
  RollbackManager,

  // Data models
  HealingState,
  HealingEvent,
  DiagnosisReport,
  HealingAction,
  RollbackPoint,

  // Configuration
  AllowedListConfig,
  RiskTierRulesConfig,

  // Constants
  BUILTIN_ALLOWED_TYPES,
  BUILTIN_EXCLUDED_TYPES,
  DEFAULT_RISK_TIER_RULES,
} from '@specforge/self-healing'
```

### Core Interfaces

#### 1. SelfHealingStateMachine

**Responsibility**: Main orchestrator for the healing workflow state machine.

**V6.0 Implementation**:
- `trigger(params)`: Initiate healing from gate failure or user request
- `diagnose(workItemId)`: Perform diagnosis analysis
- `getState(workItemId)`: Retrieve current healing state

**P2 Stubs** (throw "not implemented"):
- `propose(workItemId)`: Generate repair plan
- `approve(workItemId, approval)`: Process approval decision
- `apply(workItemId)`: Apply changes
- `verify(workItemId)`: Verify repair success

**State Transitions** (V6.0):
```
idle → triggered → diagnosing → (idle | blocked)
```

#### 2. AllowedListValidator

**Responsibility**: Validate error types against the allowed list.

**Methods**:
- `isAllowed(errorType, context?)`: Check if error type can trigger healing
- `getAllowedTypes()`: List all allowed error types
- `getExcludedTypes()`: List all excluded error types
- `addType(errorType, configLayer)`: Add type to allowed list
- `removeType(errorType, configLayer)`: Remove type from allowed list

**Configuration Layers**:
- `builtin`: System defaults (cannot be removed)
- `user`: User-level configuration
- `project`: Project-level configuration

#### 3. DiagnosisAnalysisEngine

**Responsibility**: Perform structured diagnosis analysis on evidence.

**Methods**:
- `analyze(workItemId, triggerContext)`: Generate diagnosis report
- `collectEvidence(workItemId)`: Gather relevant observability data
- `generateReport(evidence, analysisResults)`: Structure analysis into report

**Evidence Sources**:
- Events from Event Bus
- Current project state
- Artifact contents
- Gate failure results

#### 4. RiskTierClassifier

**Responsibility**: Classify repair actions by risk tier (L1/L2/L3).

**Methods**:
- `classify(action)`: Determine risk tier for a repair action
- `rules`: Access to classification rules

**Risk Tiers**:
- **L1**: Automatic approval (adding missing sections, formatting fixes)
- **L2**: Default approval, user-disablable (small code changes, adding tests)
- **L3**: Requires manual approval (major changes, deletions, permission changes)

#### 5. RollbackManager

**Responsibility**: Manage rollback points for healing operations (P2).

**Methods** (P2 stubs in V6.0):
- `createRollbackPoint(workItemId)`: Create snapshot before applying changes
- `restoreFromRollbackPoint(rollbackPointId)`: Restore from snapshot

**Note**: V6.0 only defines the interface; implementation deferred to P2.

### Data Models

#### HealingState

**Purpose**: Track healing progress for a work item.

**Key Fields**:
- `workItemId`: Identifier for the work item
- `currentPhase`: Current phase in state machine
- `iteration`: Healing attempt count (1-3)
- `history`: Timeline of phase transitions
- `blocked`: Blocking reason if applicable

**Invariants**:
- `iteration` must be ≤ 3 (Property 25)
- `blocked` is set when healing cannot proceed

#### HealingEvent

**Purpose**: Emit events for observability integration.

**Key Fields**:
- `eventId`: Unique event identifier
- `ts`: Timestamp
- `workItemId`: Associated work item
- `action`: Specific healing action (heal.triggered, heal.diagnosed, etc.)
- `payload`: Action-specific data
- `payloadBlobRef`: CAS reference for large payloads

**Event Actions** (V6.0):
- `heal.triggered`: Healing initiated
- `heal.diagnosing`: Diagnosis in progress
- `heal.diagnosed`: Diagnosis complete
- `heal.blocked`: Healing blocked

**Event Actions** (P2):
- `heal.proposed`: Repair plan generated
- `heal.approved`: Approval obtained
- `heal.applying`: Changes being applied
- `heal.applied`: Changes applied
- `heal.verifying`: Verification in progress
- `heal.verified`: Verification complete
- `heal.rollback`: Rollback executed

#### DiagnosisReport

**Purpose**: Structured output of diagnosis analysis.

**Key Fields**:
- `workItemId`: Associated work item
- `rootCause`: Identified root cause
- `confidence`: Confidence level (high/medium/low)
- `evidence`: Supporting evidence with CAS references
- `recommendedActions`: Proposed repairs with risk tiers
- `generatedAt`: Timestamp

**Constraints**:
- Must include `schema_version: "1.0"` for migration support
- Evidence items must reference CAS blobs for large data
- Recommended actions must include risk tier classification

## Internal Module Structure

### Directory Layout

```
packages/self-healing/
├── src/
│   ├── index.ts                    # Public API barrel export
│   ├── types.ts                    # Core type definitions
│   ├── state-machine/              # State machine implementation
│   │   ├── index.ts
│   │   ├── state-machine.ts
│   │   └── state-persistence.ts
│   ├── allowed-list/               # Allowed list validation
│   │   ├── index.ts
│   │   ├── validator.ts
│   │   └── config-loader.ts
│   ├── diagnosis/                  # Diagnosis analysis engine
│   │   ├── index.ts
│   │   ├── analysis-engine.ts
│   │   ├── evidence-collector.ts
│   │   └── report-generator.ts
│   ├── risk-tier/                  # Risk tier classification
│   │   ├── index.ts
│   │   ├── classifier.ts
│   │   └── rules-engine.ts
│   ├── rollback/                   # Rollback management (P2)
│   │   ├── index.ts
│   │   └── rollback-manager.ts
│   ├── observability/              # Event Bus and CAS integration
│   │   ├── index.ts
│   │   ├── event-emitter.ts
│   │   └── cas-integration.ts
│   └── constants.ts                # Built-in constants
├── tests/
│   ├── unit/
│   │   ├── state-machine.test.ts
│   │   ├── allowed-list.test.ts
│   │   ├── diagnosis.test.ts
│   │   ├── risk-tier.test.ts
│   │   └── data-models.test.ts
│   ├── property/
│   │   ├── property-24-rollback.property.test.ts
│   │   ├── property-25-iteration.property.test.ts
│   │   └── serialization-roundtrip.property.test.ts
│   └── integration/
│       ├── end-to-end.test.ts
│       └── observability.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Module Responsibilities

#### state-machine/

**Responsibility**: Implement the healing state machine.

**Exports**:
- `SelfHealingStateMachine` interface implementation
- State transition logic
- State persistence layer

**Dependencies**:
- `allowed-list/` for validation
- `diagnosis/` for analysis
- `observability/` for event emission

#### allowed-list/

**Responsibility**: Manage and validate the allowed list of error types.

**Exports**:
- `AllowedListValidator` interface implementation
- Configuration loading and merging
- Built-in type definitions

**Dependencies**:
- Configuration system (external)
- Logging (external)

#### diagnosis/

**Responsibility**: Perform diagnosis analysis on evidence.

**Exports**:
- `DiagnosisAnalysisEngine` interface implementation
- Evidence collection logic
- Report generation

**Dependencies**:
- Event Bus (external)
- CAS (external)
- sf-analyst (external, optional)

#### risk-tier/

**Responsibility**: Classify repair actions by risk tier.

**Exports**:
- `RiskTierClassifier` interface implementation
- Classification rules engine
- Rule configuration management

**Dependencies**:
- Configuration system (external)

#### rollback/

**Responsibility**: Manage rollback points (P2 implementation).

**Exports**:
- `RollbackManager` interface implementation (P2 stub in V6.0)

**Dependencies**:
- CAS (external)
- State management (external)

#### observability/

**Responsibility**: Integrate with Event Bus and CAS.

**Exports**:
- Event emission utilities
- CAS blob reference handling
- Observability query support

**Dependencies**:
- Event Bus (external)
- CAS (external)

## Type Boundaries

### Public Types (Exported)

All types in `src/types.ts` are public and part of the stable API:

- `HealingState`, `HealingEvent`, `DiagnosisReport`: Data models
- `SelfHealingStateMachine`, `AllowedListValidator`, etc.: Interfaces
- `HealingPhase`, `RiskTier`, `ConfidenceLevel`: Enumerations
- `TriggerContext`, `TriggerResult`, `EvidenceCollection`: Request/response types

### Internal Types (Not Exported)

Implementation-specific types should be defined in module-specific files:

- `StateTransitionContext`: Internal state machine context
- `ClassificationRuleMatch`: Internal rule matching result
- `EvidenceQuery`: Internal evidence collection query

## Integration Points

### External Dependencies

#### Event Bus

**Usage**: Emit healing events for observability.

**Events Emitted**:
- `heal.triggered`, `heal.diagnosing`, `heal.diagnosed`, `heal.blocked` (V6.0)
- `heal.proposed`, `heal.approved`, `heal.applying`, `heal.applied`, `heal.verifying`, `heal.verified`, `heal.rollback` (P2)

**Integration Point**: `observability/event-emitter.ts`

#### CAS (Content-Addressable Storage)

**Usage**: Store large evidence collections and diagnosis reports.

**Data Stored**:
- Diagnosis reports (blob references in events)
- Evidence collections (blob references in payloads)
- Rollback point snapshots (P2)

**Integration Point**: `observability/cas-integration.ts`

#### Configuration System

**Usage**: Load allowed list and risk tier rules from configuration layers.

**Configuration Keys**:
- `selfHealing.allowedList`: Allowed error types
- `selfHealing.excludedList`: Excluded error types
- `selfHealing.riskTierRules`: Risk tier classification rules

**Integration Point**: `allowed-list/config-loader.ts`, `risk-tier/rules-engine.ts`

#### sf-analyst Agent

**Usage**: Delegate complex diagnosis scenarios.

**Request Format**: Diagnosis request with evidence collection
**Response Format**: Analysis results with root cause and patterns

**Integration Point**: `diagnosis/analysis-engine.ts`

#### Permission Engine (P2)

**Usage**: Obtain approval for L3 risk tier actions.

**Integration Point**: `state-machine/state-machine.ts` (P2 stub)

## Versioning and Migration

### Schema Versioning

All persistent data structures include `schema_version: "1.0"`:

- `HealingState`
- `HealingEvent`
- `DiagnosisReport`
- `RollbackPoint`
- `AllowedListConfig`
- `RiskTierRulesConfig`

**Migration Path** (V6.0 → V6.x):
- V6.0 uses `schema_version: "1.0"`
- P2 may introduce `schema_version: "2.0"` for extended healing state
- Migration scripts will handle version transitions

### Backward Compatibility

- V6.0 implementation is stable for the Diagnose phase
- P2 implementation will extend interfaces without breaking existing code
- All new fields in P2 will be optional for backward compatibility

## Security Considerations

### V6.0 (Diagnose Only)

- **Read-Only**: Diagnosis phase only reads observability data
- **Allowed List**: Strict control over triggerable error types
- **Evidence Limits**: Only collect data relevant to diagnosis
- **Access Control**: Follows existing permission rules

### P2 Considerations

- **Approval Workflows**: L3 actions require manual approval
- **Rollback Safety**: Guaranteed restoration capability
- **Change Auditing**: All modifications tracked in events
- **Permission Integration**: Apply phase respects tool permissions

## Performance Considerations

1. **Evidence Collection**: Bounded by time window and data size
2. **CAS Usage**: Large data uses blob references
3. **Analysis Delegation**: Complex analysis delegated to sf-analyst
4. **State Machine**: Minimal state tracking, efficient transitions
5. **Event Volume**: Follows same volume controls as other event categories

## Testing Strategy

### Unit Tests

- State machine transitions
- Allowed list validation
- Risk tier classification
- Data model serialization

### Property-Based Tests

- **Property 24**: Rollback precondition verification
- **Property 25**: Iteration bound enforcement
- **Property 8**: Serialization round-trip

### Integration Tests

- End-to-end diagnosis flow
- Event Bus integration
- CAS storage/retrieval
- Configuration loading

## Future Extensions (P2+)

### Propose Phase

- Generate repair plans from diagnosis
- Integrate with code generation tools

### Approve Phase

- Implement approval workflows
- Integrate with Permission Engine

### Apply Phase

- Execute repair actions
- Manage rollback points

### Verify Phase

- Validate repair success
- Implement automatic rollback on failure

## References

- **Specification**: `.kiro/specs/self-healing/`
- **Parent Architecture**: `.kiro/specs/v6-architecture-overview/`
- **Requirements**: `.kiro/specs/self-healing/requirements.md`
- **Design**: `.kiro/specs/self-healing/design.md`
