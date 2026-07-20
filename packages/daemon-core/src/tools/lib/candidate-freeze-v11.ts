/**
 * Candidate freeze policy.
 *
 * StateManager is the state authority. Callers must obtain the authoritative
 * state first and pass it here; work_item.json is metadata and is not a valid
 * source for this decision.
 */

export const CANDIDATE_FROZEN_STATES = new Set([
  'gates_running',
  'approval_required',
  'approved',
  'merge_ready',
  'merging',
]);

export function isCandidateFrozenState(state: string | null | undefined): boolean {
  return typeof state === 'string' && CANDIDATE_FROZEN_STATES.has(state);
}

export function isCandidateGovernancePath(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    /(?:^|\/)candidates\//.test(normalized) ||
    /(?:^|\/)candidate_manifest\.json$/.test(normalized) ||
    /(?:^|\/)gate_summary\.md$/.test(normalized)
  );
}
