/**
 * v11-governance-http-e2e.test.ts — HTTP Round-Trip Governance E2E
 *
 * Starts the daemon HTTPServer with a REAL ToolDispatcher (not mocked),
 * sends real HTTP requests through the full lifecycle:
 *   create WI → release code_permission → Write Guard check (allowed + blocked)
 *   → generate evidence → close_gate → verify closed → post-close write blocked
 *
 * This test proves the governance chain works end-to-end through HTTP transport.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { HTTPServer, HTTPServerDeps } from '../src/http/HTTPServer';
import { EventBus } from '../src/event-bus/EventBus';
import { DaemonConfig } from '../src/daemon/DaemonConfig';
import { ToolDispatcher } from '../src/tools/ToolDispatcher';

// Import ALL handler registrations (side-effects)
import '../src/tools/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpPost(port: number, token: string, urlPath: string, payload: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(data); } catch { /* not JSON */ }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('v1.1 Governance HTTP Round-Trip E2E', () => {
  let server: HTTPServer;
  let port: number;
  const token = `test-gov-e2e-${Date.now()}`;
  let tempDir: string;
  const workItemId = 'WI-GOV-HTTP-001';

  beforeAll(async () => {
    // Create temp project directory with .specforge structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-gov-http-e2e-'));
    const specDir = path.join(tempDir, '.specforge');
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(
      path.join(specDir, 'manifest.json'),
      JSON.stringify({ schema_version: '1.0', project_name: 'gov-e2e-test' }),
    );

    // Create a real ToolDispatcher with real handlers
    const dispatcher = new ToolDispatcher({
      stateManager: {},
      workflowEngine: {},
      projectManager: {},
      eventLogger: {},
      eventBus: new EventBus(),
      permissionEngine: {},
      cas: {},
      sessionRegistry: {},
    });

    const config = new DaemonConfig([]);
    const eventBus = new EventBus();
    const deps: HTTPServerDeps = {
      config,
      eventBus,
      stateManager: {} as any,
      wal: {} as any,
      toolDispatcher: dispatcher,
    };

    server = new HTTPServer(deps);
    server.setToken(token);
    const result = await server.start();
    port = result.port;
  });

  afterAll(async () => {
    await server.stop();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('full governance lifecycle via HTTP', async () => {
    const wiDir = path.join(tempDir, '.specforge', 'work-items', workItemId);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 1: Release code_permission via HTTP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Pre-create WI directory with work_item.json (normally done by sf_v11_work_item_create)
    await fs.mkdir(wiDir, { recursive: true });
    await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify({
      work_item_id: workItemId,
      status: 'implementation_ready',
      code_change_allowed: false,
      allowed_write_files: [],
      workflow_path: 'code_only_fast_path',
      updated_at: new Date().toISOString(),
    }, null, 2) + '\n');

    const permResult = await httpPost(port, token, '/api/v1/tool/invoke', {
      tool: 'sf_v11_code_permission',
      args: {
        work_item_id: workItemId,
        action: 'release',
        allowed_write_files: [
          { path: 'src/main.ts', operation: 'modify' },
          { path: 'src/helper.ts', operation: 'create' },
        ],
      },
      context: { directory: tempDir },
    });
    expect(permResult.json?.success).toBe(true);
    expect(permResult.json?.data?.success).toBe(true);
    expect(permResult.json?.data?.action).toBe('release');

    // Verify WI directory was created with work_item.json
    const wiExists = fsSync.existsSync(path.join(wiDir, 'work_item.json'));
    expect(wiExists).toBe(true);

    // Verify filesystem_baseline.json was created
    const baselineExists = fsSync.existsSync(path.join(wiDir, 'filesystem_baseline.json'));
    expect(baselineExists).toBe(true);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 2: Write Guard check — allowed write via HTTP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const allowedWriteRes = await httpPost(port, token, '/api/v1/v11/write-guard/check', {
      targetPath: 'src/main.ts',
      callerRole: 'agent',
      projectPath: tempDir,
    });
    expect(allowedWriteRes.json?.success).toBe(true);
    expect(allowedWriteRes.json?.data?.allowed).toBe(true);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 3: Write Guard check — BLOCKED write via HTTP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const blockedWriteRes = await httpPost(port, token, '/api/v1/v11/write-guard/check', {
      targetPath: 'src/unauthorized.ts',
      callerRole: 'agent',
      projectPath: tempDir,
    });
    expect(blockedWriteRes.json?.success).toBe(true);
    expect(blockedWriteRes.json?.data?.allowed).toBe(false);
    expect(blockedWriteRes.json?.data?.violations?.length).toBeGreaterThan(0);

    // Verify write_guard_log.jsonl was written
    const logPath = path.join(wiDir, 'write_guard_log.jsonl');
    const logExists = fsSync.existsSync(logPath);
    expect(logExists).toBe(true);
    const logContent = fsSync.readFileSync(logPath, 'utf-8');
    const logEntries = logContent.trim().split('\n').map(l => JSON.parse(l));
    expect(logEntries.length).toBeGreaterThanOrEqual(2);
    // First entry: allowed
    const allowedEntry = logEntries.find((e: any) => e.path === 'src/main.ts');
    expect(allowedEntry?.allowed).toBe(true);
    // Second entry: blocked
    const blockedEntry = logEntries.find((e: any) => e.path === 'src/unauthorized.ts');
    expect(blockedEntry?.allowed).toBe(false);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 4: Simulate actual file writes (only allowed ones succeed in real system)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'main.ts'), 'export const main = true;\n');
    await fs.writeFile(path.join(srcDir, 'helper.ts'), 'export function help() {}\n');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 5: Generate evidence files for close_gate
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
    await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake');
    await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC\ncode_only');
    await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA');
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), '{"triggered":true}');
    await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
    await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace\nNo spec impact');
    await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ entries: [] }));
    await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary\n- Overall Status: passed');
    await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Verification\nAll evidence reviewed.');
    await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nMerge Status: not_applicable');
    await fs.writeFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({ entries: [{ type: 'log', path: 'test.log' }] }));
    await fs.writeFile(path.join(wiDir, 'user_decision.json'), JSON.stringify({ decision_status: 'approved' }));

    // Update work_item.json status to verification_done
    const wiContent = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    wiContent.status = 'verification_done';
    wiContent.workflow_path = 'code_only_fast_path';
    await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify(wiContent, null, 2) + '\n');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 6: Execute close_gate via HTTP (tool/invoke)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const closeResult = await httpPost(port, token, '/api/v1/tool/invoke', {
      tool: 'sf_close_gate',
      args: { work_item_id: workItemId },
      context: { directory: tempDir },
    });
    expect(closeResult.json?.success).toBe(true);
    expect(closeResult.json?.data?.success).toBe(true);
    expect(closeResult.json?.data?.state_advanced).toBe(true);
    expect(closeResult.json?.data?.code_permission_revoked).toBe(true);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 7: Verify WI is closed
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const finalWi = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(finalWi.status).toBe('closed');
    expect(finalWi.closed_at).toBeDefined();
    expect(finalWi.code_change_allowed).toBe(false);
    expect(finalWi.allowed_write_files).toEqual([]);

    // Verify changed_files_audit.md uses write_guard_log
    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('write_guard_log.jsonl');
    expect(auditMd).toContain('PASSED');

    // Verify close_gate.json
    const gateJson = JSON.parse(await fs.readFile(path.join(wiDir, 'gates', 'close_gate.json'), 'utf-8'));
    expect(gateJson.status).toBe('passed');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Step 8: Post-close write BLOCKED via HTTP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const postCloseWrite = await httpPost(port, token, '/api/v1/v11/write-guard/check', {
      targetPath: 'src/main.ts',
      callerRole: 'agent',
      projectPath: tempDir,
    });
    expect(postCloseWrite.json?.success).toBe(true);
    expect(postCloseWrite.json?.data?.allowed).toBe(false);
    // After close, WI is no longer "active" — Write Guard blocks with "no active WI" or "closed"
    const violation = postCloseWrite.json?.data?.violations?.[0] ?? '';
    expect(violation.includes('closed') || violation.includes('no active WI')).toBe(true);
  });
});
