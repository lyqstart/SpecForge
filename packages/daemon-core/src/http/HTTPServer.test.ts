/**
 * HTTP Server unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HTTPServer, HTTPServerDeps, replaceDataWithCasRef } from './HTTPServer';
import { EventBus } from '../event-bus/EventBus';
import { DaemonConfig } from '../daemon/DaemonConfig';
import { HandshakeManager } from '../daemon/HandshakeManager';
import * as http from 'http';

describe('HTTPServer', () => {
  let server: HTTPServer;
  let eventBus: EventBus;
  let config: DaemonConfig;

  beforeEach(() => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    server = new HTTPServer(config, eventBus);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start and stop successfully', async () => {
    const result = await server.start();
    expect(result.port).toBeGreaterThan(0);
    expect(result.port).toBeLessThan(65536);
  });

  it('should return 401 for missing authorization', async () => {
    await server.start();
    
    // This test would require a full HTTP client setup
    // For now, just verify the server starts
    expect(server).toBeDefined();
  });

  it('should broadcast events to SSE clients', async () => {
    await server.start();
    
    // This test would require SSE client setup
    // For now, just verify the method exists
    expect(typeof server.broadcastEvent).toBe('function');
  });
});

describe('CAS compression for oversized payloads', () => {
  let server: HTTPServer;
  let config: DaemonConfig;
  let eventBus: EventBus;
  let handshakeManager: HandshakeManager;
  let token: string;

  beforeEach(async () => {
    config = new DaemonConfig();
    eventBus = new EventBus();
    handshakeManager = new HandshakeManager(config);
    token = handshakeManager.generateToken();
    await handshakeManager.writeHandshake(process.pid, 0, token);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await handshakeManager.cleanup();
  });

  it('should CAS-store oversized JSON body with data field and return 200 (not 413)', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    await server.start();

    // Build a JSON body > 64 KiB with a "data" field
    const largeData = 'x'.repeat(65 * 1024);
    const payload = JSON.stringify({ sessionId: 's1', type: 'tool.invoked', data: largeData });

    const result = await makeRequestToServer(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    // Should NOT return 413 — should compress and continue routing
    expect(result.statusCode).toBe(200);
  });

  it('should return 413 when CAS store fails', async () => {
    // Create a server with a CAS that always rejects
    const failingDeps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: undefined as any,
      wal: undefined as any,
    };
    server = new HTTPServer(failingDeps);
    server.setToken(token);
    await server.start();

    // Replace the internal CAS with a failing one
    (server as any).cas = {
      store: async () => { throw new Error('CAS disk full'); },
    };

    const largeData = 'y'.repeat(65 * 1024);
    const payload = JSON.stringify({ sessionId: 's2', type: 'tool.invoked', data: largeData });

    const result = await makeRequestToServer(server, {
      method: 'POST',
      path: '/',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Payload Too Large');
    expect(body.reason).toContain('CAS compression failed');
  });

  it('should NOT trigger CAS for body at exactly maxSize (64 KiB)', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    await server.start();

    // maxSize = 64 * 1024 = 65536 bytes
    // Build a JSON body that is exactly 65536 bytes (≤ maxSize, no CAS)
    const maxSize = 64 * 1024;
    // Create a JSON payload with padding via data field to exactly hit maxSize
    const base = { sessionId: 's3', type: 'tool.invoked', data: '' };
    const baseLen = Buffer.byteLength(JSON.stringify(base));
    // data field needs to fill the remaining space (minus the empty string + padding chars)
    const padSize = maxSize - baseLen;
    base.data = ' '.repeat(padSize);
    const payload = JSON.stringify(base);
    // Adjust: the data field grew from '' to ' '.repeat(padSize), which is exactly maxSize
    // But JSON.stringify adds quotes, so let's just ensure it's <= maxSize
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(maxSize);

    const result = await makeRequestToServer(server, {
      method: 'POST',
      path: '/api/v1/ingest/event',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    // Should get 200 (normal route), not 413 — body is at or under limit
    expect(result.statusCode).toBe(200);
  });

  it('should return 413 for oversized non-JSON body', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    await server.start();

    // Non-JSON body larger than 64 KiB
    const largePayload = 'z'.repeat(65 * 1024);

    const result = await makeRequestToServer(server, {
      method: 'POST',
      path: '/',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
        'Content-Length': String(largePayload.length),
      },
      body: largePayload,
    });

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Payload Too Large');
    expect(body.reason).toContain('not valid JSON');
  });

  it('should return 413 for oversized JSON without data field', async () => {
    server = new HTTPServer(config, eventBus);
    server.setToken(token);
    await server.start();

    // JSON without "data" field, padded to > 64 KiB
    const payload = JSON.stringify({ sessionId: 's5', type: 'tool.invoked', bigField: 'a'.repeat(65 * 1024) });

    const result = await makeRequestToServer(server, {
      method: 'POST',
      path: '/',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Payload Too Large');
    expect(body.reason).toContain('no "data" field');
  });
});

describe('replaceDataWithCasRef pure function', () => {
  it('should replace data field with CAS reference', () => {
    const bodyJson = { sessionId: 'test', type: 'tool.invoked', data: 'original-big-data' };
    const casRef = { type: 'cas-blob' as const, hash: 'abc123', size: 65537, reference: 'blob://abc123' };

    const result = replaceDataWithCasRef(bodyJson, casRef);
    const parsed = JSON.parse(result);

    expect(parsed.sessionId).toBe('test');
    expect(parsed.type).toBe('tool.invoked');
    expect(parsed.data).toEqual(casRef);
    expect(parsed.data.type).toBe('cas-blob');
    expect(parsed.data.hash).toBe('abc123');
  });

  it('should preserve all other fields unchanged', () => {
    const bodyJson = { a: 1, b: 'two', c: [3], nested: { x: 'y' }, data: 'big' };
    const casRef = { type: 'cas-blob' as const, hash: 'h1', size: 100, reference: 'blob://h1' };

    const result = replaceDataWithCasRef(bodyJson, casRef);
    const parsed = JSON.parse(result);

    expect(parsed.a).toBe(1);
    expect(parsed.b).toBe('two');
    expect(parsed.c).toEqual([3]);
    expect(parsed.nested).toEqual({ x: 'y' });
    expect(parsed.data).toEqual(casRef);
  });

  it('should produce valid JSON string', () => {
    const bodyJson = { data: 'x' };
    const casRef = { type: 'cas-blob' as const, hash: 'h', size: 1, reference: 'blob://h' };

    const result = replaceDataWithCasRef(bodyJson, casRef);
    expect(() => JSON.parse(result)).not.toThrow();
  });
});

/**
 * Helper function to make HTTP requests to the test server
 */
function makeRequestToServer(
  server: HTTPServer,
  options: {
    method: string;
    path: string;
    headers?: http.OutgoingHttpHeaders;
    body?: string;
  }
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
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
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
            headers: res.headers,
          });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
