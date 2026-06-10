/**
 * v11-full-daemon-startup-writeguard-e2e.test.ts
 *
 * Verifies that write guard routes are accessible through the PRODUCTION
 * HTTPServer startup path (same as Daemon.start() uses internally).
 *
 * Chain: HTTPServer(deps).start() → registerDefaultRoutes() → write-guard routes active
 *        → ReconnectingDaemonClient.checkWrite() → HTTP → response
 *
 * This proves routes are NOT manually registered in test — they come from
 * the production registerDefaultRoutes() in HTTPServer constructor.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { HTTPServer, type HTTPServerDeps } from '../src/http/HTTPServer';
import { EventBus } from '../src/event-bus/EventBus';
import { DaemonConfig } from '../src/daemon/DaemonConfig';
import { ReconnectingDaemonClient } from '../../service-management/src/plugin/reconnecting-daemon-client';

describe('v1.1 Full Daemon Startup Write Guard E2E', () => {
  let tempDir: string;
  let server: HTTPServer;
  let port: number;
  let token: string;
  let client: ReconnectingDaemonClient;
  let handshakePath: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-full-daemon-wg-'));

    // Start PRODUCTION HTTPServer (same way Daemon does)
    const config = new DaemonConfig([]);
    const eventBus = new EventBus();
    token = 'test-full-daemon-wg-token';

    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: {} as any,
      wal: {} as any,
      // Minimal deps — same pattern as existing v11-daemon-e2e-http.test.ts
      // Write guard routes don't need toolDispatcher
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    const result = await server.start();
    port = result.port;

    // Write handshake.json for ReconnectingDaemonClient
    handshakePath = join(tempDir, 'handshake.json');
    writeFileSync(handshakePath, JSON.stringify({
      port,
      token,
      pid: process.pid,
      startedAt: Date.now(),
    }));

    // Create REAL ReconnectingDaemonClient
    client = new ReconnectingDaemonClient({
      handshakePath,
      healthzUrl: 'http://127.0.0.1',
    });
  });

  afterAll(async () => {
    client.dispose();
    await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S1: Write guard route is accessible after daemon startup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S1: Write guard route accessible after production startup', () => {
    it('checkWrite reaches daemon and returns response (not 404, not connection refused)', async () => {
      // Create project without active WI
      const projectDir = join(tempDir, 'project-s1');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');

      // We expect a valid response — NOT 404 or method not found
      expect(result).toBeDefined();
      expect(result.allowed).toBe(false); // no active WI
      expect(result.violations).toBeDefined();
      expect(result.violations!.some((v: string) => v.includes('no active WI'))).toBe(true);
    });

    it('bashGuard reaches daemon and returns response', async () => {
      const projectDir = join(tempDir, 'project-s1-bash');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });

      (client as any).registeredProjectPath = projectDir;
      const result = await client.bashGuard('echo hello', ['src/app.ts']);

      expect(result).toBeDefined();
      expect(result.allowed).toBe(false); // no active WI
      expect(result.reason).toContain('no active WI');
    });

    it('changedFilesAudit reaches daemon and returns response', async () => {
      const projectDir = join(tempDir, 'project-s1-audit');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });

      (client as any).registeredProjectPath = projectDir;
      const result = await client.changedFilesAudit({
        command: 'test',
        expectedFiles: ['src/app.ts'],
      });

      // Should not be null (route reachable)
      expect(result).not.toBeNull();
    });

    it('recordEscapedWrite reaches daemon without error', async () => {
      (client as any).registeredProjectPath = join(tempDir, 'project-s1');
      await expect(client.recordEscapedWrite({
        command: 'test',
        expectedFiles: ['src/app.ts'],
        escapedWrites: ['src/secret.ts'],
      })).resolves.toBeUndefined();
    });

    it('health endpoint confirms daemon is running', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.ok).toBe(true);
      const body = await response.json() as any;
      expect(body.data.status).toBe('ok');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S2: Active WI + allowed_write_files 内允许
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S2: allowed_write_files match → allowed', () => {
    it('daemon reads real work_item.json and allows write', async () => {
      const projectDir = join(tempDir, 'project-s2');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-001');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-001',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('file can be safely modified after allowed check', async () => {
      const projectDir = join(tempDir, 'project-s2b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-002');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-002',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(true);

      // Write after allowed
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'modified');
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('modified');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S3: allowed_write_files 外阻断
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S3: outside allowed_write_files → blocked', () => {
    it('daemon blocks write to file not in allowed_write_files', async () => {
      const projectDir = join(tempDir, 'project-s3');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-003');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-003',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/secret.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(result.violations!.some((v: string) => v.includes('not in allowed_write_files'))).toBe(true);
    });

    it('file remains unmodified when blocked', async () => {
      const projectDir = join(tempDir, 'project-s3b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-004');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-004',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));
      writeFileSync(join(projectDir, 'src', 'secret.ts'), 'secret');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/secret.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(readFileSync(join(projectDir, 'src', 'secret.ts'), 'utf-8')).toBe('secret');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S4: changedFilesAudit route works through production daemon
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S4: changedFilesAudit route accessible via production daemon', () => {
    it('audit fails when out-of-scope files reported', async () => {
      const projectDir = join(tempDir, 'project-s4');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-005');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-005',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const auditResult = await client.changedFilesAudit({
        command: 'npm run format',
        expectedFiles: ['src/app.ts', 'src/secret.ts'],
      });

      expect(auditResult).not.toBeNull();
      expect(auditResult!.passed).toBe(false);
      expect(auditResult!.violations!.length).toBeGreaterThan(0);
      expect(auditResult!.escapedWrites!).toContain('src/secret.ts');
    });

    it('audit passes when only allowed files reported', async () => {
      const projectDir = join(tempDir, 'project-s4b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-FULL-006');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-FULL-006',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const auditResult = await client.changedFilesAudit({
        command: 'write src/app.ts',
        expectedFiles: ['src/app.ts'],
      });

      expect(auditResult).not.toBeNull();
      expect(auditResult!.passed).toBe(true);
      expect(auditResult!.escapedWrites).toHaveLength(0);
    });
  });
});
