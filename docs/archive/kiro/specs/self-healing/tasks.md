# Implementation Plan: Self-Healing Subsystem

## Overview

This specification implements the **Self-Healing Subsystem** for SpecForge V6, focusing on the **Diagnose phase** (P0) as defined in the parent V6 architecture specification. The complete self-healing loop (Propose/Approve/Apply/Verify) is deferred to V6.x (P2).

### Key Implementation Constraints

1. **V6.0 Scope**: Only Diagnose phase implementation
2. **Safety First**: Strict allowed list, iteration bounds, no automated repairs
3. **Property Inheritance**: Must implement Property 24 and Property 25 from parent spec
4. **Observability Integration**: All activities emit events, use CAS for evidence

### Implementation Language

**TypeScript** (aligned with existing `.opencode/tools/` toolchain)

## Tasks

- [ ] 1. Project Setup and Skeleton
  - [ ] 1.1 Create project structure and configuration
    - Initialize TypeScript project with required dependencies
    - Set up build configuration (tsconfig.json, package.json)
    - Configure testing framework (vitest + fast-check for PBT)
    - _Requirements: All, Property 24, Property 25_
  - [x] 1.2 Define module boundaries and exports
    - Create `index.ts` with public API exports
    - Define internal module structure
    - Set up barrel exports for key interfaces
    - _Requirements: All_

- [ ] 2. Core Data Models Implementation
  - [ ] 2.1 Implement HealingState data model
    - Define `HealingState` interface with schema_version
    - Implement serialization/deserialization with round-trip property
    - Add validation for state invariants (iteration ≤ 3)
    - _Requirements: 1.5, 1.6, Property 25_
  - [ ] 2.2 Implement HealingEvent data model
    - Define `HealingEvent` interface aligned with parent Event schema
    - Implement event factory functions for each action type
    - Ensure CAS blob reference handling for large payloads
    - _Requirements: 5.1, 5.3_
  - [ ] 2.3 Implement DiagnosisReport data model
    - Define `DiagnosisReport` with evidence collection
    - Implement report generation utilities
    - Add CAS integration for report storage
    - _Requirements: 3.2, 3.4_
  - [ ] 2.4 Write property-based tests for data models
    - **Property 8: Serialization Round-trip** (inherited via observability)
    - **Validates: Requirements 30.8**
    - Test `parse(serialize(x)) == x` for all data models
    - Use fast-check with ≥ 100 iterations

- [ ] 3. Self-Healing State Machine Implementation
  - [ ] 3.1 Implement state machine core
    - Define `SelfHealingStateMachine` interface
    - Implement state transitions for V6.0: `idle → triggered → diagnosing → (idle|blocked)`
    - Add P2 stub methods that throw "not implemented"
    - _Requirements: 1.1, 1.2_
  - [ ] 3.2 Implement iteration bound enforcement
    - Track iteration count per work item
    - Enforce ≤ 3 iterations, block on 4th attempt
    - Implement iteration counter persistence
    - _Requirements: 1.5, 1.6, Property 25_
  - [ ] 3.3 Implement state persistence layer
    - Store healing state per work item
    - Integrate with existing state.json structure
    - Support state reconstruction from events
    - _Requirements: 1.1_
  - [ ] 3.4 Write property-based tests for state machine
    - **Property 25: Healing Iteration Bound**
    - **Validates: Requirements 15.4, Property 25**
    - Generate sequences of healing attempts, verify ≤ 3 allowed
    - Verify 4th attempt transitions to blocked

- [ ] 4. Allowed List Implementation
  - [ ] 4.1 Implement AllowedListValidator
    - Define built-in allowed and excluded error types
    - Implement three-layer configuration (builtin/user/project)
    - Add validation logic with context awareness
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 4.2 Implement configuration management
    - Load allowed list from config layers (REQ-9)
    - Support hot reload on configuration changes
    - Validate configuration against built-in constraints
    - _Requirements: 2.2, 2.6_
  - [ ] 4.3 Implement Gate failure detection and validation
    - Integrate with Gate system to detect failures
    - Validate error types against allowed list
    - Generate appropriate trigger events
    - _Requirements: 1.3, 2.5_
  - [ ] 4.4 Write unit tests for allowed list
    - Test built-in type inclusion/exclusion
    - Test configuration merging across layers
    - Test context-aware validation logic

- [ ] 5. Diagnosis Analysis Engine Implementation
  - [ ] 5.1 Implement evidence collection
    - Query Event Bus for relevant events
    - Retrieve state.json for work item
    - Collect artifact contents referenced in tasks
    - _Requirements: 3.1, 5.1_
  - [ ] 5.2 Implement basic analysis patterns
    - Pattern matching for common error types
    - Correlation analysis across evidence sources
    - Root cause hypothesis generation
    - _Requirements: 3.1, 3.2_
  - [ ] 5.3 Integrate with sf-analyst for complex diagnosis
    - Define interface for delegating to sf-analyst
    - Implement request/response pattern
    - Handle analysis results integration
    - _Requirements: 3.3_
  - [ ] 5.4 Implement diagnosis report generation
    - Structure report with confidence levels
    - Include evidence references (CAS blob refs)
    - Generate recommended actions with risk tiers
    - _Requirements: 3.2, 3.4, 4.1_

- [ ] 6. Risk Tier Classification Implementation
  - [ ] 6.1 Implement RiskTierClassifier
    - Define default classification rules (L1/L2/L3)
    - Implement pattern matching for repair actions
    - Support rule configuration and overrides
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 6.2 Integrate risk tier with diagnosis reports
    - Classify recommended actions in reports
    - Include risk tier justification in reports
    - Support risk-based filtering of recommendations
    - _Requirements: 4.4_
  - [ ] 6.3 Write unit tests for risk classification
    - Test L1/L2/L3 classification rules
    - Test pattern matching accuracy
    - Test configuration override behavior

- [ ] 7. Observability Integration
  - [ ] 7.1 Implement Event Bus integration
    - Emit heal.* events for all state transitions
    - Include relevant context in event payloads
    - Support all three observability modes (minimal/standard/deep)
    - _Requirements: 5.1, 5.3, 5.4_
  - [ ] 7.2 Implement CAS integration for evidence storage
    - Store diagnosis reports as CAS blobs
    - Store large evidence collections as CAS blobs
    - Implement blob reference resolution
    - _Requirements: 3.4, 5.2_
  - [ ] 7.3 Implement observability queries
    - Query healing history per work item
    - Calculate diagnosis success/failure rates
    - Identify common root causes
    - _Requirements: 5.5_
  - [ ] 7.4 Write integration tests for observability
    - Test event emission in different modes
    - Test CAS storage and retrieval
    - Test observability query performance

- [ ] 8. Rollback Manager Interface (P2 Preparation)
  - [ ] 8.1 Define RollbackManager interface
    - Define `createRollbackPoint()` and `restoreFromRollbackPoint()` methods
    - Define RollbackPoint data structure
    - Implement as throwing "not implemented" in V6.0
    - _Requirements: 1.7, 1.8, 1.9, Property 24_
  - [ ] 8.2 Integrate rollback precondition into state machine
    - Enforce that `applying` state requires rollback point
    - Transition to `blocked` if rollback creation fails
    - Store rollback point reference in healing state
    - _Requirements: 1.8, Property 24_
  - [ ] 8.3 Write property-based tests for rollback precondition
    - **Property 24: Healing Rollback Precondition**
    - **Validates: Requirements 15.5, Property 24**
    - Verify applying state always has rollback point
    - Verify rollback failure leads to blocked state

- [ ] 9. CLI Integration
  - [ ] 9.1 Implement `specforge heal` command
    - Parse work item ID and optional parameters
    - Trigger healing state machine
    - Display status and results to user
    - _Requirements: 1.3, 3.5_
  - [ ] 9.2 Implement diagnosis report retrieval
    - `specforge heal report <workItemId>` command
    - Retrieve and format diagnosis report from CAS
    - Display recommended actions with risk tiers
    - _Requirements: 3.5_
  - [ ] 9.3 Implement healing status queries
    - `specforge heal status <workItemId>` command
    - Display current healing state and iteration count
    - Show history of healing attempts
    - _Requirements: 5.5_
  - [ ] 9.4 Write CLI integration tests
    - Test command parsing and validation
    - Test output formatting in both interactive and --json modes
    - Test error handling and user feedback

- [ ] 10. Property-Based Test Implementation
  - [ ] 10.1 Implement Property 24 test suite
    - Test rollback precondition for all healing scenarios
    - Verify blocked state on rollback creation failure
    - Test automatic rollback on verification failure (P2 scenario)
    - _Requirements: 1.7, 1.8, 1.9, Property 24_
  - [ ] 10.2 Implement Property 25 test suite
    - Test iteration bound enforcement across multiple triggers
    - Verify blocked state on 4th attempt
    - Test iteration counter persistence across restarts
    - _Requirements: 1.5, 1.6, Property 25_
  - [ ] 10.3 Implement state machine invariant tests
    - Test no invalid state transitions
    - Test state machine determinism
    - Test event emission consistency
    - _Requirements: 1.1, 5.1_
  - [ ] 10.4 Implement configuration consistency tests
    - Test allowed list configuration merging
    - Test risk tier rule consistency
    - Test configuration hot reload behavior
    - _Requirements: 2.2, 4.3, 5.4_

- [ ] 11. Integration and End-to-End Testing
  - [ ] 11.1 Set up integration test environment
    - Mock Event Bus and CAS dependencies
    - Create test work items with various error scenarios
    - Set up test configuration layers
    - _Requirements: All_
  - [ ] 11.2 Test end-to-end diagnosis flow
    - Simulate Gate failure with allowed error type
    - Verify diagnosis report generation
    - Verify event emission and CAS storage
    - _Requirements: 1.3, 3.1, 5.1_
  - [ ] 11.3 Test blocked scenarios
    - Test non-allowed error type rejection
    - Test iteration limit enforcement
    - Test external resource requirement blocking
    - _Requirements: 1.4, 1.6, 2.5_
  - [ ] 11.4 Test user-initiated healing
    - Test `specforge heal` command success path
    - Test error handling for invalid work items
    - Test report retrieval and display
    - _Requirements: 1.3, 3.5_

- [ ] 12. Performance and Reliability Testing
  - [ ] 12.1 Implement performance benchmarks
    - Measure diagnosis time for different error types
    - Test evidence collection scalability
    - Benchmark CAS storage/retrieval performance
    - _Requirements: 5.1_
  - [ ] 12.2 Test reliability under failure conditions
    - Test Event Bus connection failures
    - Test CAS storage failures
    - Test configuration loading failures
    - _Requirements: 1.8, 2.6_
  - [ ] 12.3 Test concurrent healing attempts
    - Test multiple simultaneous healing triggers
    - Verify per-work item isolation
    - Test thread safety of state machine
    - _Requirements: 1.5_

- [ ] 13. Documentation and API Finalization
  - [ ] 13.1 Write comprehensive API documentation
    - Document all public interfaces and methods
    - Include usage examples for common scenarios
    - Document configuration options and defaults
    - _Requirements: All_
  - [ ] 13.2 Create developer guide
    - Guide for extending allowed list
    - Guide for adding new diagnosis patterns
    - Guide for configuring risk tier rules
    - _Requirements: 2.2, 4.2_
  - [ ] 13.3 Finalize error codes and contracts
    - Define stable error codes for all failure modes
    - Document error response formats
    - Ensure backward compatibility commitments
    - _Requirements: 2.6, 5.4_

- [ ] 14. Final Verification and Delivery
  - [ ] 14.1 Run all tests and verify 100% pass rate
    - Unit tests, property-based tests, integration tests
    - Performance and reliability tests
    - CLI integration tests
    - _Requirements: All_
  - [ ] 14.2 Verify property inheritance
    - Confirm Property 24 and Property 25 are fully implemented
    - Verify all PBTs pass with required iteration counts
    - Document property implementation status
    - _Requirements: Property 24, Property 25_
  - [ ] 14.3 Verify V6.0 scope compliance
    - Confirm only Diagnose phase is implemented
    - Verify P2 stubs throw appropriate "not implemented" errors
    - Confirm no automated repair code present
    - _Requirements: 1.2, 4.4_
  - [ ] 14.4 Create delivery package
    - Bundle module with required dependencies
    - Generate type definitions and documentation
    - Create installation and integration instructions
    - _Requirements: All_

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "2.1", "2.2", "2.3"]
    },
    {
      "id": 1,
      "tasks": ["3.1", "3.2", "3.3", "4.1", "4.2", "5.1", "6.1"]
    },
    {
      "id": 2,
      "tasks": ["3.4", "4.3", "4.4", "5.2", "5.3", "5.4", "6.2", "6.3", "7.1", "7.2"]
    },
    {
      "id": 3,
      "tasks": ["2.4", "7.3", "7.4", "8.1", "8.2", "9.1", "9.2", "9.3"]
    },
    {
      "id": 4,
      "tasks": ["8.3", "9.4", "10.1", "10.2", "10.3", "10.4", "11.1"]
    },
    {
      "id": 5,
      "tasks": ["11.2", "11.3", "11.4", "12.1", "12.2", "12.3"]
    },
    {
      "id": 6,
      "tasks": ["13.1", "13.2", "13.3", "14.1", "14.2", "14.3", "14.4"]
    }
  ]
}
```

## Notes

### V6.0 Scope Boundaries

1. **Diagnose Phase Only**: This implementation only covers the Diagnose phase of the self-healing loop. The Propose, Approve, Apply, and Verify phases are defined as interface stubs that throw "not implemented" errors.

2. **No Automated Repairs**: V6.0 does not perform any automated code or artifact modifications. All repair recommendations are presented to users for manual execution.

3. **Safety Constraints**: Strict allowed list, iteration bounds, and risk tier classification ensure safe operation even in diagnosis-only mode.

4. **P2 Preparation**: Interfaces and data structures are designed to support future P2 implementation with minimal breaking changes.

### Property-Based Testing Requirements

1. **Property 24 (Healing Rollback Precondition)**: Must be tested with fast-check, verifying that applying state always has a rollback point and that rollback failure leads to blocked state.

2. **Property 25 (Healing Iteration Bound)**: Must be tested with fast-check, verifying that iteration count never exceeds 3 per work item.

3. **Property 8 (Serialization Round-trip)**: Inherited via observability integration, must be tested for all data models.

### Integration Points

1. **Event Bus**: All healing activities must emit events for observability.
2. **CAS**: Large evidence collections and diagnosis reports must use CAS blob references.
3. **sf-analyst**: Complex diagnosis scenarios should delegate to sf-analyst.
4. **CLI**: User interface via `specforge heal` command family.
5. **Configuration System**: Allowed list and risk tier rules use three-layer configuration.

### Error Handling

1. **Stable Error Codes**: All error conditions must have stable error codes that won't change across minor versions.
2. **User Feedback**: CLI commands must provide clear, actionable error messages.
3. **Event Logging**: All errors must be logged to events.jsonl for observability.

### Performance Considerations

1. **Evidence Collection**: Should be bounded in time and scope to avoid excessive data collection.
2. **CAS Usage**: Large data should use blob references to avoid bloating event payloads.
3. **Analysis Delegation**: Complex analysis should be delegated to avoid blocking the healing state machine.

### Security Considerations

1. **Read-Only in V6.0**: Diagnosis phase only reads data, no modifications.
2. **Allowed List Control**: Strict control over what can trigger diagnosis.
3. **Evidence Access**: Follows existing permission rules for data access.