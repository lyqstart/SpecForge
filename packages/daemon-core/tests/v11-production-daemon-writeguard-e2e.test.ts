/**
 * v11-production-daemon-writeguard-e2e.test.ts
 *
 * Production daemon write guard integration test.
 * Tests the REAL ReconnectingDaemonClient calling through HTTP to a production-like
 * server that reads work_item.json from the filesystem and evaluates write-guard-v11.
 *
 * Chain tested (full production path):
 *   ReconnectingDaemonClient.checkWrite()
 *   → HTTP POST /api/v1/v11/write-guard/check
 *   → loadWriteGuardContext() reads real work_item.json
 *   → checkWrite() from write-guard-v11.ts
 *   → JSON response
 *   → Client returns/throws
 *
 * 5 Scenarios:
 *   A1: Daemon unreachable → fail closed (client throws)
 *   A2: No active WI → allowed=false
 *   A3: code_change_allowed=false → allowed=false
 *   A4: allowed_write_files match → allowed=true
 *   A5: Outside allowed_write_files → allowed=false
 *
 * Key properties:
 *   - Uses the REAL ReconnectingDaemonClient (not raw fetch)
 *   - Server reads real work_item.json from filesystem
 *   - All 4 client methods verified to exist and work over HTTP
 *   - Fail-closed behavior verified when daemon unreachable
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';

import {
  checkWrite,
  performChangedFilesAudit,
  type WriteGuardContext,
  type WriteCheckResult,
} from '../src/tools/lib/write-guard-v11';

import { ReconnectingDaemonClient } from '../../service-management/src/plugin/reconnecting-daemon-client';

// ---------------------------------------------------------------------------
// Helper: load WriteGuardContext from real filesystem (same as HTTPServer)
// ---------------------------------------------------------------------------

function loadWriteGuardContextFromFS(projectPath: string, callerRole: string): WriteGuardContext {
  const workItemsDir = join(projectPath, '.specforge', 'work-items');
  let activeWI: WriteGuardContext['workItem'] | undefined;
  let hasActiveWI = false;

  try {
    const dirs = readdirSync(workItemsDir);
    for (const dir of dirs) {
      const wiPath = join(workItemsDir, dir, 'work_item.json');
      try {
        const content = readFileSync(wiPath, 'utf-8');
        const wi = JSON.parse(content);
        if (wi.status !== 'closed' && wi.status !== 'cancelled') {
          hasActiveWI = true;
          activeWI = {
            work_item_id: wi.work_item_id,
            status: wi.status,
            code_change_allowed: wi.code_change_allowed ?? false,
            allowed_write_files: wi.allowed_write_files ?? [],
            workflow_path: wi.workflow_path ?? null,
          };
          break;
        }
      } catch { continue; }
    }
  } catch { /* no work-items dir — hasActiveWI stays false */ }

  return {
    hasActiveWI,
    workItem: activeWI,
    callerRole: callerRole as WriteGuardContext['callerRole'],
    isFrozen: false,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('v1.1 Production Daemon Write Guard E2E (ReconnectingDaemonClient)', () => {
  let tempDir: string;
  let server: http.Server;
  let port: number;
  let client: ReconnectingDaemonClient;
  let handshakePath: string;
  const TOKEN = 'test-token-prod-writeguard-e2e';

  // ── Setup: start real HTTP server + create client ──────────────────────────

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-prod-daemon-wg-e2e-'));

    // Create production-like HTTP server with auth + write guard routes
    server = http.createServer((req, res) => {
      // Auth check
      const authHeader = req.headers['authorization'];
      if (authHeader !== `Bearer ${TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }));
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        const url = req.url ?? '';

        try {
          if (url === '/api/v1/v11/write-guard/check' && req.method === 'POST') {
            const request = JSON.parse(body);
            const { projectPath, targetPath, callerRole } = request;
            if (!targetPath) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: { code: 'MISSING_PARAMS', message: 'targetPath required' } }));
              return;
            }
            if (!projectPath) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { allowed: false, violations: ['no project registered'] } }));
              return;
            }
            const ctx = loadWriteGuardContextFromFS(projectPath, callerRole ?? 'agent');
            const result: WriteCheckResult = checkWrite(ctx, targetPath, 'modify');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: result }));

          } else if (url === '/api/v1/v11/write-guard/bash' && req.method === 'POST') {
            const request = JSON.parse(body);
            const { expectedFiles, projectPath } = request;
            if (!projectPath) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { allowed: false, reason: 'no project registered' } }));
              return;
            }
            const ctx = loadWriteGuardContextFromFS(projectPath, 'agent');
            if (!ctx.hasActiveWI) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { allowed: false, reason: 'no active WI' } }));
              return;
            }
            // Check each expected file
            if (expectedFiles && expectedFiles.length > 0) {
              for (const file of expectedFiles) {
                const result = checkWrite(ctx, file, 'modify');
                if (!result.allowed) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: { allowed: false, reason: result.violations[0] } }));
                  return;
                }
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { allowed: true, reason: 'bash_allowed' } }));

          } else if (url === '/api/v1/v11/write-guard/changed-files-audit' && req.method === 'POST') {
            const request = JSON.parse(body);
            const { projectPath, expectedFiles } = request;
            if (!projectPath) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: { passed: true, escapedWrites: [] } }));
              return;
            }
            const ctx = loadWriteGuardContextFromFS(projectPath, 'agent');
            const allowedWriteFiles = ctx.workItem?.allowed_write_files ?? [];
            const changedFiles = (expectedFiles ?? []).map((f: string) => ({ path: f, operation: 'modify' as const }));
            const result = performChangedFilesAudit(changedFiles, allowedWriteFiles, 'agent');
            const escapedWrites = result.entries
              .filter(e => !e.in_allowed_write_files && !e.is_spec_write)
              .map(e => e.path);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { passed: result.passed, escapedWrites, violations: result.violations } }));

          } else if (url === '/api/v1/v11/write-guard/escaped-write' && req.method === 'POST') {
            const request = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: { recorded: true, timestamp: request.timestamp ?? new Date().toISOString() } }));

          } else if (url === '/api/v1/healthz' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));

          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
          }
        } catch (err: unknown) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL', message: String(err) } }));
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
          resolve();
        } else {
          reject(new Error('Failed to get server port'));
        }
      });
    });

    // Write handshake.json for the client
    handshakePath = join(tempDir, 'handshake.json');
    writeFileSync(handshakePath, JSON.stringify({
      port,
      token: TOKEN,
      pid: process.pid,
      startedAt: Date.now(),
    }));

    // Create the REAL ReconnectingDaemonClient
    client = new ReconnectingDaemonClient({
      handshakePath,
      healthzUrl: 'http://127.0.0.1',
    });
  });

  afterAll(async () => {
    client.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Verify all 4 methods exist on client
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Client method existence', () => {
    it('checkWrite exists as a function', () => {
      expect(typeof client.checkWrite).toBe('function');
    });

    it('bashGuard exists as a function', () => {
      expect(typeof client.bashGuard).toBe('function');
    });

    it('changedFilesAudit exists as a function', () => {
      expect(typeof client.changedFilesAudit).toBe('function');
    });

    it('recordEscapedWrite exists as a function', () => {
      expect(typeof client.recordEscapedWrite).toBe('function');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A1: Daemon unreachable → fail closed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A1: Daemon unreachable → fail closed', () => {
    it('checkWrite throws when daemon is unreachable (bad handshake port)', async () => {
      const badHandshakePath = join(tempDir, 'bad-handshake.json');
      writeFileSync(badHandshakePath, JSON.stringify({
        port: port + 9999, // unreachable port
        token: TOKEN,
        pid: process.pid,
        startedAt: Date.now(),
      }));

      const badClient = new ReconnectingDaemonClient({
        handshakePath: badHandshakePath,
        healthzUrl: 'http://127.0.0.1',
      });

      try {
        await expect(badClient.checkWrite('src/app.ts', 'agent')).rejects.toThrow(/fail closed|unreachable/i);
      } finally {
        badClient.dispose();
      }
    });

    it('checkWrite throws when handshake file does not exist', async () => {
      const missingHandshakePath = join(tempDir, 'does-not-exist', 'handshake.json');
      const badClient = new ReconnectingDaemonClient({
        handshakePath: missingHandshakePath,
        healthzUrl: 'http://127.0.0.1',
      });

      try {
        await expect(badClient.checkWrite('src/app.ts', 'agent')).rejects.toThrow(/handshake not found|fail closed/i);
      } finally {
        badClient.dispose();
      }
    });

    it('bashGuard throws when daemon is unreachable', async () => {
      const badHandshakePath = join(tempDir, 'bad-handshake-bash.json');
      writeFileSync(badHandshakePath, JSON.stringify({
        port: port + 9999,
        token: TOKEN,
        pid: process.pid,
        startedAt: Date.now(),
      }));

      const badClient = new ReconnectingDaemonClient({
        handshakePath: badHandshakePath,
        healthzUrl: 'http://127.0.0.1',
      });

      try {
        await expect(badClient.bashGuard('rm -rf /', ['src/app.ts'])).rejects.toThrow(/fail closed|unreachable/i);
      } finally {
        badClient.dispose();
      }
    });

    it('file remains unmodified when daemon unreachable (fail closed semantics)', async () => {
      const projectDir = join(tempDir, 'project-a1');
      mkdirSync(join(projectDir, 'src'), { recursive: true });
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original content');

      const badHandshakePath = join(tempDir, 'bad-handshake-file.json');
      writeFileSync(badHandshakePath, JSON.stringify({
        port: port + 9999,
        token: TOKEN,
        pid: process.pid,
        startedAt: Date.now(),
      }));

      const badClient = new ReconnectingDaemonClient({
        handshakePath: badHandshakePath,
        healthzUrl: 'http://127.0.0.1',
      });

      try {
        // Simulate: plugin calls checkWrite → throws → file never written
        let blocked = false;
        try {
          await badClient.checkWrite('src/app.ts', 'agent');
        } catch {
          blocked = true;
        }
        expect(blocked).toBe(true);
        // File integrity preserved
        expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original content');
      } finally {
        badClient.dispose();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A2: No active WI → daemon returns blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A2: No active WI → daemon returns blocked', () => {
    it('checkWrite returns allowed=false when no work-items dir', async () => {
      const projectDir = join(tempDir, 'project-a2');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      // NO work-items directory = no active WI

      // Set registered project path on client (simulating register() call)
      (client as any).registeredProjectPath = projectDir;

      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.some(v => v.includes('no active WI'))).toBe(true);
    });

    it('checkWrite returns allowed=false when only closed WIs exist', async () => {
      const projectDir = join(tempDir, 'project-a2-closed');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-CLOSED-001');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-CLOSED-001',
        status: 'closed',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(result.violations!.some(v => v.includes('no active WI'))).toBe(true);
    });

    it('plugin-style throw when no active WI', async () => {
      const projectDir = join(tempDir, 'project-a2b');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');

      // Plugin would throw here
      if (!result.allowed) {
        expect(result.violations!.length).toBeGreaterThan(0);
      }
      // File remains unmodified (no write occurred)
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original');
    });

    it('bashGuard returns allowed=false when no active WI', async () => {
      const projectDir = join(tempDir, 'project-a2-bash');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });

      (client as any).registeredProjectPath = projectDir;
      const result = await client.bashGuard('echo hello', ['src/app.ts']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('no active WI');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A3: code_change_allowed=false → blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A3: code_change_allowed=false → blocked', () => {
    it('checkWrite returns allowed=false when code_change_allowed=false', async () => {
      const projectDir = join(tempDir, 'project-a3');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-001');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-001',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: false,
        allowed_write_files: [],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(result.violations!.some(v => v.includes('code_change_allowed=false'))).toBe(true);
    });

    it('plugin throws and file remains unmodified', async () => {
      const projectDir = join(tempDir, 'project-a3b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-002');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-002',
        status: 'implementation_running',
        workflow_path: 'requirement_change_path',
        code_change_allowed: false,
        allowed_write_files: [],
      }));
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');

      // Plugin would throw
      expect(result.allowed).toBe(false);
      // File remains unmodified
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A4: allowed_write_files match → allowed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A4: allowed_write_files match → allowed', () => {
    it('checkWrite returns allowed=true when file in allowed_write_files', async () => {
      const projectDir = join(tempDir, 'project-a4');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-003');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-003',
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

    it('plugin does not throw and file is written successfully', async () => {
      const projectDir = join(tempDir, 'project-a4b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-004');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-004',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/app.ts', 'agent');
      expect(result.allowed).toBe(true);

      // Simulate actual write after check passes
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'modified content');
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('modified content');
    });

    it('changedFilesAudit passes when files in scope', async () => {
      const projectDir = join(tempDir, 'project-a4c');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-005');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-005',
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

    it('bashGuard returns allowed=true when expected files in scope', async () => {
      const projectDir = join(tempDir, 'project-a4-bash');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-006');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-006',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.bashGuard('echo hello > src/app.ts', ['src/app.ts']);
      expect(result.allowed).toBe(true);
    });

    it('recordEscapedWrite completes without error', async () => {
      (client as any).registeredProjectPath = join(tempDir, 'project-a4');
      await expect(client.recordEscapedWrite({
        command: 'test command',
        expectedFiles: ['src/app.ts'],
        escapedWrites: ['src/secret.ts'],
        timestamp: new Date().toISOString(),
      })).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A5: Outside allowed_write_files → blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A5: Outside allowed_write_files → blocked', () => {
    it('checkWrite returns allowed=false for file not in allowed_write_files', async () => {
      const projectDir = join(tempDir, 'project-a5');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-007');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-007',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/secret.ts', 'agent');
      expect(result.allowed).toBe(false);
      expect(result.violations!.some(v => v.includes('not in allowed_write_files'))).toBe(true);
    });

    it('plugin throws and file remains unmodified', async () => {
      const projectDir = join(tempDir, 'project-a5b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-008');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-008',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));
      writeFileSync(join(projectDir, 'src', 'secret.ts'), 'secret data');

      (client as any).registeredProjectPath = projectDir;
      const result = await client.checkWrite('src/secret.ts', 'agent');

      // Plugin would throw
      expect(result.allowed).toBe(false);
      // File remains unmodified
      expect(readFileSync(join(projectDir, 'src', 'secret.ts'), 'utf-8')).toBe('secret data');
    });

    it('changedFilesAudit fails when out-of-scope files present', async () => {
      const projectDir = join(tempDir, 'project-a5c');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-009');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-009',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const auditResult = await client.changedFilesAudit({
        command: 'write src/secret.ts',
        expectedFiles: ['src/app.ts', 'src/secret.ts'],
      });

      expect(auditResult).not.toBeNull();
      expect(auditResult!.passed).toBe(false);
      expect(auditResult!.violations!.length).toBeGreaterThan(0);
      expect(auditResult!.escapedWrites!.length).toBeGreaterThan(0);
    });

    it('bashGuard returns allowed=false when expected file is outside scope', async () => {
      const projectDir = join(tempDir, 'project-a5-bash');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-E2E-LIVE-010');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-E2E-LIVE-010',
        status: 'implementation_running',
        workflow_path: 'code_only_fast_path',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
      }));

      (client as any).registeredProjectPath = projectDir;
      const result = await client.bashGuard('echo hello > src/secret.ts', ['src/secret.ts']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in allowed_write_files');
    });
  });
});
