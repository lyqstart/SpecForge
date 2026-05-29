/**
 * CP-4: Ingest Non-Blocking Property Test
 *
 * Feature: daemon-core, CP-4: Ingest Non-Blocking
 * Derived-From: TASK-11 (ingest event routing)
 *
 * Property: For all 7 supported ingest event types
 * (tool.invoking, tool.invoked, opencode.event, session.compacting,
 *  chat.params, chat.headers, shell.env), handleIngestEvent must return
 * an HTTP response within 15 s — even when subsystems are unavailable.
 *
 * This test starts a real HTTPServer, sends ingest events via HTTP POST,
 * and measures the end-to-end response time. All iterations must complete
 * well within the 15 s deadline.
 *
 * Uses fast-check to generate random payloads for each event type.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import * as http from 'http';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';

// ── Constants ──

const INGEST_EVENT_TYPES = [
  'tool.invoking',
  'tool.invoked',
  'opencode.event',
  'session.compacting',
  'chat.params',
  'chat.headers',
  'shell.env',
] as const;

const TEST_TOKEN = 'test-ingest-token-2024';
const INGEST_URL_PATH = '/api/v1/ingest/event';
const CP4_DEADLINE_MS = 15_000; // CP-4 requirement

// ── Helpers ──

interface IngestRequestBody {
  sessionId: string;
  type: string;
  data: unknown;
  ts: number;
}

/**
 * Send a POST request to the ingest event endpoint.
 * Returns a promise that resolves with { statusCode, body, elapsedMs }.
 */
function postIngestEvent(
  port: number,
  body: IngestRequestBody,
): Promise<{ statusCode: number; body: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const start = Date.now();

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: INGEST_URL_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      timeout: CP4_DEADLINE_MS + 2000,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const elapsedMs = Date.now() - start;
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
          elapsedMs,
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${Date.now() - start}ms`));
    });

    req.write(payload);
    req.end();
  });
}

describe('CP-4: Ingest Non-Blocking (handleIngestEvent)', () => {
  let server: HTTPServer;
  let port: number;

  beforeAll(async () => {
    // Create daemon config with empty args (personal mode, default settings)
    const config = new DaemonConfig([]);
    server = new HTTPServer(config);
    server.setToken(TEST_TOKEN);

    const result = await server.start();
    port = result.port;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should respond within 15s for all 7 event types with random payloads', async () => {
    for (const eventType of INGEST_EVENT_TYPES) {
      // Generate 10 random payloads per event type via fast-check sampling
      const payloads = fc.sample(
        fc.record({
          tool: fc.string({ minLength: 1, maxLength: 20 }),
          callID: fc.string({ minLength: 1, maxLength: 20 }),
          args: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.string({ minLength: 0, maxLength: 10 }),
          ),
          subType: fc.constantFrom('session.created', 'session.idle', 'session.error'),
          sessionID: fc.string({ minLength: 1, maxLength: 36 }),
          projectPath: fc.string({ minLength: 1, maxLength: 30 }),
          params: fc.anything(),
          headers: fc.anything(),
        }),
        10,
      );

      for (const payload of payloads) {
        const requestBody: IngestRequestBody = {
          sessionId: `test-session-${eventType}-${Math.random().toString(36).slice(2, 10)}`,
          type: eventType,
          data: payload,
          ts: Date.now(),
        };

        const response = await postIngestEvent(port, requestBody);

        // CP-4: Must return within 15 s
        expect(response.elapsedMs).toBeLessThan(CP4_DEADLINE_MS);

        // Must return HTTP 200
        expect(response.statusCode).toBe(200);

        // Response body must be valid JSON with success=true or received=true
        const parsed = JSON.parse(response.body);
        expect(parsed.success || parsed.received).toBeTruthy();
      }
    }
  }, CP4_DEADLINE_MS + 5000); // per-test timeout: 20s

  it('should not block when subsystems are unavailable', async () => {
    // The HTTPServer is started with empty deps (no sessionRegistry, no eventLogger, etc.)
    // All handler calls use optional chaining (?.) so they should be no-ops

    for (const eventType of INGEST_EVENT_TYPES) {
      const start = Date.now();

      const requestBody: IngestRequestBody = {
        sessionId: 'test-no-deps-session',
        type: eventType,
        data: {},
        ts: Date.now(),
      };

      const response = await postIngestEvent(port, requestBody);

      const elapsedMs = Date.now() - start;
      expect(elapsedMs).toBeLessThan(CP4_DEADLINE_MS);
      expect(response.statusCode).toBe(200);

      // Each sub-handler should complete quickly (< 5s) when deps are missing
      expect(elapsedMs).toBeLessThan(5000);
    }
  }, 30000);

  it('should reject requests without auth token', async () => {
    const body: IngestRequestBody = {
      sessionId: 'test-no-auth',
      type: 'shell.env',
      data: {},
      ts: Date.now(),
    };

    const result = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: INGEST_URL_PATH,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 5000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf-8'),
              });
            });
          },
        );
        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      },
    );

    expect(result.statusCode).toBe(401);
  });

  it('should reject requests with invalid JSON body', async () => {
    const result = await new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: INGEST_URL_PATH,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength('not-json'),
              Authorization: `Bearer ${TEST_TOKEN}`,
            },
            timeout: 5000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf-8'),
              });
            });
          },
        );
        req.on('error', (err) => reject(err));
        req.write('not-json');
        req.end();
      },
    );

    expect(result.statusCode).toBe(400);
  });

  it('should handle parallel ingest requests without blocking', async () => {
    const requests: Promise<{ statusCode: number; elapsedMs: number }>[] = [];

    for (let i = 0; i < 20; i++) {
      const eventType = INGEST_EVENT_TYPES[i % INGEST_EVENT_TYPES.length]!;
      const body: IngestRequestBody = {
        sessionId: `parallel-${i}`,
        type: eventType,
        data: { iteration: i },
        ts: Date.now(),
      };

      requests.push(
        postIngestEvent(port, body).then((r) => ({
          statusCode: r.statusCode,
          elapsedMs: r.elapsedMs,
        })),
      );
    }

    const results = await Promise.all(requests);

    for (const result of results) {
      expect(result.statusCode).toBe(200);
      // Each individual request should complete quickly
      expect(result.elapsedMs).toBeLessThan(CP4_DEADLINE_MS);
      // In practice, with empty deps, should be sub-second
      expect(result.elapsedMs).toBeLessThan(5000);
    }
  }, 30000);
});
