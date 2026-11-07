# Changed Files Audit

Contract: changed-files-audit/v1
Work Item: WI-0001
Command: N/A
Timestamp: 2026-11-07T09:38:32.320Z
Data Source: write_guard_log.jsonl (8 entries, 5 allowed writes, 1 blocked writes)
Policy Source: hard_stop_resolution.jsonl (1) + write_guard_authorizations.jsonl (0)

## Result: PASS

- Total files: 5
- In scope: 5
- Out of scope: 0
- Violations: 0
- Remote ops entries: 0
- Governed regenerable artifacts: 0
- Blocked write attempts: 1
- Historical/resolved blocked write attempts: 1
- Authorization-resolved blocked write attempts: 0
- Unresolved blocked write attempts: 0

## Remote Ops Entries

None.

## Governed Regenerable Artifacts

None.

## Blocked Write Attempts

- Total blocked write attempts: 1
- Historical/resolved: 1
- Authorization-resolved: 0
- Unresolved: 0
- Hard stop resolutions: 1
- Project-level write_guard authorizations: 0

### Historical / Resolved Blocked Writes

- [modify] .specforge/** → hard_stop_resolution_resolved (Blocked attempt has a structured hard_stop_resolution.jsonl entry with resolution_type=operator_error. The blocked attempt remains visible, but is not an unresolved audit violation.)

### Unresolved Blocked Writes

None.

## Entries

- [create] package.json → in_scope
- [create] tsconfig.json → in_scope
- [create] src/greet.ts → in_scope
- [create] tests/greet.test.ts → in_scope
- [modify] README.md → in_scope

Write Guard Evidence SHA256: 7b89d71314e0f3462d07ad835e1e8fbc2383ea21706bb9fa5a5bee78f1db8920
