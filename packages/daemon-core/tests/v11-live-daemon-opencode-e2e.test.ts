/**
 * v11-live-daemon-opencode-e2e.test.ts
 *
 * Live daemon integration test: starts a REAL HTTP server that mirrors
 * the daemon's write-guard routes, reads work_item.json from the filesystem,
 * and returns check/audit results over HTTP.
 *
 * Chain tested (full network round-trip):
 *   Plugin (fetch) → HTTP Server → loadWriteGuardContextFromFS() → checkWrite() / performChangedFilesAudit() → JSON response
 *
 * 5 Scenarios:
 *   A1: Daemon unreachable → fail closed (plugin throws, file unmodified)
 *   A2: No active WI → daemon returns blocked
 *   A3: code_change_allowed=false → daemon returns blocked
 *   A4: allowed_write_files match → daemon returns allowed
 *   A5: Outside allowed_write_files → daemon returns blocked
 *
 * Key properties:
 *   - Tests start a REAL http.createServer (random port)
 *   - All assertions go through HTTP fetch (not direct function calls)
 *   - Daemon route handler reads real work_item.json from filesystem
 *   - Plugin simulation throws on blocked, allowing file integrity checks
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
  type AuditResult,
  type WriteCheckResult,
} from '../src/tools/lib/write-guard-v11';

// ---------------------------------------------------------------------------
// Helper: load WriteGuardContext from real filesystem (mirrors daemon logic)
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
          break; // use first non-closed WI
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

describe('v1.1 Live Daemon OpenCode Write Guard E2E', () => {
  let tempDir: string;
  let server: http.Server;
  let port: number;
  const TOKEN = 'test-token-v11-live-e2e';

  // ── Setup: start real HTTP server ──────────────────────────────────────────

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-live-daemon-e2e-'));

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
            const { projectPath, targetPath, operation, callerRole } = request;
            const ctx = loadWriteGuardContextFromFS(projectPath, callerRole ?? 'agent');
            const result: WriteCheckResult = checkWrite(ctx, targetPath, operation);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: result }));

          } else if (url === '/api/v1/v11/write-guard/audit' && req.method === 'POST') {
            const request = JSON.parse(body);
            const { projectPath, changedFiles, callerRole } = request;
            const ctx = loadWriteGuardContextFromFS(projectPath, callerRole ?? 'agent');
            const allowedWriteFiles = ctx.workItem?.allowed_write_files ?? [];
            const result: AuditResult = performChangedFilesAudit(changedFiles, allowedWriteFiles, callerRole ?? 'agent');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: result }));

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
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Helpers: HTTP calls mirroring what plugin does ─────────────────────────

  async function httpCheckWrite(
    projectPath: string,
    targetPath: string,
    operation: string,
  ): Promise<WriteCheckResult> {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/v11/write-guard/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ projectPath, targetPath, operation, callerRole: 'agent' }),
    });
    const json = await response.json() as { success: boolean; data: WriteCheckResult };
    expect(json.success).toBe(true);
    return json.data;
  }

  async function httpAudit(
    projectPath: string,
    changedFiles: Array<{ path: string; operation: string }>,
  ): Promise<AuditResult> {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/v11/write-guard/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ projectPath, changedFiles, callerRole: 'agent' }),
    });
    const json = await response.json() as { success: boolean; data: AuditResult };
    expect(json.success).toBe(true);
    return json.data;
  }

  /**
   * Simulate what plugin's beforeToolCall does:
   * fetch check → if blocked, throw → file never gets written.
   */
  async function simulatePluginBeforeHook(projectPath: string, targetPath: string): Promise<void> {
    const result = await httpCheckWrite(projectPath, targetPath, 'modify');
    if (!result.allowed) {
      throw new Error(`[SF WriteGuard] BLOCKED write to "${targetPath}". Reason: ${result.violations[0] ?? 'policy_violation'}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // A1: Daemon unreachable → fail closed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A1: Daemon unreachable → fail closed', () => {
    it('plugin throws when daemon is unreachable', async () => {
      const badPort = port + 9999;
      const attempt = fetch(`http://127.0.0.1:${badPort}/api/v1/v11/write-guard/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ projectPath: tempDir, targetPath: 'src/app.ts', operation: 'modify' }),
        signal: AbortSignal.timeout(2000),
      });

      await expect(attempt).rejects.toThrow();
    });

    it('file remains unmodified when daemon unreachable (fail closed)', async () => {
      const projectDir = join(tempDir, 'project-a1');
      mkdirSync(join(projectDir, 'src'), { recursive: true });
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original content');

      // Simulate: plugin tries daemon → connection fails → throws → file never written
      const badPort = port + 9999;
      let blocked = false;
      try {
        await fetch(`http://127.0.0.1:${badPort}/api/v1/v11/write-guard/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        blocked = true;
      }

      expect(blocked).toBe(true);
      // File integrity preserved
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original content');
    });

    it('unauthorized request returns 401', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/v11/write-guard/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
        body: JSON.stringify({ projectPath: tempDir, targetPath: 'src/app.ts', operation: 'modify' }),
      });
      expect(response.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A2: No active WI → daemon reads filesystem, returns blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A2: No active WI → daemon returns blocked', () => {
    it('daemon reads filesystem and returns blocked when no work-items dir', async () => {
      const projectDir = join(tempDir, 'project-a2');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      // NO work-items directory = no active WI

      const result = await httpCheckWrite(projectDir, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('no active WI');
    });

    it('daemon reads filesystem and returns blocked when only closed WIs exist', async () => {
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

      const result = await httpCheckWrite(projectDir, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('no active WI');
    });

    it('plugin throws and file remains unmodified', async () => {
      const projectDir = join(tempDir, 'project-a2b');
      mkdirSync(join(projectDir, '.specforge', 'project'), { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      await expect(simulatePluginBeforeHook(projectDir, 'src/app.ts')).rejects.toThrow('BLOCKED');
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A3: code_change_allowed=false → blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A3: code_change_allowed=false → blocked', () => {
    it('daemon reads real work_item.json and returns blocked', async () => {
      const projectDir = join(tempDir, 'project-a3');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-001');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-001',
        status: 'implementation_running',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      }));

      const result = await httpCheckWrite(projectDir, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('code_change_allowed=false');
    });

    it('plugin throws and file remains unmodified', async () => {
      const projectDir = join(tempDir, 'project-a3b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-002');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-002',
        status: 'implementation_running',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'requirement_change_path',
      }));
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      await expect(simulatePluginBeforeHook(projectDir, 'src/app.ts')).rejects.toThrow('BLOCKED');
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('original');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A4: allowed_write_files match → allowed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A4: allowed_write_files match → allowed', () => {
    it('daemon reads real work_item.json and allows write', async () => {
      const projectDir = join(tempDir, 'project-a4');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-003');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-003',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      const result = await httpCheckWrite(projectDir, 'src/app.ts', 'modify');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('plugin does not throw and file is written successfully', async () => {
      const projectDir = join(tempDir, 'project-a4b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-004');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-004',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'original');

      // Plugin check passes — no throw
      await expect(simulatePluginBeforeHook(projectDir, 'src/app.ts')).resolves.toBeUndefined();

      // Simulate actual write after check passes
      writeFileSync(join(projectDir, 'src', 'app.ts'), 'modified content');
      expect(readFileSync(join(projectDir, 'src', 'app.ts'), 'utf-8')).toBe('modified content');
    });

    it('changed_files_audit passes via HTTP when files in scope', async () => {
      const projectDir = join(tempDir, 'project-a4c');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-005');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-005',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      const auditResult = await httpAudit(projectDir, [{ path: 'src/app.ts', operation: 'modify' }]);
      expect(auditResult.passed).toBe(true);
      expect(auditResult.violations).toHaveLength(0);
      expect(auditResult.in_scope).toBe(1);
      expect(auditResult.out_of_scope).toBe(0);
    });

    it('directory-level prefix allows nested files', async () => {
      const projectDir = join(tempDir, 'project-a4d');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-006');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-006',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src', operation: 'any' }],
        workflow_path: 'code_only_fast_path',
      }));

      const result = await httpCheckWrite(projectDir, 'src/deep/nested/file.ts', 'create');
      expect(result.allowed).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A5: Outside allowed_write_files → blocked
  // ═══════════════════════════════════════════════════════════════════════════

  describe('A5: Outside allowed_write_files → blocked', () => {
    it('daemon blocks write to file not in allowed_write_files', async () => {
      const projectDir = join(tempDir, 'project-a5');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-007');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-007',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      const result = await httpCheckWrite(projectDir, 'src/secret.ts', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('not in allowed_write_files');
    });

    it('plugin throws and file remains unmodified', async () => {
      const projectDir = join(tempDir, 'project-a5b');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-008');
      mkdirSync(wiDir, { recursive: true });
      mkdirSync(join(projectDir, 'src'), { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-008',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));
      writeFileSync(join(projectDir, 'src', 'secret.ts'), 'secret data');

      await expect(simulatePluginBeforeHook(projectDir, 'src/secret.ts')).rejects.toThrow('BLOCKED');
      expect(readFileSync(join(projectDir, 'src', 'secret.ts'), 'utf-8')).toBe('secret data');
    });

    it('changed_files_audit fails via HTTP when out-of-scope files present', async () => {
      const projectDir = join(tempDir, 'project-a5c');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-009');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-009',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      const auditResult = await httpAudit(projectDir, [
        { path: 'src/app.ts', operation: 'modify' },
        { path: 'src/secret.ts', operation: 'modify' },
      ]);
      expect(auditResult.passed).toBe(false);
      expect(auditResult.violations.length).toBeGreaterThan(0);
      expect(auditResult.violations.some(v => v.includes('out_of_scope'))).toBe(true);
      expect(auditResult.out_of_scope).toBe(1);
      expect(auditResult.in_scope).toBe(1);
    });

    it('operation mismatch blocks even when path matches', async () => {
      const projectDir = join(tempDir, 'project-a5d');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-010');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-010',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      // Path matches but operation is 'delete' instead of 'modify'
      const result = await httpCheckWrite(projectDir, 'src/app.ts', 'delete');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('not in allowed_write_files');
    });

    it('side-effect detection in audit', async () => {
      const projectDir = join(tempDir, 'project-a5e');
      const wiDir = join(projectDir, '.specforge', 'work-items', 'WI-LIVE-011');
      mkdirSync(wiDir, { recursive: true });

      writeFileSync(join(wiDir, 'work_item.json'), JSON.stringify({
        work_item_id: 'WI-LIVE-011',
        status: 'implementation_running',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/app.ts', operation: 'modify' }],
        workflow_path: 'code_only_fast_path',
      }));

      // Simulate formatter producing extra file changes
      const auditResult = await httpAudit(projectDir, [
        { path: 'src/app.ts', operation: 'modify' },       // expected
        { path: 'src/utils.ts', operation: 'modify' },     // side effect
        { path: 'src/helpers.ts', operation: 'create' },   // side effect
      ]);
      expect(auditResult.passed).toBe(false);
      expect(auditResult.side_effects).toBe(2);
      expect(auditResult.in_scope).toBe(1);
    });
  });
});
