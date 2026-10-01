import { describe, expect, it, vi } from 'vitest';

import {
  OpenCodeAdapter,
  OpenCodeHttpRuntimeClient,
  type OpenCodeRuntimeClient,
} from '../src';

describe('OpenCodeHttpRuntimeClient', () => {
  it('uses the documented OpenCode server health, session and prompt endpoints', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/global/health')) {
        return new Response(JSON.stringify({ healthy: true, version: '1.14.41' }), { status: 200 });
      }
      if (url.includes('/session/session-real/message')) {
        return new Response(JSON.stringify({ info: { id: 'message-1' }, parts: [] }), { status: 200 });
      }
      if (url.includes('/session/session-real/abort')) {
        return new Response(JSON.stringify(true), { status: 200 });
      }
      return new Response(JSON.stringify({
        id: 'session-real',
        time: { created: 1_700_000_000_000, updated: 1_700_000_000_100 },
      }), { status: 200 });
    });
    const client = new OpenCodeHttpRuntimeClient({
      baseUrl: 'http://127.0.0.1:4096/',
      timeoutMs: 1_000,
      fetchFn: fetchFn as typeof fetch,
    });

    expect(await client.getVersion()).toBe('1.14.41');
    const session = await client.createSession({ title: 'SpecForge worker', directory: 'D:/project' });
    expect(session.id).toBe('session-real');
    await client.sendPrompt(session.id, {
      content: 'Continue the task',
      agent: 'dev',
      model: 'anthropic/claude-sonnet',
    }, 'D:/project');
    await client.abortSession(session.id, 'D:/project');

    expect(requests.map((request) => request.url)).toEqual([
      'http://127.0.0.1:4096/global/health',
      'http://127.0.0.1:4096/session?directory=D%3A%2Fproject',
      'http://127.0.0.1:4096/session/session-real/message?directory=D%3A%2Fproject',
      'http://127.0.0.1:4096/session/session-real/abort?directory=D%3A%2Fproject',
    ]);
    expect(JSON.parse(String(requests[2]?.init?.body))).toEqual({
      parts: [{ type: 'text', text: 'Continue the task' }],
      agent: 'dev',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet' },
    });
  });

  it('makes the Adapter use real runtime session ids and transport calls', async () => {
    const runtime: OpenCodeRuntimeClient = {
      getVersion: vi.fn(async () => '1.14.41'),
      createSession: vi.fn(async () => ({ id: 'oc-real-session' })),
      getSession: vi.fn(async () => ({ id: 'oc-real-session' })),
      abortSession: vi.fn(async () => undefined),
      sendPrompt: vi.fn(async () => undefined),
    };
    const adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.14.0 <2.0.0',
      runtimeClient: runtime,
    });

    const result = await adapter.spawnAgent({
      agentRole: 'dev',
      spawnIntentId: 'intent-1',
      systemPrompt: 'Follow SpecForge rules.',
      cwd: 'D:/project',
    });
    expect(result.sessionId).toBe('oc-real-session');
    expect(runtime.createSession).toHaveBeenCalledOnce();
    expect(runtime.sendPrompt).toHaveBeenCalledWith(
      'oc-real-session',
      expect.objectContaining({ content: 'Follow SpecForge rules.', noReply: true }),
      'D:/project',
    );

    await adapter.sendPrompt(result.sessionId, { role: 'user', content: 'Implement it.' });
    await adapter.cancelSession(result.sessionId, 'done');
    expect(runtime.sendPrompt).toHaveBeenCalledTimes(2);
    expect(runtime.abortSession).toHaveBeenCalledWith('oc-real-session', 'D:/project');
  });
});
