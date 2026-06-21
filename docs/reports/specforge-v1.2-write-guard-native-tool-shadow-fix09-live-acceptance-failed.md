# SpecForge v1.2 Write Guard Native Tool Shadow fix09 live acceptance failed

RESULT: FIX09_LIVE_ACCEPTANCE_FAILED

## Blocking result

fix09 prevents OpenCode native Write from bypassing Write Guard, but it over-blocks authorized writes.

## Evidence

- Negative WI-0010: unauthorized native Write was blocked and target file was not created.
- Positive WI-0011: authorized native Write was blocked with `policy_violation` even though authoritative state was `implementation_running`, `code_change_allowed=true`, and the target appeared in `allowed_write_files` in relative and absolute variants.
- Out-of-scope WI-0012: out-of-scope native Write was blocked, but this pass is not sufficient because the positive path is broken.
- Consolidated live report was stored at `.specforge/work-items/WI-0013/verification_report.md` because `.specforge/reports/` was unreachable under the sticky hard_stop condition.

## Root cause to fix

The native shadow write/edit tool delegates to daemon `checkWrite`; in live acceptance, this path denies authorized writes. The hotfix must preserve denial for unauthorized/out-of-scope writes while allowing writes that match the active implementation-running WI allowlist.

## Required next action

Apply fix10 and rerun live acceptance. Do not tag stable until the positive native Write path closes successfully.
