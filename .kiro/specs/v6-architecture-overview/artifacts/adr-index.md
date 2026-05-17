# ADR Index - SpecForge V6 Architecture

## Overview

This document serves as the authoritative index for all Architecture Decision Records (ADRs) in the SpecForge V6 architecture overview specification. It provides a centralized reference point for downstream module specifications to locate and reference architectural decisions.

Each ADR is documented in the main design document (`design.md`) and summarized here with:
- **Decision Summary**: Brief description of the architectural decision
- **Requirements**: Corresponding requirement numbers from `requirements.md`
- **Design Reference**: Link to the exact location in `design.md`

## ADR Index

### ADR-001: Daemon Communication Protocol
**Decision Summary**: Daemon uses HTTP/1.1 + SSE, binds to 127.0.0.1 dynamic port with Bearer Token authentication.

**Requirements**: REQ-5

**Design Reference**: [design.md#adr-001](design.md#5-design决策-adr) (Table row 1)

### ADR-002: Session Identity Strategy
**Decision Summary**: Session identity uses "pre-registration + first-contact binding" strategy.

**Requirements**: REQ-6

**Design Reference**: [design.md#adr-002](design.md#5-design决策-adr) (Table row 2)

### ADR-003: Permission Engine Three-Layer Model
**Decision Summary**: Permission system has three layers: hard rules (coded), built-in policies, and user policies; hard rules cannot be overridden by configuration.

**Requirements**: REQ-7

**Design Reference**: [design.md#adr-003](design.md#5-design决策-adr) (Table row 3)

### ADR-004: OpenCode Adapter Isolation
**Decision Summary**: OpenCode behavior changes are absorbed only by OpenCodeAdapter; adapter version aligns with OpenCode major version.

**Requirements**: REQ-8

**Design Reference**: [design.md#adr-004](design.md#5-design决策-adr) (Table row 4)

### ADR-005: Configuration Four-Layer Model
**Decision Summary**: Configuration uses four layers (built-in defaults → user-level → project-level → runtime); sensitive fields cannot be overridden at project level.

**Requirements**: REQ-9

**Design Reference**: [design.md#adr-005](design.md#5-design决策-adr) (Table row 5)

### ADR-006: Project Directory Structure
**Decision Summary**: Project directory changed to `<project>/.specforge/` (dot-prefixed) to align with `.git` style and avoid workspace pollution.

**Requirements**: REQ-10

**Design Reference**: [design.md#adr-006](design.md#5-design决策-adr) (Table row 6)

### ADR-007: CLI Dual-Mode Design
**Decision Summary**: CLI supports dual modes: default interactive (colored) and `--json` machine-friendly mode; asynchronous commands return jobId.

**Requirements**: REQ-11

**Design Reference**: [design.md#adr-007](design.md#5-design决策-adr) (Table row 7)

### ADR-008: Write-Ahead Log (WAL) Semantics
**Decision Summary**: Uses WAL semantics: `events.jsonl` fsync first, then `state.json` update.

**Requirements**: REQ-12, REQ-30.7

**Design Reference**: [design.md#adr-008](design.md#5-design决策-adr) (Table row 8)

### ADR-009: Single Daemon with Multi-Project Context
**Decision Summary**: Single Daemon instance maintains multiple project contexts with per-project write locks.

**Requirements**: REQ-13

**Design Reference**: [design.md#adr-009](design.md#5-design决策-adr) (Table row 9)

### ADR-010: Multimodal Foundation Only in V6.0
**Decision Summary**: V6.0 only implements multimodal foundation skeleton; complete support deferred to P2; V6.0 rejects multimodal content submissions.

**Requirements**: REQ-14, REQ-25.3

**Design Reference**: [design.md#adr-010](design.md#5-design决策-adr) (Table row 10)

### ADR-011: Self-Healing Loop - Diagnose Only in V6.0
**Decision Summary**: Self-healing state machine is fully defined but V6.0 only implements Diagnose phase; complete loop deferred to V6.x.

**Requirements**: REQ-15.7

**Design Reference**: [design.md#adr-011](design.md#5-design决策-adr) (Table row 11)

### ADR-012: Telegram Integration via OpenClaw Bridge
**Decision Summary**: Telegram integration handled by OpenClaw bridge, not directly by SpecForge; OpenClaw end-to-end workflow is a V6.0 quality gate.

**Requirements**: REQ-11.6, REQ-16, REQ-26

**Design Reference**: [design.md#adr-012](design.md#5-design决策-adr) (Table row 12)

### ADR-013: Plugin Sandbox - Static Checks Only in V6.0
**Decision Summary**: Plugin sandbox in V6.0 uses only static checks + permission declarations; runtime isolation deferred to P2.

**Requirements**: REQ-17

**Design Reference**: [design.md#adr-013](design.md#5-design决策-adr) (Table row 13)

### ADR-014: Schema Versioning and Migration
**Decision Summary**: Persistent files must include `schema_version` field; `file > code` rejects startup, `code > file` triggers automatic migration.

**Requirements**: REQ-18

**Design Reference**: [design.md#adr-014](design.md#5-design决策-adr) (Table row 14)

### ADR-015: V5→V6 Data Migration Tool Excluded
**Decision Summary**: V5→V6 data migration tool excluded from V6.0 scope.

**Requirements**: REQ-18.7, REQ-26

**Design Reference**: [design.md#adr-015](design.md#5-design决策-adr) (Table row 15)

### ADR-016: Event Bus Multi-Machine Sync Fields
**Decision Summary**: Event Bus and events.jsonl include multi-machine sync fields from day-1 (global event ID, monotonic timestamp, project dimension).

**Requirements**: REQ-19

**Design Reference**: [design.md#adr-016](design.md#5-design决策-adr) (Table row 16)

### ADR-017: sf-analyst and sf-debugger Separation
**Decision Summary**: sf-analyst (reads observability data) separated from sf-debugger (fixes code issues).

**Requirements**: REQ-20.3

**Design Reference**: [design.md#adr-017](design.md#5-design决策-adr) (Table row 17)

### ADR-018: sf-knowledge Role Preservation
**Decision Summary**: sf-knowledge role preserved in V6.0 with basic skeleton; complete capabilities deferred to V6.1.

**Requirements**: REQ-20.4

**Design Reference**: [design.md#adr-018](design.md#5-design决策-adr) (Table row 18)

### ADR-019: Built-in Feature Spec Workflow Only
**Decision Summary**: V6.0 delivers only built-in feature_spec workflow; workflow data-driven extension and Gate composition deferred to V6.1.

**Requirements**: REQ-23.4, REQ-24.6

**Design Reference**: [design.md#adr-019](design.md#5-design决策-adr) (Table row 19)

### ADR-020: Correctness Properties as Architectural Invariants
**Decision Summary**: Correctness Properties defined as architectural invariants in this document; downstream module specs refine them into executable PBTs.

**Requirements**: REQ-30

**Design Reference**: [design.md#adr-020](design.md#5-design决策-adr) (Table row 20)

## Usage Guidelines

### For Module Spec Authors
1. **Reference ADRs**: When designing a module that implements or depends on an architectural decision, reference the corresponding ADR by number (e.g., "Implements ADR-003").
2. **Check Consistency**: Ensure your module design aligns with the ADR decisions. If deviation is necessary, document the rationale and update the ADR through proper change process.
3. **Link to Design**: Use the design reference links to provide context for reviewers.

### For Reviewers
1. **Verify ADR Alignment**: Check that module specifications properly reference and align with relevant ADRs.
2. **Flag Inconsistencies**: Identify any architectural deviations not justified by updated ADRs.

### For Maintainers
1. **Update Index**: When new ADRs are added to `design.md`, update this index accordingly.
2. **Version Control**: This index should be versioned alongside the design document.

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-10 | Initial ADR index created for V6 architecture overview spec |

## Related Documents

- [design.md](../design.md) - Main design document containing full ADR details
- [requirements.md](../requirements.md) - Requirements referenced by ADRs
- [tasks.md](../tasks.md) - Implementation tasks including this ADR index creation