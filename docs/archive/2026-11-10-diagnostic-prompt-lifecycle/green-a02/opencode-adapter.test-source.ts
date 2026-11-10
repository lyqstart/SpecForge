import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeHttpRuntimeClient } from '../src/integration/OpenCodeHttpRuntimeClient';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('generation delivery acknowledgment is independent of inference lifetime', () => {
  it('acknowledges before a generation longer than the unchanged thirty-second transport bound', async () => {
    vi.useFakeTimers(); let completed = false, acknowledged = false, failure: unknown;
    const requests: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); requests.push(url);
      if (url.includes('/prompt_async')) { setTimeout(() => { completed = true; }, 31_000); return new Response(null, { status: 204 }); }
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => { completed = true; resolve(Response.json({ info: { id: 'assistant' }, parts: [] })); }, 31_000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
    });
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch });
    const pending = client.sendPrompt('owned-session', { content: 'real work', messageId: 'msg_owned', agent: 'sf-orchestrator', model: 'provider/model' }, 'D:/owned').then(() => { acknowledged = true; }, error => { failure = error; });
    await vi.advanceTimersByTimeAsync(1); expect(acknowledged).toBe(true); expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(30_999); await pending; expect(completed).toBe(true); expect(failure).toBeUndefined();
    expect(requests).toEqual(['http://127.0.0.1:4096/session/owned-session/prompt_async?directory=D%3A%2Fowned']);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ parts: [{ type: 'text', text: 'real work' }], messageID: 'msg_owned', agent: 'sf-orchestrator', model: { providerID: 'provider', modelID: 'model' } });
  });

  it('keeps synchronous noReply persistence before accepting the next generated prompt', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []; let stored = false;
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: (async (url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body });
      if (body.noReply === true) { await Promise.resolve(); stored = true; return Response.json({ info: { id: 'context-message' }, parts: [] }); }
      expect(stored).toBe(true); return new Response(null, { status: 204 });
    }) as typeof fetch });
    await client.sendPrompt('s1', { content: 'context', noReply: true }); await client.sendPrompt('s1', { content: 'generate' });
    expect(calls.map(v => new URL(v.url).pathname)).toEqual(['/session/s1/message', '/session/s1/prompt_async']);
  });

  it.each([400, 404, 409, 503, 200])('rejects non-204 asynchronous acceptance HTTP%s without synchronous fallback or resend', async status => {
    const fetchFn = vi.fn(async () => Response.json({ success: false }, { status }));
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch });
    await expect(client.sendPrompt('s1', { content: 'generate' })).rejects.toThrow(); expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/prompt_async');
  });

  it('retains the original 30000ms bound when the server never acknowledges delivery', async () => {
    vi.useFakeTimers(); let failure: unknown;
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: ((_url, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }); })) as typeof fetch });
    const pending = client.sendPrompt('s1', { content: 'generate' }).catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(29_999); expect(failure).toBeUndefined(); await vi.advanceTimersByTimeAsync(1); await pending;
    expect(String(failure)).toContain('timed out after 30000ms');
  });

  it('requires an actual positive cancellation acknowledgment', async () => {
    const fetchFn = vi.fn(async () => Response.json(false)); const client = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch });
    await expect(client.abortSession('s1', 'D:/owned')).rejects.toThrow(); expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('delivers a later model failure through the actual SSE parser rather than treating ACK as completion', async () => {
    const payload = { type: 'session.error', properties: { sessionID: 's1', error: { name: 'OwnedProviderError', data: { message: 'synthetic provider rejection' } } } };
    const fetchFn = vi.fn(async (url: string | URL | Request) => String(url).includes('/prompt_async') ? new Response(null, { status: 204 }) : new Response(new TextEncoder().encode('data: ' + JSON.stringify(payload) + '\n\n'), { headers: { 'content-type': 'text/event-stream' } }));
    const client = new OpenCodeHttpRuntimeClient({ fetchFn: fetchFn as typeof fetch }); await client.sendPrompt('s1', { content: 'generate' });
    const events: unknown[] = []; for await (const event of client.subscribeEvents('D:/owned')) events.push(event);
    expect(events).toEqual([payload]); expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
