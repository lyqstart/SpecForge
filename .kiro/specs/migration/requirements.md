# Requirements Document: Migration Subsystem

## Introduction

This specification defines the **Migration Subsystem** module for SpecForge V6. The Migration Subsystem handles schema versioning, automatic migration scripts, and recovery repair logic to ensure data consistency across SpecForge version upgrades and system crashes.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 14: Schema Version Monotonicity
*For all* persistent files f and migration script execution results, the `schema_version` written after migration execution must be ≥ the `schema_version` before migration; no migration may cause `schema_version` to decrease.

**Validates: Requirements 30.14, 18.2, 18.6**

### Property 20: Recovery Consistency Repair
*For all* inconsistent (events.jsonl, state.json) combinations detected at startup, the Migration/Recovery subsystem must roll back to a consistent snapshot s' according to predefined repair rules, and write a `recovery.repaired` event recording the repair path; after repair, `rebuild(events) == s'` must hold.

**Validates: Requirements 12.3**

## Requirements

### Requirement 1: Schema Version Framework Implementation

**User Story:** As a long-term user, I want SpecForge's persistent file formats to be evolvable, so that version upgrades don't break my data.

#### Acceptance Criteria

1. THE Migration_Subsystem SHALL ensure every SpecForge persistent file header contains a `schema_version` field.
2. WHEN Daemon starts and `code_schema_version > file_schema_version`, THE Migration_Subsystem SHALL automatically run migration scripts.
3. WHEN Daemon starts and `file_schema_version == code_schema_version`, THE Daemon SHALL start normally without upgrade prompts.
4. IF `file_schema_version > code_schema_version`, THEN THE Daemon SHALL first show upgrade prompt (explaining SpecForge needs upgrade), then refuse to start; refusal triggers only when strictly greater.
5. THE Migration_Subsystem SHALL look for version-to-version migration scripts in `~/.specforge/migrations/` (e.g., `v1.0-to-v1.1.ts`).
6. WHEN migration script executes, THE Migration_Subsystem SHALL backup current file to `~/.specforge/backups/<timestamp>/` before migration.
7. THE Migration_Subsystem SHALL NOT implement V5→V6 data migration tool in V6.0 (per REQ-26 "not doing" list).

### Requirement 2: Recovery Repair Rules Implementation

**User Story:** As a system reliability engineer, I want the Daemon to implement recovery repair rules from REQ-12, so that inconsistent states after crashes are automatically repaired.

#### Acceptance Criteria

1. THE Migration_Subsystem SHALL implement predefined repair rules for inconsistent (events.jsonl, state.json) combinations detected at startup.
2. WHEN inconsistency is detected, THE Migration_Subsystem SHALL roll back to a consistent snapshot s' according to repair rules.
3. AFTER repair, THE Migration_Subsystem SHALL write a `recovery.repaired` event recording the repair path.
4. THE repaired state must satisfy `rebuild(events) == s'` (idempotent recovery property).
5. THE Migration_Subsystem SHALL handle at least the following inconsistency scenarios:
   - state.json records design phase but design.md doesn't exist (roll back to requirements phase)
   - events.jsonl missing or corrupted (use state.json as fallback with appropriate warning)
   - state.json missing or corrupted (rebuild from events.jsonl)
6. ALL repair actions must be logged in events.jsonl for auditability.

### Requirement 3: Migration Script Execution Safety

**User Story:** As a cautious user, I want migration scripts to execute safely with rollback capability, so that failed migrations don't corrupt my data.

#### Acceptance Criteria

1. THE Migration_Subsystem SHALL execute migration scripts in a transactional manner where possible.
2. WHEN migration script fails, THE Migration_Subsystem SHALL restore from backup created in Requirement 1.6.
3. THE Migration_Subsystem SHALL validate migration script output against target schema version before committing.
4. ALL migration scripts must be idempotent: running them multiple times on same data produces same result.
5. THE Migration_Subsystem SHALL provide dry-run mode for migration scripts to preview changes.
6. MIGRATION scripts must not delete user data without explicit confirmation or backup.

## Glossary

- **Schema Version**: Version number in persistent file headers indicating the format version of the file.
- **Migration Script**: TypeScript/JavaScript file that transforms data from one schema version to another.
- **Recovery Repair**: Process of fixing inconsistent state after system crash or unexpected termination.
- **WAL (Write-Ahead Log)**: Crash-safe semantics where events are written to log and fsynced before state is updated.
- **Idempotent**: Property where applying an operation multiple times has same effect as applying it once.
- **Backup Directory**: `~/.specforge/backups/<timestamp>/` where pre-migration files are stored.
- **Migration Directory**: `~/.specforge/migrations/` where version-to-version migration scripts are stored.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 14 Test**: Verify schema version monotonicity across migrations
2. **Property 20 Test**: Verify recovery consistency repair rules

### Unit Tests

1. Schema version detection and comparison tests
2. Migration script lookup and execution tests
3. Backup creation and restoration tests
4. Recovery repair rule tests for various inconsistency scenarios
5. Transactional migration execution tests
6. Idempotency tests for migration scripts

### Integration Tests

1. End-to-end migration scenario: old version → migration → new version
2. Crash during migration recovery tests
3. Multiple consecutive migration script execution tests
4. Recovery repair integration with Daemon startup
5. Backup and restore functionality tests

## Notes

- This spec implements the **migration** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- Migration scripts should be written in TypeScript/JavaScript to leverage existing toolchain.
- The migration subsystem must coordinate with Daemon Core for state reconstruction and event logging.