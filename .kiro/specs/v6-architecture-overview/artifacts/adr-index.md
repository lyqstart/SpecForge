# V6 Spec-local ADR Index - SpecForge V6 Architecture

## Overview

This document indexes the architecture decisions embedded in the SpecForge V6 architecture overview specification. Product scope remains authoritative in `../requirements.md`, and product architecture remains authoritative in `../design.md`; this file is a navigation projection and does not define a parallel authority.

## Namespace boundary

- Entries in this file use the explicit `V6-ADR-*` namespace and refer to rows in `../design.md`.
- Repository-level decision records use `docs/adr/ADR-*` and are separate records.
- In particular, repository [`ADR-013: 当前发布边界与不保留旧项目兼容`](../../../../docs/adr/ADR-013-current-release-boundary-and-no-legacy-compatibility.md) is not the same record as spec-local `V6-ADR-013: Plugin Sandbox`.
- Cross-document references must use `V6-ADR-*` or the repository ADR's full path/title; bare `ADR-013` is ambiguous and prohibited.

Each ADR is documented in the main design document (`design.md`) and summarized here with:
- **Decision Summary**: Brief description of the architectural decision
- **Requirements**: Corresponding requirement numbers from `requirements.md`
- **Design Reference**: Link to the exact location in `design.md`

## ADR Index

### V6-ADR-001: Daemon Communication Protocol
**Decision Summary**: Daemon uses HTTP/1.1 + SSE, binds to 127.0.0.1 dynamic port with Bearer Token authentication.

**Requirements**: REQ-5

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 1)

### V6-ADR-002: Session Identity Strategy
**Decision Summary**: Session identity uses "pre-registration + first-contact binding" strategy.

**Requirements**: REQ-6

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 2)

### V6-ADR-003: Permission Engine Three-Layer Model
**Decision Summary**: Permission system has three layers: hard rules (coded), built-in policies, and user policies; hard rules cannot be overridden by configuration.

**Requirements**: REQ-7

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 3)

### V6-ADR-004: OpenCode Adapter Isolation
**Decision Summary**: OpenCode behavior changes are absorbed only by OpenCodeAdapter; adapter version aligns with OpenCode major version.

**Requirements**: REQ-8

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 4)

### V6-ADR-005: Configuration Four-Layer Model
**Decision Summary**: Configuration uses four layers (built-in defaults → user-level → project-level → runtime); sensitive fields cannot be overridden at project level.

**Requirements**: REQ-9

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 5)

### V6-ADR-006: Project Directory Structure
**Decision Summary**: Project directory changed to `<project>/.specforge/` (dot-prefixed) to align with `.git` style and avoid workspace pollution.

**Requirements**: REQ-10

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 6)

### V6-ADR-007: CLI Dual-Mode Design
**Decision Summary**: CLI supports dual modes: default interactive (colored) and `--json` machine-friendly mode; asynchronous commands return jobId.

**Requirements**: REQ-11

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 7)

### V6-ADR-008: Write-Ahead Log (WAL) Semantics
**Decision Summary**: Uses WAL semantics: `events.jsonl` fsync first, then `state.json` update.

**Requirements**: REQ-12, REQ-30.7

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 8)

### V6-ADR-009: Single Daemon with Multi-Project Context
**Decision Summary**: Single Daemon instance maintains multiple project contexts with per-project write locks.

**Requirements**: REQ-13

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 9)

### V6-ADR-010: Multimodal Foundation Only in V6.0
**Decision Summary**: V6.0 only implements multimodal foundation skeleton; complete support deferred to P2; V6.0 rejects multimodal content submissions.

**Requirements**: REQ-14, REQ-25.3

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 10)

### V6-ADR-011: Self-Healing Loop - Diagnose Only in V6.0
**Decision Summary**: V6.0 artifact contains only Diagnose and its read-only implementation; future-loop interfaces or source do not authorize Propose/Approve/Apply/Verify in the current artifact.

**Requirements**: REQ-15.7

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 11)

### V6-ADR-012: Telegram Integration via OpenClaw Bridge
**Decision Summary**: Telegram integration handled by OpenClaw bridge, not directly by SpecForge; OpenClaw end-to-end workflow is a V6.0 quality gate.

**Requirements**: REQ-11.6, REQ-16, REQ-26

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 12)

### V6-ADR-013: Plugin Sandbox - Static Checks Only in V6.0
**Decision Summary**: V6.0 artifact includes only plugin manifest static checks and permission-declaration validation; runtime isolation, hot loading, and resource governance are excluded.

**Requirements**: REQ-17

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 13)

### V6-ADR-014: Current-chain Schema Versioning and Migration
**Decision Summary**: Persistent files include `schema_version`; `code > file` migrates only along an explicitly supported current-product schema chain after backup, while `file > code`, unknown, and legacy formats fail closed.

**Requirements**: REQ-18

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 14)

### V6-ADR-015: No Legacy Project Compatibility
**Decision Summary**: V6.0 provides no V5/legacy project detection, migration, import, compatibility write, or runtime fallback.

**Requirements**: REQ-18.7, REQ-26

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 15)

### V6-ADR-016: Event Bus Multi-Machine Sync Fields
**Decision Summary**: Event Bus and events.jsonl include multi-machine sync fields from day-1 (global event ID, monotonic timestamp, project dimension).

**Requirements**: REQ-19

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 16)

### V6-ADR-017: sf-analyst and sf-debugger Separation
**Decision Summary**: sf-analyst (reads observability data) separated from sf-debugger (fixes code issues).

**Requirements**: REQ-20.3

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 17)

### V6-ADR-018: sf-knowledge Role Preservation
**Decision Summary**: sf-knowledge role preserved in V6.0 with basic skeleton; complete capabilities deferred to V6.1.

**Requirements**: REQ-20.4

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 18)

### V6-ADR-019: Built-in Feature Spec Workflow Only
**Decision Summary**: V6.0 loads and deploys only the built-in `feature_spec` workflow; other workflow definitions remain built-not-enabled until the product authority promotes them.

**Requirements**: REQ-23.4, REQ-24.6

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 19)

### V6-ADR-020: Correctness Properties as Architectural Invariants
**Decision Summary**: Correctness Properties defined as architectural invariants in this document; downstream module specs refine them into executable PBTs.

**Requirements**: REQ-30

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 20)

### V6-ADR-021: Historical Evidence Is Not Runtime Compatibility
**Decision Summary**: Historical governance evidence remains immutable and auditable, but it is not a runtime, build, installer, migration, or release-validation input for legacy behavior.

**Requirements**: REQ-26, REQ-31

**Design Reference**: [design.md](../design.md#5-设计决策adr) (Table row 21)

## Usage Guidelines

### For Module Spec Authors
1. **Reference ADRs**: When designing a module that implements or depends on an architectural decision, use the `V6-ADR-*` identifier (e.g., "Implements V6-ADR-003").
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
