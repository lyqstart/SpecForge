# fix07 failed validation

RESULT: FAILED_VALIDATION
Stage: targeted unit test
Error summary: extractShellWriteTargets did not include src/todos/b.md from Out-File -FilePath escaped-quote command.
Script issue: parent BAT did not continue after bun command because bun is launched through a cmd shim on Windows and the script did not use call.
Next action: fix08 uses replace-files-only and call bun.
