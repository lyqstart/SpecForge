import { describe, expect, it, vi } from 'vitest';
import { normalizeSlash, isKnownAgentActor, entriesSemanticallyEqual, targetPathForCandidate } from '../../src/tools/lib/governance-invariants-v11';
import { checkTraceChain } from '../../src/tools/lib/verification-evidence-v11';

describe('governance untrusted input contracts', () => {
  it('preserves valid normalized paths and known actor decisions', () => {
    expect(normalizeSlash('./candidates\\project\\design.md')).toBe('candidates/project/design.md');
    expect(normalizeSlash(undefined)).toBe('');
    expect(isKnownAgentActor(' sf-design ')).toBe(true);
    expect(isKnownAgentActor('user')).toBe(false);
    expect(isKnownAgentActor(undefined)).toBe(true);
  });
  it('rejects opaque path, actor and candidate type without coercion', () => {
    const coerce = vi.fn(() => 'user');
    const value = { toString: coerce, [Symbol.toPrimitive]: coerce };
    expect(() => normalizeSlash(value)).toThrow('GOVERNANCE_PATH_STRING_REQUIRED');
    expect(() => isKnownAgentActor(value)).toThrow('DECISION_ACTOR_STRING_REQUIRED');
    expect(() => targetPathForCandidate(value, 'candidate.md')).toThrow('CANDIDATE_TYPE_STRING_REQUIRED');
    expect(coerce).not.toHaveBeenCalled();
  });
  it('retains manifest normalization, replace default and order independence', () => {
    const entry = { candidate_path: './candidates/design.md', target_path: '.specforge/project/design.md', type: 'design' };
    expect(entriesSemanticallyEqual([entry], [{ ...entry, candidate_path: 'candidates/design.md', operation: 'replace' }])).toBe(true);
    expect(entriesSemanticallyEqual([entry], [{ ...entry, operation: 'delete' }])).toBe(false);
    expect(entriesSemanticallyEqual([], [])).toBe(true);
  });
  it.each([null, {}, [null], [{ candidate_path: {}, target_path: 'x' }], [{ candidate_path: 'x', target_path: 'y', operation: {} }]])('rejects malformed manifest entries %#', value => {
    expect(() => entriesSemanticallyEqual(value, [])).toThrow('MANIFEST_ENTRIES_INVALID');
  });
  it('checks complete and incomplete actual Trace entries', () => {
    const entry = { req_id: 'REQ-001', ac_ids: ['AC-001'], dd_ids: ['DD-001'], task_ids: ['TASK-001'], file_paths: ['src/main.ts'], test_ids: ['TEST-001'], evidence_ids: ['EVIDENCE-001'] };
    expect(checkTraceChain([entry]).complete).toBe(true);
    const result = checkTraceChain([{ ...entry, ac_ids: [] }]);
    expect(result.complete).toBe(false);
    expect(result.gaps).toContain('REQ-001: no AC linked');
  });
  it.each([null, {}, [null], [{ req_id: 'REQ-001' }], [{ req_id: 'REQ-001', ac_ids: [42], dd_ids: [], task_ids: [], file_paths: [], test_ids: [], evidence_ids: [] }]])('rejects malformed Trace data %#', value => {
    expect(() => checkTraceChain(value)).toThrow('TRACE_CHAIN_ENTRIES_INVALID');
  });
});
