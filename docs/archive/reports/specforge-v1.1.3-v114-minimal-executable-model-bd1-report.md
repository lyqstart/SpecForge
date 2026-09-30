# SpecForge v1.1.3 v1.14 Minimal Executable Model — BD v1 Report

## Result

PASS

## Purpose

Align `candidate_manifest_gate` with the same manifest normalization rules used by `user_decision` and `merge_runner`.

## Root Cause

`candidate_manifest_gate` only performed shallow checks: entries array, candidate path contains `candidates/`, target path points into `.specforge/project/`. Approval and merge later use `inferManifestEntries()` and `entriesSemanticallyEqual()`, so a manifest could pass Gate but fail at approval or merge.

## Changed Files

- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts`

## Changes

- governance invariant imports: patched
- candidate_manifest_gate governance normalization: patched

## Verification

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`

## Backup

- `D:\code\temp\SpecForge_patch_backups\BD_v1_20260619-012451`
