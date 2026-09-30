# Implementation Plan: Migration Subsystem

## Overview

This implementation plan covers the development of the **Migration Subsystem** module for SpecForge V6. The Migration Subsystem handles schema versioning, automatic migration scripts, and recovery repair logic to ensure data consistency across version upgrades and system crashes.

**Parent Specification**: This plan implements requirements and architectural constraints from **[v6-architecture-overview](../v6-architecture-overview/)**.

**Scope**: **P0** - Required for V6.0 release.

**Inherited Correctness Properties**:
- Property 14: Schema Version Monotonicity
- Property 20: Recovery Consistency Repair

## Tasks

### Phase 1: Foundation
- [x] 1.1 Set up project structure and build configuration
  - Create TypeScript project with proper tsconfig
  - Set up build scripts (tsc, maybe esbuild)
  - Configure linting (ESLint) and formatting (Prettier)
  - _Requirements: All_

- [x] 1.2 Implement schema version detection
  - Read `schema_version` from JSON files
  - Semantic version comparison logic
  - Version comparison result classification (equal, newer, older)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 1.3 Create migration directory structure
  - Ensure `~/.specforge/migrations/` exists
  - Ensure `~/.specforge/backups/` exists
  - Set appropriate directory permissions
  - _Requirements: 1.5, 1.6_

### Phase 2: Migration Script Framework
- [x] 2.1 Define migration script interface
  - TypeScript interface for migration scripts
  - Version range matching logic
  - Script metadata validation
  - _Requirements: 1.5_

- [x] 2.2 Implement migration script discovery
  - Scan migration directory for scripts
  - Match scripts to required version transitions
  - Validate script compatibility and safety
  - _Requirements: 1.5_

- [x] 2.3 Implement backup manager
  - Create timestamped backups
  - Backup file naming convention
  - Backup retention policy (7 days default)
  - Restore from backup functionality
  - _Requirements: 1.6_

### Phase 3: Migration Execution
- [x] 3.1 Implement transactional script execution
  - Pre-migration backup
  - Script execution with timeout
  - Error handling and rollback
  - Post-migration validation
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3.2 Implement schema validator
  - Basic JSON schema validation
  - Required field checking
  - Type validation
  - Custom validation hooks
  - _Requirements: 3.3, 3.5_

- [x] 3.3 Implement migration dry-run mode
  - Preview changes without applying
  - Change summary reporting
  - Validation in dry-run mode
  - _Requirements: 3.5_

### Phase 4: Recovery Repair Engine
- [x] 4.1 Implement inconsistency detection
  - Detect (events.jsonl, state.json) inconsistencies
  - Identify specific inconsistency types
  - Severity classification
  - _Requirements: 2.1, 2.2_

- [x] 4.2 Implement predefined repair rules
  - Rule 1: Rebuild from events.jsonl when valid
  - Rule 2: Use state.json with warning when events corrupted
  - Rule 3: Roll back to requirements phase when design.md missing
  - Rule 4: Fresh start when both corrupted
  - _Requirements: 2.2, 2.3, 2.5_

- [x] 4.3 Implement repair event logging
  - `recovery.repaired` event structure
  - Event payload with repair details
  - Integration with Daemon event logging
  - _Requirements: 2.3, 2.6_

### Phase 5: Integration
- [x] 5.1 Integrate with Daemon startup
  - Migration execution during startup
  - Version downgrade prevention
  - Startup failure handling
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 5.2 Implement error handling and reporting
  - User-friendly error messages
  - Upgrade prompts for version downgrades
  - Migration failure recovery
  - _Requirements: 1.4, 3.2, 3.6_

- [x] 5.3 Implement configuration integration
  - Migration settings in configuration layers
  - Backup retention configuration
  - Dry-run mode configuration
  - _Requirements: 3.5_

### Phase 6: Property-Based Testing
- [x] 6.1 Implement Property 14 test: Schema Version Monotonicity
  - **Property 14: Schema Version Monotonicity**
  - **Validates: Requirements 30.14, 18.2, 18.6**
  - Generate random migration sequences
  - Verify `schema_version` never decreases
  - Test edge cases (multiple migrations, rollback scenarios)
  - Use fast-check for property testing

- [x] 6.2 Implement Property 20 test: Recovery Consistency Repair
  - **Property 20: Recovery Consistency Repair**
  - **Validates: Requirements 12.3**
  - Generate corrupted state/event pairs
  - Verify repair rules produce consistent state
  - Test all predefined repair rules
  - Verify `rebuild(events) == s'` after repair

### Phase 7: Unit Testing
- [x] 7.1 Write unit tests for version detection
  - Version comparison tests
  - Schema version extraction tests
  - Edge case tests (missing version, invalid format)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 7.2 Write unit tests for migration script framework
  - Script discovery tests
  - Version matching tests
  - Script validation tests
  - _Requirements: 1.5, 2.1_

- [x] 7.3 Write unit tests for backup manager
  - Backup creation tests
  - Restore functionality tests
  - Retention policy tests
  - _Requirements: 1.6, 3.2_

- [x] 7.4 Write unit tests for repair engine
  - Inconsistency detection tests
  - Repair rule application tests
  - Event logging tests
  - _Requirements: 2.1-2.6_

### Phase 8: Integration Testing
- [x] 8.1 End-to-end migration tests
  - Simulate version upgrade scenarios
  - Test multiple consecutive migrations
  - Verify data integrity after migration
  - _Requirements: All_

- [x] 8.2 Crash recovery tests
  - Simulate crashes during migration
  - Test backup restoration
  - Verify system recovers correctly
  - _Requirements: 3.2, 3.6_

- [x] 8.3 Repair scenario tests
  - Create various inconsistent states
  - Verify correct repair rule application
  - Test event logging for repairs
  - _Requirements: 2.1-2.6_

### Phase 9: Documentation and Finalization
- [x] 9.1 Write API documentation
  - Migration script API
  - Repair rule API
  - Configuration options
  - _Requirements: All_

- [x] 9.2 Create user documentation
  - Migration process explanation
  - Recovery repair explanation
  - Troubleshooting guide
  - _Requirements: All_

- [x] 9.3 Final validation and cleanup
  - Run all tests
  - Code review and refactoring
  - Performance optimization
  - _Requirements: All_

## Testing Strategy

### Property-Based Tests
1. **Property 14 Test**: Verify schema version monotonicity
2. **Property 20 Test**: Verify recovery consistency repair

### Unit Tests
1. Version detection and comparison
2. Migration script discovery and validation
3. Backup creation and restoration
4. Transactional migration execution
5. Repair rule application
6. Schema validation
7. Error handling and reporting

### Integration Tests
1. End-to-end migration scenarios
2. Crash during migration recovery
3. Multiple repair scenarios
4. Configuration integration
5. Daemon startup integration

### Performance Tests
1. Migration execution time for large files
2. Backup/restore performance
3. Startup time impact with migrations
4. Memory usage during migration

## Dependencies

### Internal Dependencies
- **Daemon Core**: For startup integration and event logging
- **Configuration Subsystem**: For migration settings
- **File System Utilities**: For file operations

### External Dependencies
- **fast-check**: For property-based testing
- **semver**: For semantic version comparison
- **zod**: For schema validation (optional)

## Notes

- All migration scripts must be idempotent
- Backup retention should be configurable
- Migration failures should not corrupt user data
- Repair actions must be logged for auditability
- Version downgrades must be prevented with clear error messages
- The implementation must follow P0 scope boundaries
- Error handling must align with parent spec's error classification
- All persistent files must include `schema_version` field