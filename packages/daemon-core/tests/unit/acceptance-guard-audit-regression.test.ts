import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { checkNativeTool } from '../../src/tools/lib/native-write-boundary';
import { CONTROLLED_HTTP_TOOLS } from '../../src/tools/lib/controlled-http-tools';
import { bindWriteGuardAudit, inspectWriteGuardAuditBinding, inspectClosedWriteGuardAudit } from '../../src/tools/lib/write-guard-audit-binding';
import { runCloseGate } from '../../src/tools/lib/close-gate';
import { evaluateVerificationGovernanceContract } from '../../src/tools/lib/verification-governance-contract';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-changed-files-audit';
import '../../src/tools/handlers/sf-hard-stop-resolve';

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'sf-acceptance-repair-')); roots.push(root);
  const wi = path.join(root, '.specforge/work-items/WI-0001'); fs.mkdirSync(wi, { recursive: true });
  fs.writeFileSync(path.join(wi, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: true,
    code_permission_revoked: false, allowed_write_files: [{ path: 'app.js', operation: 'create' }] }));
  return { root, wi };
}
const audit = '# Changed Files Audit\nContract: changed-files-audit/v1\nWork Item: WI-0001\n## Result: PASS\n- Out of scope: 0\n- Violations: 0\n- Blocked write attempts: 0\n';
function decision(wi: string, allowed: boolean, file = 'sentinel.txt', timestamp = '2026-10-17T08:06:01.125Z') {
  fs.appendFileSync(path.join(wi, 'write_guard_log.jsonl'), JSON.stringify({ timestamp, path: file, operation: 'create', actor: 'agent', tool: 'write', allowed, violations: allowed ? [] : ['outside permitted scope'] }) + '\n');
}

describe('acceptance-discovered guard and audit gaps', () => {
  it('allows the exact official initialization tool through the real HTTP guard, then initializes idempotently', async () => {
    const { root } = fixture(); const server = new HTTPServer(new DaemonConfig([])); server.setToken('test-token');
    const { port } = await server.start();
    const post = async (route: string, body: unknown) => fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const guard = await post('/api/v1/v11/write-guard/native', { projectPath: root, tool: 'sf_project_init', args: {} });
      expect((await guard.json() as any).data.allowed).toBe(true);
      const target = CONTROLLED_HTTP_TOOLS.sf_project_init.path;
      expect((await (await post(target, { projectPath: root })).json() as any).success).toBe(true);
      const config = fs.readFileSync(path.join(root, '.specforge/config/project.json'), 'utf8');
      expect((await (await post(target, { projectPath: root })).json() as any).success).toBe(true);
      expect(fs.readFileSync(path.join(root, '.specforge/config/project.json'), 'utf8')).toBe(config);
      for (const name of ['sf_project_init_fake', 'sf_unknown', 'constructor', 'bash']) expect((await checkNativeTool({}, root, name, {})).allowed).toBe(false);
    } finally { await server.stop(); }
  });

  it('invalidates an earlier PASS after a native denial in both verification and close', async () => {
    const { root, wi } = fixture(); decision(wi, true, 'app.js');
    fs.writeFileSync(path.join(wi, 'changed_files_audit.md'), bindWriteGuardAudit(audit, root, wi));
    expect(inspectWriteGuardAuditBinding(root, wi, fs.readFileSync(path.join(wi, 'changed_files_audit.md'), 'utf8')).passed).toBe(true);
    decision(wi, false);
    const verification = await evaluateVerificationGovernanceContract({ workItemDir: wi, workItemId: 'WI-0001' });
    expect(verification.checks.find(c => c.check_id === 'verification_write_guard_audit_current')?.passed).toBe(false);
    const close = await runCloseGate({ projectRoot: root, workItemDir: wi, workItemId: 'WI-0001' });
    expect(close.report.checks.find(c => c.check_id === 'close_write_guard_audit_current')?.passed).toBe(false);
    expect(fs.existsSync(path.join(root, 'sentinel.txt'))).toBe(false);
  });

  it('uses the audit owner and existing recovery owner to retain and resolve a denied probe without expanding permissions', async () => {
    const { root, wi } = fixture(); decision(wi, true, 'app.js'); decision(wi, false);
    const before = fs.readFileSync(path.join(wi, 'write_guard_log.jsonl'), 'utf8');
    const context = { directory: root, agent: 'sf-orchestrator' };
    const run = () => getHandler('sf_changed_files_audit')!({ work_item_id: 'WI-0001' }, context, {} as any) as Promise<any>;
    const denied = await run(); expect(denied.passed).toBe(false); expect(denied.unresolved_blocked_write_attempts).toBe(1);
    expect(fs.existsSync(path.join(wi, 'hard_stop.json'))).toBe(true);
    const recovery: any = await getHandler('sf_hard_stop_resolve')!({ work_item_id: 'WI-0001', resolution_type: 'prohibited_action_replaced', reason: 'Expected sentinel probe was denied before writing. Abandon sentinel.txt write.',
      evidence: ['write_guard_log.jsonl: sentinel.txt denied; unchanged protected fixture'], blocked_action_disposition: 'abandon', retry_original_action: false,
      safe_alternative_tool: 'sf_changed_files_audit', allowed_next_action: 'rerun audit without sentinel write', resume_from_step: 'audit' }, context, {} as any);
    expect(recovery.success, JSON.stringify(recovery)).toBe(true);
    const resolved = await run(); expect(resolved.passed, JSON.stringify(resolved)).toBe(true);
    expect(resolved.blocked_write_attempts).toBeGreaterThanOrEqual(1); expect(resolved.unresolved_blocked_write_attempts).toBe(0);
    expect(fs.readFileSync(path.join(wi, 'write_guard_log.jsonl'), 'utf8')).toBe(before);
    const text = fs.readFileSync(path.join(wi, 'changed_files_audit.md'), 'utf8');
    expect(text).toContain('sentinel.txt'); expect(inspectWriteGuardAuditBinding(root, wi, text).passed).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(wi, 'work_item.json'), 'utf8')).allowed_write_files).toEqual([{ path: 'app.js', operation: 'create' }]);
    const resolutions = fs.readFileSync(path.join(wi, 'hard_stop_resolution.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    decision(wi, false, 'sentinel.txt', new Date(Date.parse(resolutions.at(-1).resolved_at) + 1).toISOString());
    const newDenial = await run();
    expect(newDenial.passed).toBe(false);
    expect(newDenial.unresolved_blocked_write_attempts).toBe(1);
    expect(newDenial.hard_stop).toBe(true);
  });

  it('fails closed on corrupt logs, changed sources during production and deleted evidence', () => {
    const { root, wi } = fixture(); decision(wi, true, 'app.js');
    const text = bindWriteGuardAudit(audit, root, wi);
    fs.writeFileSync(path.join(wi, 'write_guard_log.jsonl'), '{bad');
    expect(inspectWriteGuardAuditBinding(root, wi, text).passed).toBe(false);
    expect(() => bindWriteGuardAudit(audit, root, wi)).toThrow();
    fs.unlinkSync(path.join(wi, 'write_guard_log.jsonl'));
    expect(inspectWriteGuardAuditBinding(root, wi, text).passed).toBe(false);
    expect(() => bindWriteGuardAudit(audit, root, wi, '0'.repeat(64))).toThrow('SOURCE_CHANGED');
  });

  it('proves historical omission at the original close time without counting post-close probes or mere missing new fields', () => {
    const { wi } = fixture(); fs.writeFileSync(path.join(wi, 'changed_files_audit.md'), audit);
    decision(wi, false, 'later.txt', '2026-10-17T08:25:00.000Z');
    expect(inspectClosedWriteGuardAudit(wi, '2026-10-17T08:24:00.000Z')).toBeNull();
    decision(wi, false);
    expect(inspectClosedWriteGuardAudit(wi, '2026-10-17T08:24:00.000Z')?.reason).toContain('factual=1');
    expect(inspectClosedWriteGuardAudit(wi, null)).toBeNull();
  });
});
