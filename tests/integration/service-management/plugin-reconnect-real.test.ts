/**
 * Integration Test 12.6: Plugin Reconnect Real
 *
 * Tests real plugin reconnection behaviour using actual HTTP servers:
 *   1. Happy path — postEvent succeeds when server is running
 *   2. Server stop + restart — reconnect succeeds after backoff
 *   3. Server stays down — enters degraded mode after max cumulative backoff
 *   4. Disposed client — returns disposed result
 *   5. Warn-once — degraded warning printed exactly once; auth token never logged
 *   6. Timer cleanup — dispose() clears all backoff timers
 *
 * Platform: dual platform (uses node:http on 127.0.0.1).
 * Validates Requirements 5.2, 5.3, 5.4.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ReconnectingDaemonClient } from '../../../packages/service-management/src/plugin/reconnecting-daemon-client.js';
import type { PostResult } from '../../../packages/service-management/src/plugin/reconnecting-daemon-client.js';
import type { HandshakeFile } from '../../../packages/service-management/src/types/handshake.js';
import * as http from 'node:http';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ServerHandle {
  server: http.Server;
  port: number;
}

/** Create a real HTTP server on a random available port. */
function createServer(): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/v1/healthz' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/api/v1/ingest/event' && req.method === 'POST') {
        // Consume body but don't validate — just acknowledge
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
    server.on('error', reject);
  });
}

/** Close a server gracefully. */
function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/** Write a handshake.json to the given directory and return its full path. */
async function writeHandshake(
  dir: string,
  port: number,
  authToken: string,
): Promise<string> {
  const handshakePath = path.join(dir, 'handshake.json');
  const handshake: HandshakeFile = {
    schema_version: '1.0',
    pid: process.pid,
    port,
    token: authToken,
    startedAt: Date.now(),
    version: '1.0.0-test',
    serviceMode: false,
  };
  await writeFile(handshakePath, JSON.stringify(handshake, null, 2), 'utf-8');
  return handshakePath;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Plugin reconnect real', () => {
  const clients: ReconnectingDaemonClient[] = [];
  const servers: http.Server[] = [];
  const tempDirs: string[] = [];

  function trackClient(client: ReconnectingDaemonClient): ReconnectingDaemonClient {
    clients.push(client);
    return client;
  }

  function trackServer(handle: ServerHandle): ServerHandle {
    servers.push(handle.server);
    return handle;
  }

  function trackTempDir(dir: string): string {
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    // Dispose every tracked client and assert no leaked timers
    for (const client of clients) {
      client.dispose();
      expect(client.getActiveBackoffTimerCount()).toBe(0);
    }
    clients.length = 0;

    // Close every tracked server
    for (const server of servers) {
      try {
        await closeServer(server);
      } catch {
        // Best effort — server may already be closed by a test
      }
    }
    servers.length = 0;

    // Remove temp directories
    for (const dir of tempDirs) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    }
    tempDirs.length = 0;

    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Happy path — postEvent succeeds when server is running
  // =========================================================================

  it('postEvent succeeds when server is running', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-happy-')),
    );

    const handle = trackServer(await createServer());
    const handshakePath = await writeHandshake(tempDir, handle.port, 'tok-happy');

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 50,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 5000,
      }),
    );

    const result = await client.postEvent('test.event', { value: 42 });

    expect(result.ok).toBe(true);
    expect(result.dropped).toBe(false);
    expect(result.reason).toBe('success');
    expect(client.isDegraded()).toBe(false);
  });

  // =========================================================================
  // 2. Server stop + restart — reconnect succeeds after backoff
  // =========================================================================

  it('reconnects after server stop and restart', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-recon-')),
    );

    const handle1 = trackServer(await createServer());
    const handshakePath = await writeHandshake(tempDir, handle1.port, 'tok-alpha');

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 50,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 5000,
      }),
    );

    // Step 1: postEvent succeeds on server 1
    const result1 = await client.postEvent('test.event', { step: 1 });
    expect(result1.ok).toBe(true);
    expect(result1.reason).toBe('success');

    // Step 2: Stop server 1
    await closeServer(handle1.server);

    // Step 3: Start postEvent — POST will fail and enter backoff
    const reconnectPromise = client.postEvent('test.event', { step: 2 });

    // Step 4: Quickly start server 2 and update handshake
    const handle2 = trackServer(await createServer());
    await writeHandshake(tempDir, handle2.port, 'tok-beta');

    // Step 5: Backoff retry re-reads handshake → new port → reconnect succeeds
    const result2 = await reconnectPromise;

    expect(result2.ok).toBe(true);
    expect(result2.dropped).toBe(false);
    expect(result2.reason).toBe('success');
    expect(client.isDegraded()).toBe(false);
  });

  // =========================================================================
  // 3. Server stays down — enters degraded mode
  // =========================================================================

  it('enters degraded mode when server stays down', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-degr-')),
    );

    // Point handshake to port 1 — nothing is listening there
    const handshakePath = await writeHandshake(tempDir, 1, 'tok-dead');

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 50,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 200, // Very low — degrades after ~350 ms total
      }),
    );

    const result = await client.postEvent('test.event', { value: 1 });

    expect(result.ok).toBe(false);
    expect(result.dropped).toBe(true);
    expect(result.reason).toBe('degraded');
    expect(client.isDegraded()).toBe(true);
  });

  // =========================================================================
  // 4. Disposed client returns disposed result
  // =========================================================================

  it('returns disposed result when client is disposed', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-disp-')),
    );
    const handle = trackServer(await createServer());

    const handshakePath = await writeHandshake(tempDir, handle.port, 'tok-dispose');

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 50,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 5000,
      }),
    );

    // Verify it works before disposal
    const before = await client.postEvent('test.event', { step: 'before' });
    expect(before.ok).toBe(true);

    // Dispose
    client.dispose();

    // postEvent after disposal must return disposed result
    const after = await client.postEvent('test.event', { step: 'after' });
    expect(after.ok).toBe(false);
    expect(after.dropped).toBe(true);
    expect(after.reason).toBe('disposed');
  });

  // =========================================================================
  // 5. Warn-once — degraded warning printed exactly once; token never logged
  // =========================================================================

  it('prints degraded warning only once and never includes auth token', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-warn-')),
    );

    // Use a distinctive token value; we will verify it never appears in stderr
    const secretToken = 'sec-NEVER-LOG-THIS-abc123';
    const handshakePath = await writeHandshake(tempDir, 1, secretToken);

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 30,
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 100,
      }),
    );

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Trigger degraded mode
    const result1 = await client.postEvent('test.event', { value: 1 });
    expect(result1.reason).toBe('degraded');

    // Call postEvent again while degraded
    const result2 = await client.postEvent('test.event', { value: 2 });
    expect(result2.reason).toBe('degraded');

    // Warn-once: console.error called exactly once
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // The token must never appear in any console.error output
    for (const callArgs of errorSpy.mock.calls) {
      const output = callArgs.join(' ');
      expect(output).not.toContain(secretToken);
    }
  });

  // =========================================================================
  // 6. Timer cleanup — dispose() clears all backoff timers
  // =========================================================================

  it('dispose() clears all backoff timers', async () => {
    const tempDir = trackTempDir(
      await mkdtemp(path.join(os.tmpdir(), 'sf-rc-timer-')),
    );

    // Point to dead port so POST fails immediately
    const handshakePath = await writeHandshake(tempDir, 1, 'tok-cleanup');

    const client = trackClient(
      new ReconnectingDaemonClient({
        handshakePath,
        healthzUrl: 'http://127.0.0.1',
        initialDelayMs: 500, // Long enough that timer is still active when we check
        backoffFactor: 2.0,
        maxCumulativeBackoffMs: 50000,
      }),
    );

    // Start postEvent — will fail and schedule a 500 ms backoff timer
    const pendingPromise = client.postEvent('test.event', { value: 1 });

    // Give the async POST enough time to fail and start the timer
    await new Promise((r) => setTimeout(r, 100));

    // The backoff timer should now be active
    expect(client.getActiveBackoffTimerCount()).toBe(1);

    // Dispose while backoff is in-flight — must clear the timer
    client.dispose();
    expect(client.getActiveBackoffTimerCount()).toBe(0);

    // The pending promise eventually resolves (inner timer fires →
    // retryPendingEvent sees disposed=true → returns disposed)
    const result = await pendingPromise;
    expect(result.ok).toBe(false);
    expect(result.dropped).toBe(true);
  });
});
