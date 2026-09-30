# SpecForge v1.3.2 no-code audit close-gate repair

## Cause

The initial v1.3.2 close-gate test exposed two separate problems:

- The production close-gate logic still allowed `code_change_allowed=false` to satisfy normal implementation permission revocation, which made a `feature_spec` WI with no-code audit wording pass the permission check.
- The no-code positive test fixture did not satisfy existing v1.1 close governance invariants for `requirement_change_path`: it had empty candidate manifest entries and incomplete semantic approval metadata.

## Fix

- Normal implementation workflows must have `code_permission_revoked=true` or legacy `code_permission_released=true`.
- `code_change_allowed=false` alone is accepted only as part of the strict no-code investigation/review exception, together with a passed no-code audit.
- The no-code close-gate unit test now creates normalized candidate files/manifest entries and a user-approved decision record.

## Scope

This repair keeps the original safety boundary: implementation workflows are not weakened; only strict no-code investigation/review closeout can omit code permission.
