import { describe, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { OpenCodeHttpRuntimeClient } from '../src/integration/OpenCodeHttpRuntimeClient';

describe('asynchronous prompt over actual HTTP and SSE', () => {
  it('keeps the accepted generation alive past the original transport deadline and observes its later result', async () => {
    const streams = new Set<ServerResponse>(); const requests: string[] = [];
    let done = false, releaseFeed!: () => void, timer: ReturnType<typeof setTimeout> | undefined;
    const feedReady = new Promise<void>(resolve => { releaseFeed = resolve; });
    const terminal = { type: 'session.idle', properties: { sessionID: 'owned-delayed-session' } };
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost'); requests.push(url.pathname);
      if (url.pathname === '/event') {
        res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); streams.add(res);
        res.once('close', () => streams.delete(res)); releaseFeed(); return;
      }
      if (url.pathname === '/session/owned-delayed-session/prompt_async' || url.pathname === '/session/owned-delayed-session/message') {
        const asynchronous = url.pathname.endsWith('/prompt_async');
        req.resume(); req.once('end', () => {
          if (asynchronous) { res.writeHead(204); res.end(); }
          timer = setTimeout(() => {
            done = true;
            for (const stream of streams) stream.write('data: ' + JSON.stringify(terminal) + '\n\n');
            if (!asynchronous) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ info: { id: 'delayed-result' }, parts: [] })); }
          }, 31_000);
        }); return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('OWNED_SERVER_ADDRESS');
    const client = new OpenCodeHttpRuntimeClient({ baseUrl: 'http://127.0.0.1:' + address.port });
    const controller = new AbortController(), iterator = client.subscribeEvents('owned-directory', controller.signal)[Symbol.asyncIterator]();
    const event = iterator.next();
    try {
      await feedReady; const start = performance.now();
      await client.sendPrompt('owned-delayed-session', { content: 'owned delayed fixture', messageId: 'msg_delayed' }, 'owned-directory');
      expect(done).toBe(false);
      const actual = await event; expect(actual.value).toEqual(terminal); expect(done).toBe(true);
      expect(performance.now() - start).toBeGreaterThan(30_000);
      expect(requests.filter(value => value.includes('prompt_async'))).toEqual(['/session/owned-delayed-session/prompt_async']);
      expect(requests.some(value => value.endsWith('/message') || value.endsWith('/abort'))).toBe(false);
    } finally {
      if (timer) clearTimeout(timer); controller.abort(); for (const stream of streams) stream.end();
      server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await event.catch(() => undefined); await iterator.return?.();
    }
  }, 45_000);
});
