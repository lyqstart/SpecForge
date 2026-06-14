/**
 * artifact-types.ts — SpecForge v1.1 canonical artifact type constants.
 *
 * This file is intentionally small and dependency-free so daemon-core and
 * tooling code can share one canonical list in later patches.
 */

export const V11_CANONICAL_ARTIFACT_TYPES = [
  'work_item',
  'intake',
  'change_classification',
  'impact_analysis',
  'trigger_result',
  'tasks',
  'trace_delta',
  'candidate_manifest',
  'merge_report',
  'verification_report',
  'evidence_manifest',
] as const;

export const V11_LEGACY_ARTIFACT_TYPES = [
  'work_log',
  'review_report',
  'agent_run_result',
] as const;

export const V11_ARTIFACT_TYPES = [
  ...V11_CANONICAL_ARTIFACT_TYPES,
  ...V11_LEGACY_ARTIFACT_TYPES,
] as const;

export type V11CanonicalArtifactType = typeof V11_CANONICAL_ARTIFACT_TYPES[number];
export type V11LegacyArtifactType = typeof V11_LEGACY_ARTIFACT_TYPES[number];
export type V11ArtifactType = typeof V11_ARTIFACT_TYPES[number];

export const V11_ARTIFACT_FILE_BY_TYPE: Readonly<Record<V11CanonicalArtifactType, string>> = {
  work_item: 'work_item.json',
  intake: 'intake.md',
  change_classification: 'change_classification.md',
  impact_analysis: 'impact_analysis.md',
  trigger_result: 'trigger_result.json',
  tasks: 'tasks.md',
  trace_delta: 'trace_delta.md',
  candidate_manifest: 'candidate_manifest.json',
  merge_report: 'merge_report.md',
  verification_report: 'verification_report.md',
  evidence_manifest: 'evidence/evidence_manifest.json',
} as const;

export function isV11ArtifactType(value: string): value is V11ArtifactType {
  return (V11_ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function isV11CanonicalArtifactType(value: string): value is V11CanonicalArtifactType {
  return (V11_CANONICAL_ARTIFACT_TYPES as readonly string[]).includes(value);
}
