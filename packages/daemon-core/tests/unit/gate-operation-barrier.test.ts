import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { withGateOperationBarrier } from '../../src/tools/lib/gate-operation-barrier';

describe('Gate failure commit excludes overlapping controlled writes', () => {
  it.each(['sf_v11_gate_run', 'sf-gate-run', 'sf_required_verification_capture', 'sf_required_verification_proof',
    'sf_state_transition', 'sf_handoff', 'sf_v11_handoff', 'sf_user_decision_record', 'sf_v11_decision', 'sf_merge_run', 'sf_v11_merge'])(
    'blocks writes and another Gate while %s is active, but permits diagnostics',
    async tool => {
      const root = path.resolve('synthetic-barrier');
      let finish!: () => void;
      const running = withGateOperationBarrier(
        root,
        tool,
        false,
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          })
      );
      let calls = 0;
      const write = async () => {
        calls++;
        return 'written';
      };
      expect(await withGateOperationBarrier(root, 'sf_artifact_write', false, write)).toMatchObject(
        { success: false }
      );
      expect(await withGateOperationBarrier(root, 'sf_v11_gate_run', false, write)).toMatchObject({
        success: false,
      });
      expect(calls).toBe(0);
      expect(await withGateOperationBarrier(root, 'sf_state_read', true, async () => 'read')).toBe(
        'read'
      );
      finish();
      await running;
      expect(await withGateOperationBarrier(root, 'sf_artifact_write', false, write)).toBe(
        'written'
      );
    }
  );
  it('Gate cannot overtake an already-running write, and failed writes release the barrier', async () => {
    const root = path.resolve('synthetic-barrier-second');
    let finish!: () => void;
    const running = withGateOperationBarrier(
      root,
      'sf_artifact_write',
      false,
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    expect(
      await withGateOperationBarrier(root, 'sf_v11_gate_run', false, async () => 'gate')
    ).toMatchObject({ success: false });
    finish();
    await running;
    await expect(
      withGateOperationBarrier(root, 'sf_v11_gate_run', false, async () => {
        throw new Error('synthetic');
      })
    ).rejects.toThrow('synthetic');
    expect(
      await withGateOperationBarrier(root, 'sf_artifact_write', false, async () => 'written')
    ).toBe('written');
  });
});
