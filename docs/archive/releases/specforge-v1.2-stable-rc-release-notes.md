# SpecForge v1.2 Stable RC Release Notes

## Status

Release Candidate.

## Baseline

- v1.1-stable
- v1.2-project-spec-store-slice-complete
- v1.2-write-guard-preflight-slice-complete
- v1.2-extension-subflow-slice-complete
- v1.2-integration-rc-complete

## Included capabilities

### Project Spec Store

- project-level spec baseline
- candidate merge contract
- no-spec-impact evidence for quick_change

### Write Guard Preflight

- write-before-control API
- implementation_running state requirement
- code permission required
- revoke protection
- out-of-scope write denial
- direct .specforge/project/** write denial
- shell write risk classification
- close gate helper for blocked_write_attempts

### Extension Subflow

- Extension Request Artifact
- Extension Proposal Artifact
- Extension Registry merge
- stale registry version protection
- unapproved merge denial
- duplicate active extension_id denial
- parent resume token

## RC boundary

This RC does not claim live OpenCode acceptance has been completed. Live acceptance must be run separately using the generated prompt:

docs/reports/specforge-v1.2-live-opencode-acceptance-prompt.txt