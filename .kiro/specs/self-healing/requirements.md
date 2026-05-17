# Requirements Document: Self-Healing Subsystem

## Introduction

This specification defines the **Self-Healing Subsystem** module for SpecForge V6. The Self-Healing Subsystem implements the automated diagnosis and repair capabilities for V6, following the `Diagnose → Propose → Approve → Apply → Verify` state machine defined in the parent architecture specification.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification for the Diagnose phase only, with full self-healing loop (Propose/Approve/Apply/Verify) deferred to **P2**. The scopeTag reflects this phased approach: `p0` for Diagnose, `p2` for complete loop.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 24: Healing Rollback Precondition
*For all* Self-healing 运行 h，若 h 进入 `applying` 状态，THEN 在进入 `applying` 之前必定成功创建了回滚点；若回滚点创建失败，h 必须转为 `blocked` 且绝不进入 `applying`；若 `verifying` 失败，h 必须自动回滚到该回滚点。

**Validates: Requirements 15.5**

### Property 25: Healing Iteration Bound
*For all* 单一 work item 上的 self-healing 链条，迭代次数 ≤ 3；第 4 次触发必定被拒绝并将当前 heal 标记为 `blocked`。

**Validates: Requirements 15.4**

## Requirements

### Requirement 1: Self-Healing State Machine (Diagnose Phase Only)

**User Story:** As a system maintainer, I want the self-healing subsystem to implement the Diagnose phase of the state machine from REQ-15, so that V6 can automatically detect and analyze issues without risking destructive automated repairs.

#### Acceptance Criteria

1. THE Self_Healing_Subsystem SHALL implement the self-healing state machine: `triggered → diagnosing → (blocked|END)` for V6.0.
2. THE Self_Healing_Subsystem SHALL define the `Propose / Approve / Apply / Verify` states as interface stubs only, with no actual transitions implemented in V6.0.
3. THE Self_Healing_Subsystem SHALL support triggering conditions from REQ-15.2:
   - Gate failure with error type in "self-healing allowed list"
   - User explicit request via `specforge heal <workItemId>`
4. THE Self_Healing_Subsystem SHALL NOT automatically trigger self-healing for operations involving user confirmation, external resources, or destructive operations (REQ-15.3).
5. THE Self_Healing_Subsystem SHALL enforce iteration bound of ≤ 3 self-healing attempts per work item (Property 25).
6. WHEN iteration count reaches 3, THE Self_Healing_Subsystem SHALL reject further healing attempts and mark the work item as `blocked`.
7. THE Self_Healing_Subsystem SHALL implement rollback point creation as a precondition for any future `applying` state (Property 24).
8. IF rollback point creation fails, THE Self_Healing_Subsystem SHALL transition to `blocked` and never enter `applying` state.
9. THE Self_Healing_Subsystem SHALL implement automatic rollback to the created rollback point if `verifying` fails (when implemented in P2).

### Requirement 2: Self-Healing Allowed List

**User Story:** As a safety-conscious user, I want a clear, configurable list of error types that can trigger self-healing, so that only safe, well-understood issues are automatically diagnosed.

#### Acceptance Criteria

1. THE Self_Healing_Subsystem SHALL maintain a "self-healing allowed list" of error types that can trigger automatic diagnosis.
2. THE Allowed_List SHALL be configurable at three levels (builtin, user, project) following the configuration layering from REQ-9.
3. THE Allowed_List SHALL include at minimum the following error types (examples):
   - Missing required sections in requirements.md / design.md / tasks.md
   - Formatting errors in spec documents (markdown syntax, YAML frontmatter)
   - Broken internal links within spec documents
   - Missing artifact files referenced in tasks.md
4. THE Allowed_List SHALL explicitly exclude the following error types:
   - Code logic errors (requires human analysis)
   - Permission/access issues (requires security review)
   - Data loss or destructive operations
   - Network/connectivity issues
5. WHEN a Gate fails with error type NOT in the allowed list, THE Self_Healing_Subsystem SHALL NOT trigger automatic diagnosis.
6. THE Self_Healing_Subsystem SHALL log all diagnosis decisions (triggered/not triggered) with reason to events.jsonl.

### Requirement 3: Diagnosis Analysis Framework

**User Story:** As a developer, I want the self-healing subsystem to perform structured diagnosis analysis, so that root causes can be identified and presented to users for manual repair in V6.0.

#### Acceptance Criteria

1. THE Self_Healing_Subsystem SHALL implement a diagnosis analysis framework that:
   - Collects relevant observability data (events, state, artifacts)
   - Analyzes patterns and correlations
   - Generates structured diagnosis reports
2. THE Diagnosis_Report SHALL include:
   - Root cause hypothesis
   - Confidence level (high/medium/low)
   - Evidence from observability data
   - Recommended repair actions (for manual execution in V6.0)
   - Risk assessment (L1/L2/L3 per REQ-15.6)
3. THE Self_Healing_Subsystem SHALL integrate with sf-analyst agent for complex diagnosis scenarios.
4. THE Self_Healing_Subsystem SHALL store diagnosis reports in CAS with blob references in events.jsonl.
5. THE Self_Healing_Subsystem SHALL support diagnosis report retrieval via CLI: `specforge heal report <workItemId>`

### Requirement 4: Risk Tier Classification

**User Story:** As a user, I want self-healing actions to be classified by risk tier, so that I understand the potential impact of automated repairs when they are implemented in P2.

#### Acceptance Criteria

1. THE Self_Healing_Subsystem SHALL implement risk tier classification (L1/L2/L3) from REQ-15.6:
   - **L1**: Automatic approval (adding missing sections, formatting fixes, non-destructive changes)
   - **L2**: Default approval, user-disablable (small code changes, adding tests)
   - **L3**: Requires manual approval (major changes, deletions, permission changes)
2. THE Risk_Tier_Classifier SHALL assign risk tiers based on:
   - Type of change (add/delete/modify)
   - Scope of change (single file vs. multiple files)
   - Impact on functionality (cosmetic vs. behavioral)
   - Security implications
3. THE Self_Healing_Subsystem SHALL log risk tier assignments with justification in events.jsonl.
4. FOR V6.0, THE Self_Healing_Subsystem SHALL only implement risk tier classification for diagnosis reporting; approval and application logic deferred to P2.

### Requirement 5: Integration with Observability

**User Story:** As an observability system, I want self-healing to be fully integrated with the event bus and CAS, so that all diagnosis activities are traceable and auditable.

#### Acceptance Criteria

1. THE Self_Healing_Subsystem SHALL emit events to Event Bus for all state transitions in the self-healing state machine.
2. THE Self_Healing_Subsystem SHALL use CAS for storing:
   - Diagnosis reports
   - Rollback point snapshots
   - Evidence collections
3. ALL Self_Healing_Subsystem events SHALL include:
   - `workItemId` reference
   - Current state in self-healing state machine
   - Iteration count
   - Risk tier (if applicable)
   - Blob references to diagnosis reports (when generated)
4. THE Self_Healing_Subsystem SHALL be observable through the same three modes (minimal/standard/deep) as the rest of the observability subsystem.
5. THE Self_Healing_Subsystem SHALL support observability queries for:
   - Self-healing history per work item
   - Success/failure rates of diagnosis
   - Most common root causes identified

## Glossary

- **Self-Healing Loop**: The complete `Diagnose → Propose → Approve → Apply → Verify` state machine for automated issue detection and repair.
- **Diagnose Phase**: The first phase of self-healing where issues are detected, analyzed, and root causes identified. Implemented in V6.0 (P0).
- **Propose/Approve/Apply/Verify Phases**: Subsequent phases for generating repair plans, obtaining approval, applying changes, and verifying results. Deferred to V6.x (P2).
- **Rollback Point**: A snapshot of system state created before applying any changes, used to restore previous state if verification fails.
- **Risk Tier**: Classification of self-healing actions by potential impact: L1 (automatic), L2 (default automatic, user-disablable), L3 (manual approval required).
- **Allowed List**: Configurable list of error types that can trigger automatic self-healing diagnosis.
- **Iteration Bound**: Maximum number of self-healing attempts (3) allowed per work item before marking as blocked.
- **Diagnosis Report**: Structured analysis output containing root cause hypothesis, evidence, and recommended repair actions.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 24 Test**: Verify that rollback points are created before entering `applying` state, and that failure to create rollback point transitions to `blocked` without entering `applying`.
2. **Property 25 Test**: Verify that self-healing iteration count never exceeds 3 per work item, and that 4th attempt is rejected with `blocked` state.

### Unit Tests

1. Self-healing state machine tests (triggered → diagnosing transitions)
2. Allowed list validation tests (inclusion/exclusion logic)
3. Diagnosis analysis framework tests (report generation, evidence collection)
4. Risk tier classification tests (L1/L2/L3 assignment logic)
5. Iteration bound enforcement tests
6. Rollback point creation and validation tests
7. Integration with Event Bus and CAS tests

### Integration Tests

1. End-to-end diagnosis flow for allowed error types
2. Rejection of self-healing for non-allowed error types
3. Iteration limit enforcement across multiple triggers
4. Integration with sf-analyst for complex diagnosis
5. Observability integration (event emission, CAS storage)

## Notes

- This spec implements the **self-healing** module as defined in the parent V6 architecture specification.
- **V6.0 Scope**: Only the Diagnose phase is implemented. The complete self-healing loop (Propose/Approve/Apply/Verify) is deferred to V6.x (P2).
- The `scopeTag: p0` in `.config.kiro` reflects the Diagnose-only implementation; full self-healing would be `p2`.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- All persistent files must include `schema_version` field for future migration support.
- Integration with Permission Engine is required for future P2 implementation (approval workflows).