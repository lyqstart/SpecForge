# SpecForge v1.2 Write Guard Native Tool Shadow fix11

RESULT: FIX11_REPLACEMENT_PREPARED

## Purpose

Fix fix10 live acceptance failure where OpenCode native Write shadowing blocked authorized allowed_write_files writes.

## Changes

- Define plugin-local normalizeSlashes used by native shadow path helpers.
- Prefer local authoritative implementation_running Work Item allowlist before daemon checkWrite fallback.
- Stop stale unrelated hard_stop.json files from globally blocking native write/edit paths.
- Keep fail-closed behavior for unauthorized, out-of-scope, and outside-project targets.

## Expected live acceptance

- Unauthorized native Write remains blocked.
- Authorized native Write to allowed_write_files succeeds and can close.
- Out-of-scope native Write is blocked or audit-failed before close.
