# SpecForge v1.2 Write Guard Control Plane Hardening Fix05

## Result

IN_PROGRESS

## Defects targeted

- DEFECT-1: Write Guard runtime interception absent for shell / executor Write surfaces
- DEFECT-2: state_transition does not consume changed_files_audit failure before implementation_done
- DEFECT-3: sf_artifact_write work_log/template routing anomaly and missing extension file types

## Patch scope

- Adds write-guard-runtime-v12 helper.
- Patches sf_safe_bash handler to enforce shell write guard before execution.
- Patches sf_state_transition to reject implementation_running -> implementation_done unless changed_files_audit.md is clean.
- Patches sf_artifact_write work_log canonical inference and template interaction.
- Adds extension_request / extension_candidate / extension_delta file types.
- Extends plugin shell write pattern detection for PowerShell verbs.

## Limitations

OpenCode built-in Write/Edit/ApplyPatch calls inside subagents may still bypass plugin hooks depending on OpenCode runtime behavior. This patch adds daemon-side sf_safe_bash enforcement and state-machine audit enforcement so such bypasses cannot close cleanly. A follow-up may be required if OpenCode plugin hooks cannot intercept subagent built-in Write tools.