# SpecForge v1.2 Write Guard Native Tool Shadow fix10 live acceptance failed

RESULT: FIX10_LIVE_ACCEPTANCE_FAILED

## Evidence summary

- Negative native Write was blocked.
- Out-of-scope native Write was blocked conditionally.
- Positive authorized native Write failed: allowed_write_files target was blocked.

## Blocking defects

- DEFECT-PR1 CRITICAL: native Write permission routing resolved the wrong Work Item.
- DEFECT-H2 MAJOR: stale hard_stop from unrelated Work Items globally contaminated active native write scenarios.
- DEFECT-ER1 MINOR: plugin wrapper referenced normalizeSlashes without defining it.

## Next fix

fix11 must keep native write shadowing, but allow authorized writes by using the local authoritative implementation_running Work Item allowlist before falling back to daemon checkWrite. It must also stop treating unrelated historical hard_stop.json files as project-global blockers.
