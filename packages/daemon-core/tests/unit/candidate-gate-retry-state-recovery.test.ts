import { describe, expect, it } from 'vitest';
import { candidateGateRecoverySequence } from '../../src/tools/handlers/sf-v11-gate-run';
import { isValidTransition } from '../../src/tools/lib/state_machine';

describe('Candidate Gate owns execution, not Candidate sealing', () => {
  it.each(['created', 'intake_ready', 'impact_analyzing', 'impact_analyzed', 'workflow_selected', 'candidate_preparing', 'gates_failed', 'closed'])('does not recover %s across the seal transaction', state => {
    expect(candidateGateRecoverySequence(state, 'architecture_change')).toEqual([]);
  });
  it.each(['architecture_change', 'contract_change', 'feature_spec'])('advances only a sealed %s candidate', workflow => {
    expect(candidateGateRecoverySequence('candidate_prepared', workflow)).toEqual(['candidate_prepared', 'gates_running']);
    expect(candidateGateRecoverySequence('gates_running', workflow)).toEqual(['gates_running']);
    expect(isValidTransition('candidate_prepared', 'gates_running', workflow as any)).toBe(true);
  });
  it('retains the recovery owner path and rejects a direct approval jump', () => {
    expect(isValidTransition('gates_failed', 'candidate_preparing', 'architecture_change')).toBe(true);
    expect(isValidTransition('candidate_preparing', 'candidate_prepared', 'architecture_change')).toBe(true);
    expect(isValidTransition('gates_failed', 'approval_required', 'architecture_change')).toBe(false);
  });
});
