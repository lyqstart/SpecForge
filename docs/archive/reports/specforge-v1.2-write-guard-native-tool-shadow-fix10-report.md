# SpecForge v1.2 Write Guard Native Tool Shadow fix10 report

RESULT: FIX10_REPLACE_FILES_PREPARED

## Scope

Fix the fix09 over-blocking regression in the OpenCode native `write`/`edit` shadow tools.

## Changed file

- `setup/userlevel-opencode/plugins/sf_specforge.ts`

## Rule

The shadowed native write/edit tools still call daemon `checkWrite` first. If daemon denies the write, fix10 applies a local authoritative-state allowlist fallback using:

- `.specforge/runtime/state.json` as authoritative WI state;
- `.specforge/work-items/<WI>/work_item.json` for `code_change_allowed`, `code_permission_revoked`, and `allowed_write_files`;
- project-relative target normalization for both relative and absolute allowed file entries;
- `implementation_running` as the only agent-write-allowed state;
- `.specforge/project/**` as still forbidden for agent write.

## Expected behavior

- Unauthorized native Write remains blocked.
- Authorized native Write to `allowed_write_files` succeeds.
- Out-of-scope native Write remains blocked.

## Validation required after apply

- `bun run build`
- `scripts/run-install-deployment-consistency.ps1`
- live acceptance for negative, positive, and out-of-scope native Write.
