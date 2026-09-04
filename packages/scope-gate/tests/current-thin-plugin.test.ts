import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  createSpecForgeThinPlugin,
  type ThinPluginDependencies,
} from '../../../setup/userlevel-opencode/plugins/sf_specforge';

function dependencies(overrides: Partial<ThinPluginDependencies> = {}): {
  deps: ThinPluginDependencies;
  messages: string[];
  postEvent: ReturnType<typeof vi.fn>;
  startDaemon: ReturnType<typeof vi.fn>;
} {
  const messages: string[] = [];
  const postEvent = vi.fn(async () => ({ ok: true, dropped: false, reason: 'success' as const }));
  const startDaemon = vi.fn(async () => undefined);
  const deps: ThinPluginDependencies = {
    client: {
      register: vi.fn(async () => ({ sessionId: 'session-1', projectId: 'project-1', mode: 'personal' as const })),
      postEvent,
    },
    startDaemon,
    wait: async () => undefined,
    notify: (message) => messages.push(message),
    ...overrides,
  };
  return { deps, messages, postEvent, startDaemon };
}

describe('current SpecForge Thin Plugin', () => {
  it('starts specforged on first connection failure and reports OpenCode events', async () => {
    const setup = dependencies();
    const register = vi.fn()
      .mockRejectedValueOnce(new Error('handshake missing'))
      .mockResolvedValue({ sessionId: 'session-1', projectId: 'project-1', mode: 'personal' });
    setup.deps.client.register = register;

    const hooks = await createSpecForgeThinPlugin(
      { directory: 'D:/business/project' } as never,
      setup.deps,
    );
    await hooks.event({ event: { type: 'session.updated', properties: { sessionID: 'oc-1' } } });

    expect(setup.startDaemon).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('D:/business/project');
    expect(setup.postEvent).toHaveBeenCalledWith(
      'session-1',
      'opencode.session.updated',
      expect.objectContaining({ properties: { sessionID: 'oc-1' } }),
    );
    expect(setup.messages.some((message) => message.includes('started and connected'))).toBe(true);
  });

  it('shows degraded and recovered connection states without exposing business tools', async () => {
    const setup = dependencies();
    setup.postEvent
      .mockResolvedValueOnce({ ok: false, dropped: true, reason: 'degraded' })
      .mockResolvedValueOnce({ ok: true, dropped: false, reason: 'success' });
    const hooks = await createSpecForgeThinPlugin({ directory: 'D:/business/project' } as never, setup.deps);

    await hooks.event({ event: { type: 'message.updated' } });
    await hooks.event({ event: { type: 'message.updated' } });

    expect(setup.messages.some((message) => message.includes('reconnecting'))).toBe(true);
    expect(setup.messages.some((message) => message.includes('connection recovered'))).toBe(true);
    expect(hooks).not.toHaveProperty('tool');
    expect(hooks).not.toHaveProperty('tool.execute.before');
    expect(hooks).not.toHaveProperty('tool.execute.after');
  });

  it('contains no local business or write-authority implementation', async () => {
    const source = await readFile(
      new URL('../../../setup/userlevel-opencode/plugins/sf_specforge.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('tool.execute.before');
    expect(source).not.toContain('createNativeWriteTool');
    expect(source).not.toContain('.specforge/work-items');
    expect(source).not.toContain('checkWrite(');
    expect(source).not.toContain('bashGuard(');
    expect(source).toContain("homedir(), '.specforge'");
    expect(source).not.toContain('sf-user');
    expect(source).not.toContain('OPENCODE_CONFIG_DIR');
    expect(source).not.toContain('XDG_CONFIG_HOME');
  });
});
