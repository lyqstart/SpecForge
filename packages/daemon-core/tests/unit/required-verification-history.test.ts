import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/types';
import { replayRequiredVerificationHistory, requiredVerificationHistorySha256 } from '../../src/tools/lib/required-verification-history';

const time = 1_700_000_000_000;
const declaration = () => ({ schema_version: '1.0' as const, profile: 'candidate-exact-file-sha256/v1' as const,
  work_item_id: 'WI-0001', project_spec_manifest_sha256: 'a'.repeat(64), candidate_generation: 'b'.repeat(64),
  requirements: [{ id: 'RV-trace', path: 'candidates/trace_delta.md', owner: 'sf-task-planner' as const, expected_sha256: 'c'.repeat(64) }] });
const source = (value: ReturnType<typeof declaration> | null, offset = 0) => ({
  source: 'required-verification-source/v1' as const, sessionId: 'ses_root', messageId: 'msg_call' + offset,
  callId: 'call_' + offset, tool: 'sf_handoff', inputSha256: 'd'.repeat(64), agent: 'sf-task-planner', directory: 'D:/fixture',
  userSessionId: 'ses_root', userMessageId: 'msg_user' + offset, userTextSha256: 'e'.repeat(64),
  userCreatedAt: time + offset, observedAt: new Date(time + offset + 1).toISOString(), declaration: value, chainSha256: 'f'.repeat(64),
});
const record = (action: string, payload: Record<string, unknown>, offset = 0): Event => ({
  schema_version: '1.0', eventId: 'event-' + offset, ts: time + offset + 2, projectId: 'WI-0001', actor: 'required_verification_owner',
  action: 'required_verification.' + action, payload: { contract: 'required-verification-record/v1', work_item_id: 'WI-0001', ...payload },
  metadata: { schemaVersion: '1.0', source: 'daemon' },
});
function registration() { const value = declaration(); return record('registered', { declaration: value, source: source(value) }); }
function proof(outcome: 'passed' | 'failed' | 'unavailable' = 'passed', offset = 10) {
  return record('proof', { requirement_key: 'event-0:RV-trace', generation: 'b'.repeat(64), outcome, source: source(null, offset),
    ...(outcome === 'passed' ? { actual_sha256: 'c'.repeat(64), identity: { dev: '1', ino: '2', size: '3', mtimeNs: '4', ctimeNs: '5' } } : { failure_code: 'REQUIRED_FILE_UNAVAILABLE' }) }, offset);
}
describe('required verification strict durable replay', () => {
  it('uses platform path identity across distinct registration events', () => {
    const next = declaration();
    next.requirements[0]!.id = 'RV-upper';
    next.requirements[0]!.path = 'candidates/TRACE_DELTA.md';
    const events = [registration(), record('registered', { declaration: next, source: source(next, 30) }, 30)];
    if (process.platform === 'win32') expect(() => replayRequiredVerificationHistory(events, 'WI-0001')).toThrow('ACTIVE_DUPLICATE');
    else expect(replayRequiredVerificationHistory(events, 'WI-0001').active).toHaveLength(2);
    next.requirements[0]!.path = 'candidates/trace_delta.md';
    expect(() => replayRequiredVerificationHistory([registration(), record('registered', { declaration: next, source: source(next, 30) }, 30)], 'WI-0001')).toThrow('ACTIVE_DUPLICATE');
  });
  it('retains pending requirements without inferring success from registration', () => {
    const replay = replayRequiredVerificationHistory([registration()], 'WI-0001');
    expect(replay.active).toHaveLength(1); expect(replay.active[0]!.proof).toBeUndefined();
  });
  it('retains a later failure even if an earlier proof passed', () => {
    const replay = replayRequiredVerificationHistory([registration(), proof(), proof('unavailable', 20)], 'WI-0001');
    expect(replay.active[0]!.proof?.outcome).toBe('unavailable');
    expect(replay.historySha256).toBe(requiredVerificationHistorySha256([registration(), proof(), proof('unavailable', 20)]));
  });
  it('does not accept a claimed pass without matching digest and physical identity', () => {
    for (const modification of [{ actual_sha256: 'a'.repeat(64) }, { identity: undefined }, { failure_code: 'FAILED' }]) {
      const forged = proof(); Object.assign(forged.payload, modification);
      expect(() => replayRequiredVerificationHistory([registration(), forged], 'WI-0001')).toThrow();
    }
  });
  it('rejects wrong generation, wrong owner and stale revision keys', () => {
    for (const modification of [{ generation: 'a'.repeat(64) }, { requirement_key: 'event-other:RV-trace' }, { source: { ...source(null, 10), agent: 'sf-orchestrator' } }]) {
      const forged = proof(); Object.assign(forged.payload, modification);
      expect(() => replayRequiredVerificationHistory([registration(), forged], 'WI-0001')).toThrow('PROOF_BINDING');
    }
  });
  it('permits explicit fresh cancellation bound to the exact retained prefix', () => {
    const prior = [registration(), proof('failed')];
    const value = { ...declaration(), requirements: [], replacement: { prior_history_sha256: requiredVerificationHistorySha256(prior) } };
    const replacement = record('replaced', { declaration: value, source: source(value, 30) }, 30);
    const replay = replayRequiredVerificationHistory([...prior, replacement], 'WI-0001');
    expect(replay.active).toEqual([]); expect(replay.registrations).toHaveLength(2);
    expect(prior).toHaveLength(2);
  });
  it('rejects stale cancellation, ordinary empty registration and source-message replay', () => {
    const prior = [registration()];
    const value = { ...declaration(), requirements: [], replacement: { prior_history_sha256: 'a'.repeat(64) } };
    expect(() => replayRequiredVerificationHistory([...prior, record('replaced', { declaration: value, source: source(value, 30) }, 30)], 'WI-0001')).toThrow('REPLACEMENT_SOURCE');
    expect(() => replayRequiredVerificationHistory([registration(), registration()], 'WI-0001')).toThrow('REGISTRATION_SOURCE');
    const empty = { ...declaration(), requirements: [] };
    expect(() => replayRequiredVerificationHistory([record('registered', { declaration: empty, source: source(empty) })], 'WI-0001')).toThrow();
  });
  it('rejects unknown history actions rather than dropping them', () => {
    expect(() => replayRequiredVerificationHistory([record('waived', {})], 'WI-0001')).toThrow('ACTION_UNSUPPORTED');
  });
});
