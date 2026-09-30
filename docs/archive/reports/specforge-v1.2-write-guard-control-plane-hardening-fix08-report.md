# SpecForge v1.2 Write Guard Control Plane Hardening Fix08

## Result

REPLACE_FILES_ONLY

## Purpose

Fix08 repairs the targeted unit test failure after fix07.

## What happened in fix07

The WIP replacement snapshot was committed and pushed, but the targeted unit test failed:

```text
expected targets to include src/todos/b.md
```

The failed command uses escaped quotes:

```text
Out-File -FilePath \"src/todos/b.md\"
```

The parser handled the Set-Content target but did not normalize escaped shell quotes before extracting the Out-File FilePath value.

## Fix

`write-guard-runtime-v12.ts` is delivered as a complete replacement file.

The local script does not dynamically generate TypeScript and does not regex-insert source code.

## Additional script correction

The BAT validation command now uses `call bun ...` so Windows batch control returns to the parent script after running `bun`.
