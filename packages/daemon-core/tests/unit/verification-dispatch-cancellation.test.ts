import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { ToolDispatcher, registerHandler } from '../../src/tools/ToolDispatcher';
import { RequiredVerificationOwner } from '../../src/tools/lib/required-verification-owner';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';
import { withGateOperationBarrier } from '../../src/tools/lib/gate-operation-barrier';

// Synthetic source and execution adapter; real dispatcher and native admission.
afterEach(() => vi.restoreAllMocks());
describe('long-running isolated verification keeps controlled cancellation reachable', () => {
  it('admits native cancellation while execution runs, retains source and project lifetime guards', async () => {
    const root = path.resolve('synthetic-live-verification-cancel');
    const capture = vi
      .spyOn(RequiredVerificationOwner.prototype, 'captureSource')
      .mockResolvedValue({ registered: false } as never);
    let projectOperations = 0;
    const deps = {
      projectManager: {
        getProjectStateManager: async () => ({ listWorkItems: () => [] }),
        withProjectOperation: async (_root: string, action: () => Promise<unknown>) => {
          projectOperations++;
          try {
            return await action();
          } finally {
            projectOperations--;
          }
        },
      },
    };
    const dispatcher = new ToolDispatcher(deps as never);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    registerHandler('sf_verification_run', async args => {
      if (args.action === 'run') {
        started();
        await held;
        return { success: false, outcome: 'cancelled' };
      }
      return { success: true, cancellation_requested: true };
    });
    const context = { directory: root, sessionID: 'ses_fixture', callID: 'call_run' };
    const running = dispatcher.dispatch({
      tool: 'sf_verification_run',
      args: { action: 'run' },
      context,
    });
    try {
      await entered;
      expect(projectOperations).toBe(1);
      const args = { action: 'cancel' };
      expect(
        await checkNativeTool(deps, root, 'sf_verification_run', args, {
          sessionID: 'ses_fixture',
          callID: 'call_cancel',
        })
      ).toEqual({ allowed: true });
      expect(
        await dispatcher.dispatch({
          tool: 'sf_verification_run',
          args,
          context: { ...context, callID: 'call_cancel' },
        })
      ).toEqual({ success: true, cancellation_requested: true });
      expect(capture).toHaveBeenCalledTimes(3);
      expect(projectOperations).toBe(1);
    } finally {
      release();
      await running;
    }
    expect(projectOperations).toBe(0);
  });

  it('never starts a deferred run when its source is absent or rejected', async () => {
    const source = vi
      .spyOn(RequiredVerificationOwner.prototype, 'captureSource')
      .mockRejectedValue(new Error('REQUIRED_VERIFICATION_SOURCE_LIVE_CALL'));
    const handler = vi.fn(async () => ({ success: true }));
    registerHandler('sf_verification_run', handler);
    const dispatcher = new ToolDispatcher({
      projectManager: { getProjectStateManager: async () => ({ listWorkItems: () => [] }) },
    } as never);
    const request = {
      tool: 'sf_verification_run',
      args: { action: 'run' },
      context: { directory: path.resolve('synthetic-cancel-source') },
    };
    expect(await dispatcher.dispatch(request)).toMatchObject({
      success: false,
      error: 'REQUIRED_VERIFICATION_SOURCE_IDENTITY_REQUIRED',
    });
    expect(source).not.toHaveBeenCalled();
    expect(
      await dispatcher.dispatch({
        ...request,
        context: { ...request.context, sessionID: 'ses_fixture', callID: 'call_fixture' },
      })
    ).toMatchObject({ success: false, error: 'REQUIRED_VERIFICATION_SOURCE_LIVE_CALL' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not release the barrier during source capture or ordinary candidate mutation', async () => {
    const root = path.resolve('synthetic-cancel-admission');
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(RequiredVerificationOwner.prototype, 'captureSource').mockImplementation(async () => {
      started();
      await held;
      return { registered: false } as never;
    });
    const handler = vi.fn(async () => ({ success: true }));
    registerHandler('sf_verification_run', handler);
    const dispatcher = new ToolDispatcher({
      projectManager: { getProjectStateManager: async () => ({ listWorkItems: () => [] }) },
    } as never);
    const running = dispatcher.dispatch({
      tool: 'sf_verification_run',
      args: { action: 'run' },
      context: { directory: root, sessionID: 'ses_fixture', callID: 'call_fixture' },
    });
    try {
      await entered;
      expect(
        await withGateOperationBarrier(root, 'sf_artifact_write', false, async () => 'forbidden')
      ).toMatchObject({ success: false });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      release();
      await running;
    }
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary candidate handler execution exclusive', async () => {
    const root = path.resolve('synthetic-cancel-candidate');
    vi.spyOn(RequiredVerificationOwner.prototype, 'captureSource').mockResolvedValue({
      registered: false,
    } as never);
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    registerHandler('sf_artifact_write', async () => {
      started();
      await held;
      return { success: true };
    });
    const dispatcher = new ToolDispatcher({
      projectManager: { getProjectStateManager: async () => ({ listWorkItems: () => [] }) },
    } as never);
    const running = dispatcher.dispatch({
      tool: 'sf_artifact_write',
      args: {},
      context: { directory: root, sessionID: 'ses_fixture', callID: 'call_fixture' },
    });
    try {
      await entered;
      expect(
        await withGateOperationBarrier(
          root,
          'sf_required_verification_capture',
          false,
          async () => 'forbidden'
        )
      ).toMatchObject({ success: false });
    } finally {
      release();
      await running;
    }
  });

  it('releases the project lifetime guard after a deferred handler rejects', async () => {
    const root = path.resolve('synthetic-cancel-failure');
    vi.spyOn(RequiredVerificationOwner.prototype, 'captureSource').mockResolvedValue({
      registered: false,
    } as never);
    let operations = 0;
    registerHandler('sf_verification_run', async () => {
      throw new Error('SYNTHETIC_EXECUTION_FAILURE');
    });
    const dispatcher = new ToolDispatcher({
      projectManager: {
        getProjectStateManager: async () => ({ listWorkItems: () => [] }),
        withProjectOperation: async (_root: string, action: () => Promise<unknown>) => {
          operations++;
          try {
            return await action();
          } finally {
            operations--;
          }
        },
      },
    } as never);
    await expect(
      dispatcher.dispatch({
        tool: 'sf_verification_run',
        args: { action: 'run' },
        context: { directory: root, sessionID: 'ses_fixture', callID: 'call_fixture' },
      })
    ).rejects.toThrow('SYNTHETIC_EXECUTION_FAILURE');
    expect(operations).toBe(0);
    expect(
      await withGateOperationBarrier(root, 'sf_artifact_write', false, async () => 'released')
    ).toBe('released');
  });
});
