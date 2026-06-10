/**
 * WI-2: Production Daemon Startup & Recovery E2E
 *
 * Verifies the REAL HTTPServer startup path (same as Daemon.start())
 * and fail-closed behavior when daemon is unreachable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPServer, type HTTPServerDeps } from '../src/http/HTTPServer';
import { EventBus } from '../src/event-bus/EventBus';
import { DaemonConfig } from '../src/daemon/DaemonConfig';
import { ReconnectingDaemonClient } from '../../service-management/src/plugin/reconnecting-daemon-client';

describe('WI-2: Production Daemon Startup & Recovery E2E', () => {
  let tempDir: string;
  let server: HTTPServer;
  let port: number;
  let token: string;
  let client: ReconnectingDaemonClient;
  let handshakePath: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-daemon-recovery-'));
    const config = new DaemonConfig([]);
    const eventBus = new EventBus();
    token = 'test-recovery-e2e-token';
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: {} as any,
      wal: {} as any,
    };
    server = new HTTPServer(deps);
    server.setToken(token);
    const result = await server.start();
    port = result.port;
    handshakePath = join(tempDir, 'handshake.json');
    writeFileSync(handshakePath, JSON.stringify({ port, token, pid: process.pid, startedAt: Date.now() }));
    client = new ReconnectingDaemonClient({ handshakePath, healthzUrl: 'http://127.0.0.1' });
  });

  afterAll(async () => {
    client.dispose();
    await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Startup verification', () => {
    it('daemon health endpoint responds', async () => {
      const resp = await fetch(`http://127.0.0.1:${port}/health`);
      expect(resp.ok).toBe(true);
    });

    it('write-guard routes registered on startup', async () => {
      const projectDir = join(tempDir, 'proj');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result).toBeDefined();
      expect(result.allowed).toBe(false); // no active WI
    });

    it('all 4 client methods callable', async () => {
      expect(typeof client.checkWrite).toBe('function');
      expect(typeof client.bashGuard).toBe('function');
      expect(typeof client.changedFilesAudit).toBe('function');
      expect(typeof client.recordEscapedWrite).toBe('function');
    });
  });

  describe('Fail-closed behavior', () => {
    it('daemon unreachable → checkWrite throws (fail closed)', async () => {
      const badHandshake = join(tempDir, 'bad.json');
      writeFileSync(badHandshake, JSON.stringify({ port: port + 9999, token, pid: 1, startedAt: 1 }));
      const badClient = new ReconnectingDaemonClient({ handshakePath: badHandshake, healthzUrl: 'http://127.0.0.1' });
      try {
        await expect(badClient.checkWrite('src/x.ts', 'agent')).rejects.toThrow();
      } finally {
        badClient.dispose();
      }
    });

    it('no handshake file → checkWrite throws (fail closed)', async () => {
      const missingPath = join(tempDir, 'nonexistent', 'handshake.json');
      const badClient = new ReconnectingDaemonClient({ handshakePath: missingPath, healthzUrl: 'http://127.0.0.1' });
      try {
        await expect(badClient.checkWrite('src/x.ts', 'agent')).rejects.toThrow();
      } finally {
        badClient.dispose();
      }
    });

    it('daemon stop → subsequent requests fail closed', async () => {
      // Start a second server, then stop it
      const config2 = new DaemonConfig([]);
      const eb2 = new EventBus();
      const server2 = new HTTPServer({ config: config2, eventBus: eb2, stateManager: {} as any, wal: {} as any } as any);
      server2.setToken('tok2');
      const { port: port2 } = await server2.start();
      const hs2 = join(tempDir, 'hs2.json');
      writeFileSync(hs2, JSON.stringify({ port: port2, token: 'tok2', pid: 1, startedAt: 1 }));
      const c2 = new ReconnectingDaemonClient({ handshakePath: hs2, healthzUrl: 'http://127.0.0.1' });
      
      // Works before stop
      const projectDir = join(tempDir, 'proj2');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      (c2 as any).registeredProjectPath = projectDir;
      const before = await c2.checkWrite('src/x.ts', 'agent');
      expect(before.allowed).toBe(false);
      
      // Stop server
      await server2.stop();
      
      // After stop → fail closed
      await expect(c2.checkWrite('src/x.ts', 'agent')).rejects.toThrow();
      c2.dispose();
    });
  });
});
