/**
 * gate-ids.ts — SpecForge v1.1 canonical Gate ID constants.
 *
 * Canonical Gate IDs are the only IDs that should be passed to Runtime.
 * Legacy aliases are provided only for explicit normalization/fail-closed
 * compatibility at the dispatcher/handler boundary.
 */

export const GATE_IDS_V11 = [
  'entry_gate',
  'workflow_selection_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'schema_gate',
  'spec_consistency_gate',
  'trace_gate',
  'workflow_specific_gate',
  'gate_summary_gate',
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
  'extension_gate',
] as const;

export type GateIdV11 = typeof GATE_IDS_V11[number];

export const LEGACY_GATE_ID_ALIASES_V11 = [
  'all',
  'tasks',
  'verification',
  'close',
] as const;

export type LegacyGateIdAliasV11 = typeof LEGACY_GATE_ID_ALIASES_V11[number];

export function isGateIdV11(value: string): value is GateIdV11 {
  return (GATE_IDS_V11 as readonly string[]).includes(value);
}

export function isLegacyGateIdAliasV11(value: string): value is LegacyGateIdAliasV11 {
  return (LEGACY_GATE_ID_ALIASES_V11 as readonly string[]).includes(value);
}
