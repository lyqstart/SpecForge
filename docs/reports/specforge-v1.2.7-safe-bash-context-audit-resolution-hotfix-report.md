# SpecForge v1.2.7 Safe Bash Context + Audit Resolution Hotfix Report

## Scope

This hotfix fixes the v1.2.7 maintenance issue discovered by fj1 WI-0003:

1. `sf_changed_files_audit` did not recognize structured `hard_stop_resolution.jsonl` decisions.
2. Deployment / remote-ops entries were evaluated as project code writes against `allowed_write_files`.
3. Historical blocked writes remained visible but were not classifiable through the hard-stop resolution source.

## Fixed Files

- `packages/daemon-core/src/tools/lib/hard-stop-resolution-log.ts`
- `packages/daemon-core/src/tools/lib/blocked-write-classification.ts`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts`
- `tests/regression/v1.2.7-safe-bash-context-audit-resolution.test.ts`

## Expected Behavior

- Historical blocked writes remain visible.
- Blocked writes with structured hard-stop resolutions are classified as resolved.
- Unresolved blocked writes still fail the audit.
- Remote deployment operations are reported separately and are not counted as project-file `out_of_scope` entries.

## fj1 Impact

After upgrading to v1.2.7, rerun `sf_changed_files_audit` for WI-0003. The earlier `risk_accepted` / `false_positive` resolution records should be recognized by the audit classifier, and remote ops entries should be separated from project file writes.
