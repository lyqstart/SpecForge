/**
 * Regression tests for HTTPServer.handleOpenCodeEvent sessionId merge
 *
 * Bug: handleOpenCodeEvent received top-level sessionId param but discarded it,
 * only forwarding `data` to SessionRegistry. This caused SessionRegistry's
 * `data.sessionId` to always be undefined → "No session binding found" WARN.
 *
 * Fix: merge sessionId into payload as fallback: `{ ...payload, sessionId: payload.sessionId ?? sessionId }`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HTTPServer, HTTPServerDeps } from '../../src/http/HTTPServer';
import { EventBus } from '../../src/event-bus/EventBus';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { HandshakeManager } from '../../src/daemon/HandshakeManager';
import * as http from 'http';

/**
 * Helper: make an HTTP request to the test server
 */
function makeRequest(
  server: HTTPServer,
  options: {
    method: string;
    path: string;
    headers?: http.OutgoingHttpHeaders;
    body?: string;
  }
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const port = (server as any).port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', reject);
    if (options.body) { req.write(options.body); }
    req.end();
  });
}

describe('HTTPServer.handleOpenCodeEvent — sessionId merge into payload', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;
  let handshakeManager: HandshakeManager;
  let token: string;
  let capturedOpenCodeEvents: Array<{ subType: string; data: Record<string, unknown> }>;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);

    capturedOpenCodeEvents = [];

    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
      sessionRegistry: {
        handleOpenCodeEvent: (subType: string, data: Record<string, unknown>) => {
          capturedOpenCodeEvents.push({ subType, data });
        },
      },
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    await server.start();
  });

  afterEach(async () => {
    if (server) { await server.stop(); }
    await handshakeManager.cleanup();
  });

  /**
   * Helper: send an opencode.event through the /api/v1/ingest/event endpoint
   */
  async function sendOpenCodeEvent(
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<{ statusCode: number; body: string }> {
    return makeRequest(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        type: 'opencode.event',
        data,
        ts: Date.now(),
      }),
    });
  }

  // ── Scenario A: payload has NO sessionId → fallback to top-level sessionId ──

  it('Scenario A: should inject daemon sessionId when payload has no sessionId', async () => {
    const daemonSessionId = 'daemon-uuid-v7-aaaa-bbbb';

    const result = await sendOpenCodeEvent(daemonSessionId, {
      subType: 'session.idle',
      someField: 'value',
    });

    expect(result.statusCode).toBe(200);

    // Verify handleOpenCodeEvent was called
    expect(capturedOpenCodeEvents.length).toBe(1);
    const captured = capturedOpenCodeEvents[0]!;

    // The merged payload should contain sessionId from the top-level param
    expect(captured.data.sessionId).toBe(daemonSessionId);
    // Other fields preserved
    expect(captured.data.subType).toBe('session.idle');
    expect(captured.data.someField).toBe('value');
  });

  // ── Scenario B: payload already has sessionId → do NOT overwrite ──

  it('Scenario B: should preserve payload.sessionId when already present', async () => {
    const daemonSessionId = 'daemon-uuid-v7-aaaa-bbbb';
    const payloadSessionId = 'payload-session-id-should-win';

    const result = await sendOpenCodeEvent(daemonSessionId, {
      subType: 'session.idle',
      sessionId: payloadSessionId,
    });

    expect(result.statusCode).toBe(200);
    expect(capturedOpenCodeEvents.length).toBe(1);
    const captured = capturedOpenCodeEvents[0]!;

    // payload.sessionId should be preserved, NOT overwritten by daemon sessionId
    expect(captured.data.sessionId).toBe(payloadSessionId);
  });

  // ── Scenario C: payload.sessionId is null/undefined → use fallback ──

  it('Scenario C-undefined: should use fallback sessionId when payload.sessionId is undefined', async () => {
    const daemonSessionId = 'daemon-uuid-v7-cccc-dddd';

    const result = await sendOpenCodeEvent(daemonSessionId, {
      subType: 'chat.streaming',
      sessionId: undefined,
    });

    expect(result.statusCode).toBe(200);
    expect(capturedOpenCodeEvents.length).toBe(1);
    const captured = capturedOpenCodeEvents[0]!;

    // undefined should trigger fallback
    expect(captured.data.sessionId).toBe(daemonSessionId);
  });

  it('Scenario C-null: should use fallback sessionId when payload.sessionId is null', async () => {
    const daemonSessionId = 'daemon-uuid-v7-eeee-ffff';

    const result = await sendOpenCodeEvent(daemonSessionId, {
      subType: 'chat.streaming',
      sessionId: null as any,
    });

    expect(result.statusCode).toBe(200);
    expect(capturedOpenCodeEvents.length).toBe(1);
    const captured = capturedOpenCodeEvents[0]!;

    // null should trigger fallback
    expect(captured.data.sessionId).toBe(daemonSessionId);
  });

  // ── Scenario D: empty string sessionId → `??` treats it as defined, keeps it ──

  it('Scenario D: should keep payload.sessionId empty string (?? only nullish-checks)', async () => {
    const daemonSessionId = 'daemon-uuid-v7-empty-test';

    const result = await sendOpenCodeEvent(daemonSessionId, {
      subType: 'tool.call',
      sessionId: '',
    });

    expect(result.statusCode).toBe(200);
    expect(capturedOpenCodeEvents.length).toBe(1);
    const captured = capturedOpenCodeEvents[0]!;

    // `??` only checks null/undefined, not falsy — empty string is preserved
    expect(captured.data.sessionId).toBe('');
  });
});
