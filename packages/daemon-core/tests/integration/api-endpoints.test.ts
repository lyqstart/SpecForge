/**
 * E1 Integration Test — API Endpoints
 *
 * Tests:
 * - All API endpoint HTTP calls
 * - Bearer Token auth (valid/invalid)
 * - SSE event stream connection
 * - CAS store/retrieve
 * - State read/transition
 * - Event log
 * - Unknown route → 404
 * - Bad request → 400
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import { Daemon } from '../../src/daemon/Daemon';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';

function httpRequest(
  options: http.RequestOptions,
  body?: string,
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('HTTP timeout')), 5000);
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        resolve({ statusCode: res.statusCode ?? 0, body: data, headers: res.headers });
      });
      res.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
    req.on('error', (err) => { clearTimeout(timeout); reject(err); });
    if (body) req.write(body);
    req.end();
  });
}

function makeOptions(
  port: number,
  method: string,
  path: string,
  token?: string,
  contentType?: string,
): http.RequestOptions {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (contentType) headers['Content-Type'] = contentType;

  return {
    hostname: '127.0.0.1',
    port,
    method,
    path,
    headers,
  };
}

describe('E1 API Endpoints', () => {
  let daemon: Daemon;
  let config: DaemonConfig;
  let port: number;
  let token: string;

  beforeEach(async () => {
    daemon = new Daemon();
    config = new DaemonConfig();
    await daemon.start();

    const handshakePath = config.getHandshakeFile();
    const content = await fs.readFile(handshakePath, 'utf-8');
    const handshake = JSON.parse(content);
    port = handshake.port as number;
    token = handshake.token as string;
  }, 30000);

  afterEach(async () => {
    if (daemon.isDaemonRunning()) {
      await daemon.stop();
    }
  }, 15000);

  describe('Authentication', () => {
    it('should reject requests without auth token', async () => {
      const res = await httpRequest(makeOptions(port, 'POST', '/api/v1/state/read', undefined, 'application/json'), '{}');
      expect(res.statusCode).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const res = await httpRequest(makeOptions(port, 'POST', '/api/v1/state/read', 'bad-token', 'application/json'), '{}');
      expect(res.statusCode).toBe(401);
    });

    it('should accept requests with valid token', async () => {
      const res = await httpRequest(makeOptions(port, 'POST', '/api/v1/state/read', token, 'application/json'), '{"workItemId":"WI-001"}');
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('State Endpoints', () => {
    it('should handle state/read', async () => {
      const res = await httpRequest(
        makeOptions(port, 'POST', '/api/v1/state/read', token, 'application/json'),
        '{"workItemId":"WI-001"}',
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should handle state/transition', async () => {
      const res = await httpRequest(
        makeOptions(port, 'POST', '/api/v1/state/transition', token, 'application/json'),
        '{"workItemId":"WI-001","fromState":"","toState":"intake"}',
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Event Endpoints', () => {
    it('should handle event/log', async () => {
      const res = await httpRequest(
        makeOptions(port, 'POST', '/api/v1/event/log', token, 'application/json'),
        '{"projectId":"test","category":"state","action":"test.event","payload":{}}',
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
      expect(parsed.data.eventId).toBeDefined();
    });

    it('should handle event/query', async () => {
      const res = await httpRequest(
        makeOptions(port, 'POST', '/api/v1/event/query', token, 'application/json'),
        '{"projectId":"test"}',
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('CAS Endpoints', () => {
    it('should handle cas/store', async () => {
      const res = await httpRequest(
        makeOptions(port, 'POST', '/api/v1/cas/store', token, 'application/json'),
        '{"data":"hello world"}',
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should handle cas/retrieve', async () => {
      const res = await httpRequest(
        makeOptions(port, 'GET', '/api/v1/cas/retrieve?hash=abc123', token),
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Session Endpoint', () => {
    it('should handle session/list', async () => {
      const res = await httpRequest(
        makeOptions(port, 'GET', '/api/v1/session/list', token),
      );
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('SSE', () => {
    it('should establish SSE connection and receive connected event', async () => {
      const sseData = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SSE timeout')), 5000);
        const options: http.RequestOptions = {
          hostname: '127.0.0.1',
          port,
          path: '/events',
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        };

        const req = http.request(options, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toBe('text/event-stream');

          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('connected')) {
              clearTimeout(timeout);
              res.destroy();
              resolve(data);
            }
          });
        });
        req.on('error', (err) => {
          clearTimeout(timeout);
          if (err.message.includes('ECONNRESET')) {
            resolve('');
          } else {
            reject(err);
          }
        });
        req.end();
      });

      expect(sseData).toContain('connected');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await httpRequest(makeOptions(port, 'GET', '/unknown/route', token));
      expect(res.statusCode).toBe(404);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid JSON body', async () => {
      const options = makeOptions(port, 'POST', '/api/v1/state/read', token, 'application/json');
      const res = await httpRequest(options, 'not-valid-json');
      expect(res.statusCode).toBe(400);
      const parsed = JSON.parse(res.body);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('INVALID_JSON');
    });
  });
});
