# SpecForge v1.2 Stable Readiness Sweep Report

RESULT: V1_2_STABLE_READINESS_SWEEP_PREPARED

## 1. Purpose

This sweep prepares SpecForge v1.2 for stable release after the completed Write Guard / hard_stop alignment closure.

The sweep is intentionally packaged as a single replace-files delivery. It does not continue the closed hard_stop blocker as a new local fix.

## 2. Current baseline

Required baseline before applying this package:

- branch: `main`
- latest pushed main includes the hard_stop alignment closure report
- tag exists: `v1.2-write-guard-hardstop-alignment-complete`
- working tree is clean

## 3. Closed blocker that must not be reopened

The following blocker is closed:

- WI-A hard_stop globally blocked WI-B
- empty work_item_id could previously create persistent project-level hard_stop
- native Write and sf_safe_bash policy paths were inconsistent

This closed blocker must only be reopened if a new regression proves one of these failures:

1. WI-A hard_stop blocks unrelated WI-B.
2. empty work_item_id creates persistent hard_stop.
3. authorized write is blocked despite correct state and code_permission.
4. project path protection is bypassed by ordinary write tools.

## 4. Stable readiness scope

This sweep checks the remaining release readiness surface:

1. TypeScript/build health.
2. v12 Write Guard regression health.
3. hard_stop scope regression health.
4. empty work_item_id non-persistent regression health.
5. report path regression health.
6. installer/userlevel deployment consistency.
7. release-note readiness.
8. final clean live acceptance readiness.

## 5. Required automated validation

The validation script must run:

```powershell
cd D:\code\temp\SpecForge
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-v12-stable-readiness-sweep.ps1
```

Expected final marker:

```text
RESULT: V1_2_STABLE_READINESS_SWEEP_PASSED
```

## 6. Manual live acceptance still required

Automated tests are necessary but not sufficient.

Before final v1.2 stable tag, run one clean live acceptance in a fresh project directory and verify:

1. empty work_item_id is rejected and does not persist hard_stop.
2. `.specforge/reports/**` can be written as report output.
3. `.specforge/project/**` remains protected.
4. unauthorized native Write is blocked.
5. authorized native Write reaches `closed`.
6. out-of-scope native Write is blocked or audit-failed.
7. WI-A hard_stop does not block WI-B.

## 7. Closure gate

Only after automated validation and final clean live acceptance pass may the project create a v1.2 stable tag.

Suggested tag after final acceptance:

```text
v1.2-stable
```
