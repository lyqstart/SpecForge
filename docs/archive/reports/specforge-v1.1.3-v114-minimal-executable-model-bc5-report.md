# SpecForge v1.1.3 v1.14 Minimal Executable Model — BC v5 Report

## Result

PASS

## Purpose

Route `candidate_requirements` and `candidate_design` toward v1.14 module candidate paths and update manifest inference accordingly.

## Changed Files

- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts`

## Changes

- candidate_requirements target path: patched
- candidate_design target path: patched
- nested target directory creation: patched after targetPath calculation
- targetPathForCandidate module candidate mapping: patched
- filesystem inference for v1.14 module candidates: patched

## Verification

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`

## Backup

- `D:\code\temp\SpecForge_patch_backups\BC_v5_20260619-005719`
