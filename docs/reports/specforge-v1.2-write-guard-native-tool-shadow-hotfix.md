# v1.2 Write Guard native tool shadow hotfix

RESULT: HOTFIX_READY_FOR_VALIDATION

## Blocking defect

DEFECT-1b CRITICAL: OpenCode native Write/Edit/ApplyPatch tools can bypass SpecForge Write Guard in subagent execution.

## Fix

`setup/userlevel-opencode/plugins/sf_specforge.ts` now registers same-name plugin tools:

- `write`
- `edit`
- `apply_patch`

OpenCode gives plugin tools precedence over built-in tools when names collide. The replacement `write` and `edit` tools call daemon `checkWrite(...)` before touching files. `apply_patch` is fail-closed because patch target extraction is ambiguous.

## Required validation

1. `bun run build`
2. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-install-deployment-consistency.ps1`
3. Restart OpenCode
4. Live negative: native Write without code_permission must be blocked
5. Live positive: authorized write/edit within allowed_write_files must close
6. Live audit-failed: out-of-scope write must block implementation_done

## Release rule

Do not tag stable until native Write bypass live acceptance passes.
