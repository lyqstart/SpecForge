import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-safe-bash';
import '../../src/tools/handlers/sf-hard-stop-resolve';
import { checkHardStop } from '../../src/tools/lib/hard-stop-latch';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';
import { authoritativeStateFixture } from '../helpers/authoritative-state-fixture';
import { requiredVerificationDepsForFixture } from '../helpers/required-verification-fixture';
import { seedRecoveryState, recoveryStateDeps } from '../helpers/hard-stop-state-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-refusal-stop-'));
  roots.push(root);
  await mkdir(path.join(root, '.specforge/work-items/WI-0001'), { recursive: true });
  const deps = requiredVerificationDepsForFixture(
    authoritativeStateFixture({ 'WI-0001': 'candidate_preparing' })
  );
  const stop = vi.fn(async () => {
    // The durable latch must precede cancellation, including when cancellation fails.
    expect(checkHardStop(root, 'WI-0001').blocked).toBe(true);
    return { stoppedSessionIds: ['ses_owner'], acknowledgedAt: new Date().toISOString() };
  });
  deps.toolInvocationVerifier.stopGovernanceInvocation = stop;
  const context = {
    directory: root,
    sessionID: 'ses_owner',
    callID: 'call_read',
    agent: 'sf-orchestrator',
  };
  return { root, deps, stop, context };
}
describe('typed governance refusal stops live work without widening permissions', () => {
  it('turns the real D18 refusal into a persisted stop and blocks following native reads', async () => {
    const f = await fixture();
    const result = await getHandler('sf_safe_bash')!(
      { command: 'cat .specforge/work-items/WI-0001/candidate_manifest.json' },
      f.context,
      f.deps
    );
    expect(result).toMatchObject({
      success: false,
      rejected: true,
      retry_allowed: false,
      hard_stop: true,
      cancellation: { acknowledged: true },
    });
    expect(f.stop).toHaveBeenCalledTimes(1);
    const observations = (
      await readFile(
        path.join(f.root, '.specforge/logs/observability/daemon/hardstop.jsonl'),
        'utf8'
      )
    )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const receipt = observations.find(row => row.phase === 'governance.policy_refusal.stop');
    expect(receipt.payload).toBeUndefined();
    expect(receipt.metadata).toMatchObject({
      policy_code: 'GOVERNANCE_READ_POLICY_REFUSAL',
      cancellation: { acknowledged: true, stoppedSessionIds: ['ses_owner'] },
    });
    expect(
      await checkNativeTool(
        f.deps,
        f.root,
        'grep',
        { path: f.root, pattern: 'secret' },
        { sessionID: 'ses_owner', callID: 'call_next' }
      )
    ).toMatchObject({ allowed: false });
    expect(
      await checkNativeTool(
        f.deps,
        f.root,
        'read',
        { filePath: f.root },
        { sessionID: 'ses_independent', callID: 'call_diagnostic' }
      )
    ).toEqual({ allowed: true });
    expect(checkHardStop(f.root, 'WI-0002').blocked).toBe(false);
  });
  it('keeps the latch and reports failed cancellation honestly', async () => {
    const f = await fixture();
    f.stop.mockRejectedValueOnce(new Error('runtime unavailable'));
    expect(
      await getHandler('sf_safe_bash')!(
        { command: 'cat .specforge/work-items/WI-0001/candidate_manifest.json' },
        f.context,
        f.deps
      )
    ).toMatchObject({ hard_stop: true, cancellation: { acknowledged: false } });
    expect(checkHardStop(f.root, 'WI-0001').blocked).toBe(true);
    const observations = (
      await readFile(
        path.join(f.root, '.specforge/logs/observability/daemon/hardstop.jsonl'),
        'utf8'
      )
    )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(
      observations.find(row => row.phase === 'governance.policy_refusal.stop').metadata
    ).toMatchObject({ cancellation: { acknowledged: false, error: 'runtime unavailable' } });
  });
  it('does not turn ordinary missing business files into policy stops', async () => {
    const f = await fixture();
    expect(
      await getHandler('sf_safe_bash')!({ command: 'cat missing.txt' }, f.context, f.deps)
    ).toMatchObject({ success: false });
    expect(f.stop).not.toHaveBeenCalled();
    expect(checkHardStop(f.root, 'WI-0001').blocked).toBe(false);
  });
  it('recovers through the existing owner with original refusal history retained', async () => {
    const f = await fixture();
    await seedRecoveryState(f.root, 'candidate_preparing');
    await getHandler('sf_safe_bash')!(
      { command: 'cat .specforge/work-items/WI-0001/candidate_manifest.json' },
      f.context,
      f.deps
    );
    const original = checkHardStop(f.root, 'WI-0001').record!;
    const result = await getHandler('sf_hard_stop_resolve')!(
      {
        work_item_id: 'WI-0001',
        hard_stop_id: original.hard_stop_id,
        resolution_type: 'prohibited_action_replaced',
        blocked_action_disposition: 'abandon',
        reason:
          'Use the bounded current governance original reader without expanding any permission.',
        evidence: [
          'synthetic acceptance: controlled reader available; original command remains prohibited',
        ],
        allowed_next_action: 'sf_governance_read current registered candidate',
        resume_from_step: 'read current original',
        safe_alternative_tool: 'sf_governance_read',
        retry_original_action: false,
      },
      f.context,
      { ...f.deps, ...recoveryStateDeps(f.root) }
    );
    expect(result).toMatchObject({ success: true });
    expect(checkHardStop(f.root, 'WI-0001').blocked).toBe(false);
    const history = (
      await readFile(
        path.join(f.root, '.specforge/work-items/WI-0001/hard_stop_resolution.jsonl'),
        'utf8'
      )
    )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(history).toHaveLength(1);
    expect(history[0].original_hard_stop).toMatchObject({
      hard_stop_id: original.hard_stop_id,
      policy_code: 'GOVERNANCE_READ_POLICY_REFUSAL',
    });
    expect(history[0].authoritative_state_at_resolution).toBe('candidate_preparing');
  });
});
