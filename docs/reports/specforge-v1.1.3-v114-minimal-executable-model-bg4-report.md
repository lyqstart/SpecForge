# SpecForge v1.1.3 v1.14 Minimal Executable Model — BG v4 Report

## Result

PASS

## Purpose

Prevent first-pass candidate_manifest_gate failure when trace_delta appears as `trace_delta.md` in candidate_manifest input.

## Root Cause

The completed feature_spec run passed only after recovering from an initial candidate_manifest_gate failure. The workflow requires trace_delta to merge to `.specforge/project/trace_matrix.md`, while candidate Gate requires merge candidate paths under `candidates/`.

## Fix

The `candidate_manifest.json` normalization branch now canonicalizes trace_delta merge candidate paths to `candidates/trace_delta.md` before `inferManifestEntries()` and schema validation. BG v4 avoids TypeScript regex literals in inserted code to prevent slash/escape syntax errors.

## Changed Files

- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts`

## Changes

- candidate_manifest branch: replaced with regex-free trace_delta path canonicalization

## Verification

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`

## Backup

- `D:\code\temp\SpecForge_patch_backups\BG_v4_20260619-124748`
