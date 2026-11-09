import { describe, expect, it, vi } from 'vitest';

import { createSpecForgeThinPlugin, type ThinPluginHooks } from '../../../setup/userlevel-opencode/scripts/lib/sf_thin_plugin';

const registration = { sessionId: 'session-1', projectId: 'project-1', mode: 'personal' as const };
const refusal = (): Error & { status: number; code: string } =>
  Object.assign(new Error('Register failed: HTTP 409'), {
    status: 409,
    code: 'PROJECT_NOT_INITIALIZED',
  });
const ordinary = { event: { type: 'message.updated' } };
function completed(callID = 'init-1', status = 'completed', tool = 'sf_project_init'): Parameters<ThinPluginHooks['event']>[0] {
  return {
    event: {
      type: 'message.part.updated',
      properties: { part: { type: 'tool', sessionID: 'oc-1', callID, tool, state: { status } } },
    },
  };
}
async function setup(register = vi.fn(async () => registration)): Promise<{
  hooks: ThinPluginHooks;
  register: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  postEvent: ReturnType<typeof vi.fn>;
  checkNativeTool: ReturnType<typeof vi.fn>;
}> {
  const notify = vi.fn(),
    postEvent = vi.fn(async () => ({ ok: true, dropped: false, reason: 'success' as const }));
  const checkNativeTool = vi.fn(async () => undefined);
  const hooks = await createSpecForgeThinPlugin(
    { directory: 'D:/owned/synthetic-project' },
    { client: { register, postEvent, checkNativeTool }, notify }
  );
  return { hooks, register, notify, postEvent, checkNativeTool };
}

describe('uninitialized global plugin first-start and recovery', () => {
  it('emits one initialization notice and no registration/event storm for 100 concurrent ordinary events', async () => {
    const s = await setup(vi.fn().mockRejectedValue(refusal()));
    await Promise.all(Array.from({ length: 100 }, () => s.hooks.event(ordinary)));
    expect(s.register).toHaveBeenCalledTimes(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.notify.mock.calls[0][0]).toContain('sf_project_init');
    expect(s.notify.mock.calls[0][0]).not.toMatch(/unavailable|reconnecting/);
    expect(s.postEvent).not.toHaveBeenCalled();
  });

  it('keeps the awaited native guard available for controlled initialization while waiting', async () => {
    const s = await setup(vi.fn().mockRejectedValue(refusal()));
    await s.hooks['tool.execute.before']({ tool: 'sf_project_init' }, { args: {} });
    expect(s.checkNativeTool).toHaveBeenCalledWith(
      'D:/owned/synthetic-project',
      'sf_project_init',
      {}
    );
    expect(s.register).toHaveBeenCalledTimes(1);
  });

  it('registers after completed initialization and forwards later ordinary events through the accepted session', async () => {
    const s = await setup(vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValue(registration));
    await s.hooks.event(completed());
    await s.hooks.event(ordinary);
    expect(s.register).toHaveBeenCalledTimes(2);
    expect(s.notify).toHaveBeenCalledTimes(2);
    expect(s.postEvent).toHaveBeenLastCalledWith(
      'session-1',
      'opencode.message.updated',
      expect.objectContaining({ projectPath: 'D:/owned/synthetic-project' })
    );
  });

  it('does not interpret failed, pending, unrelated or incomplete tool events as initialization completion', async () => {
    const s = await setup(vi.fn().mockRejectedValue(refusal()));
    for (const event of [
      completed('a', 'error'),
      completed('b', 'running'),
      completed('c', 'completed', 'sf_safe_bash'),
      {
        event: {
          type: 'message.part.updated',
          properties: { part: { tool: 'sf_project_init', state: { status: 'completed' } } },
        },
      },
    ])
      await s.hooks.event(event);
    expect(s.register).toHaveBeenCalledTimes(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
  });

  it('treats completion as a recovery trigger, not authority to bypass a repeated daemon refusal', async () => {
    const s = await setup(vi.fn().mockRejectedValue(refusal()));
    await s.hooks.event(completed());
    await Promise.all(Array.from({ length: 50 }, () => s.hooks.event(completed())));
    await s.hooks.event(ordinary);
    expect(s.register).toHaveBeenCalledTimes(2);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.postEvent).not.toHaveBeenCalled();
    s.register.mockResolvedValue(registration);
    await s.hooks.event(completed('init-2'));
    expect(s.register).toHaveBeenCalledTimes(3);
    expect(s.postEvent).toHaveBeenCalledTimes(1);
  });

  it('coalesces duplicate concurrent completion events into a single recovery registration', async () => {
    let finish!: (value: typeof registration) => void;
    const register = vi
      .fn()
      .mockRejectedValueOnce(refusal())
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
    const s = await setup(register);
    const events = Array.from({ length: 30 }, () => s.hooks.event(completed()));
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(2);
    finish(registration);
    await Promise.all(events);
    expect(register).toHaveBeenCalledTimes(2);
    expect(s.notify).toHaveBeenCalledTimes(2);
  });

  it('does not lose a newer init completion while an older refused registration is in flight', async () => {
    let fail!: (error: Error) => void;
    const register = vi
      .fn()
      .mockRejectedValueOnce(refusal())
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          })
      )
      .mockResolvedValue(registration);
    const s = await setup(register);
    const first = s.hooks.event(completed('init-1'));
    await Promise.resolve();
    const second = s.hooks.event(completed('init-2'));
    fail(refusal());
    await Promise.all([first, second]);
    expect(register).toHaveBeenCalledTimes(3);
    expect(s.notify).toHaveBeenCalledTimes(2);
    expect(s.postEvent).toHaveBeenCalled();
  });

  it('does not classify arbitrary error text or a different structured status as project initialization refusal', async () => {
    for (const error of [
      new Error('PROJECT_NOT_INITIALIZED'),
      Object.assign(new Error('bad'), { status: 503, code: 'PROJECT_NOT_INITIALIZED' }),
    ]) {
      const s = await setup(vi.fn().mockRejectedValueOnce(error).mockResolvedValue(registration));
      await s.hooks.event(ordinary);
      expect(s.register).toHaveBeenCalledTimes(2);
      expect(s.postEvent).toHaveBeenCalledTimes(1);
    }
  });

  it('does not turn compaction into another registration retry while the project is uninitialized', async () => {
    const s = await setup(vi.fn().mockRejectedValue(refusal()));
    await s.hooks['experimental.session.compacting']({ sessionID: 'oc-1' });
    expect(s.register).toHaveBeenCalledTimes(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
    expect(s.postEvent).not.toHaveBeenCalled();
  });
});
