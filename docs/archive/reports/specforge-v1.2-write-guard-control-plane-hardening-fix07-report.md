# SpecForge v1.2 Write Guard Control Plane Hardening Fix07

## Result

REPLACE_FILES_ONLY

## Purpose

Fix07 repairs the TypeScript syntax error committed in the fix05 failed validation snapshot.

## Scope

Only this complete source file is replaced:

```text
packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts
```

## Root cause fixed

fix05 generated a TypeScript RegExp string with unsafe single-quote nesting around a pattern fragment containing `["\']`. esbuild failed before tests could run.

Fix07 delivers the full TypeScript source file directly. The local script only copies files and runs validation. It does not dynamically generate or regex-insert TypeScript.

## Git checkpoint policy

1. Copy replacement file.
2. Commit and push WIP replacement snapshot.
3. Run targeted unit test.
4. Run workspace build.
5. If validation fails, commit and push failed validation snapshot.
6. If validation passes, commit and push validated fix snapshot.
