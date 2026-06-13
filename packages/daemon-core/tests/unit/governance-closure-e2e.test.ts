/**
 * governance-closure-e2e.test.ts — WI 完整生命周期关闭治理验收测试
 *
 * 覆盖：
 * A. seal transition 拦截
 * B. close_gate happy path
 * C. close_gate negative tests
 * D. changed_files_audit 真实性验证
 * E. closed 后写入阻断
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import handler registration (side-effects)
import '../../src/tools/handlers/sf-state-transition.js';
import '../../src/tools/handlers/sf-v11-close-gate.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';
import { checkWrite, type WriteGuardContext } from '../../src/tools/lib/write-guard-v11.js';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';
import { isSealTransition, getSealTransition } from '@specforge/types/seal-transitions';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

async function createFullWorkItem(
  projectRoot: string,
  workItemId: string,
  opts?: {
    status?: string;
    codeChangeAllowed?: boolean;
    allowedWriteFiles?: Array<{ path: string; operation: string }>;
    workflowPath?: string;
    actualChangedFiles?: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
    writeGuardViolations?: string[];
    skipFiles?: string[];
    userDecisionStatus?: string;
  },
): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  const workItem: Record<string, unknown> = {
    work_item_id: workItemId,
    status: opts?.status ?? 'verification_done',
    code_change_allowed: opts?.codeChangeAllowed ?? false,
    allowed_write_files: opts?.allowedWriteFiles ?? [],
    workflow_path: opts?.workflowPath ?? 'code_only_fast_path',
    actual_changed_files: opts?.actualChangedFiles ?? [
      { path: 'src/main.ts', operation: 'modify' },
      { path: 'src/utils.ts', operation: 'create' },
    ],
    updated_at: new Date().toISOString(),
  };
  if (opts?.writeGuardViolations) {
    workItem['write_guard_violations'] = opts.writeGuardViolations;
  }
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(workItem, null, 2) + '\n',
  );

  const skip = new Set(opts?.skipFiles ?? []);

  if (!skip.has('intake.md'))
    await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nMinimal WI intake.');
  if (!skip.has('change_classification.md'))
    await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC\ncode_only');
  if (!skip.has('impact_analysis.md'))
    await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA\nLow impact');
  if (!skip.has('trigger_result.json'))
    await fs.writeFile(path.join(wiDir, 'trigger_result.json'), JSON.stringify({ work_item_id: workItemId, workflow_path: opts?.workflowPath ?? 'code_only_fast_path', triggered: true }));
  if (!skip.has('tasks.md'))
    await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
  if (!skip.has('trace_delta.md'))
    await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace Delta\nNo spec impact (§13.2)');
  if (!skip.has('candidate_manifest.json'))
    await fs.writeFile(
      path.join(wiDir, 'candidate_manifest.json'),
      JSON.stringify({ work_item_id: workItemId, entries: [], schema_version: '1.0', workflow_path: opts?.workflowPath ?? 'code_only_fast_path' }),
    );
  if (!skip.has('gate_summary.md'))
    await fs.writeFile(
      path.join(wiDir, 'gate_summary.md'),
      '# Gate Summary\n\n- Overall Status: passed\n',
    );
  if (!skip.has('verification_report.md'))
    await fs.writeFile(
      path.join(wiDir, 'verification_report.md'),
      '# Verification Report\n\nAll evidence checks pass. Evidence: evidence_manifest.json reviewed.',
    );
  if (!skip.has('merge_report.md'))
    await fs.writeFile(
      path.join(wiDir, 'merge_report.md'),
      '# Merge Report\n\nMerge Status: not_applicable\ncode_only_fast_path — no spec merge required.',
    );
  if (!skip.has('changed_files_audit.md'))
    await fs.writeFile(
      path.join(wiDir, 'changed_files_audit.md'),
      '# Changed Files Audit\n\n- Status: PASSED\n- Data Source: work_item.actual_changed_files\n\nAll files in scope.',
    );
  if (!skip.has('evidence/evidence_manifest.json'))
    await fs.writeFile(
      path.join(wiDir, 'evidence', 'evidence_manifest.json'),
      JSON.stringify({ work_item_id: workItemId, entries: [{ type: 'test_log', path: 'evidence/test.log', timestamp: new Date().toISOString() }] }),
    );
  if (!skip.has('user_decision.json'))
    await fs.writeFile(
      path.join(wiDir, 'user_decision.json'),
      JSON.stringify({ decision_status: opts?.userDecisionStatus ?? 'approved', timestamp: new Date().toISOString() }),
    );

  return wiDir;
}

// Also create manifest.json for sf_state_transition to work
async function createManifest(projectRoot: string): Promise<void> {
  const specDir = path.join(projectRoot, '.specforge');
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(
    path.join(specDir, 'manifest.json'),
    JSON.stringify({ schema_version: '1.0', project_name: 'test' }),
  );
}

// ---------------------------------------------------------------------------
// A. Seal Transition Enforcement
// ---------------------------------------------------------------------------

describe('A. Seal Transition enforcement', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-seal-'));
    await createManifest(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('verification_done → closed is a seal transition', () => {
    expect(isSealTransition('verification_done', 'closed')).toBe(true);
  });

  it('seal transition requires close_gate as authorized subject', () => {
    const entry = getSealTransition('verification_done', 'closed');
    expect(entry).toBeDefined();
    expect(entry!.authorizedSubject).toBe('close_gate');
  });

  it('sf_state_transition BLOCKS verification_done → closed without close_gate actor', async () => {
    const workItemId = 'wi-seal-no-actor';
    const wiDir = await createFullWorkItem(tmpDir, workItemId);
    // Write close_gate.json as passed (evidence requirement)
    await fs.writeFile(
      path.join(wiDir, 'gates', 'close_gate.json'),
      JSON.stringify({ status: 'passed' }),
    );

    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: workItemId,
        from_state: 'verification_done',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'sf-orchestrator' },
      { workflowEngine: null, projectManager: null } as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).seal_transition).toBe(true);
    expect((result as any).required_actor).toBe('close_gate');
    expect((result as any).error).toContain('close_gate');
  });

  it('sf_state_transition BLOCKS verification_done → closed with agent actor', async () => {
    const workItemId = 'wi-seal-agent';
    const wiDir = await createFullWorkItem(tmpDir, workItemId);
    await fs.writeFile(
      path.join(wiDir, 'gates', 'close_gate.json'),
      JSON.stringify({ status: 'passed' }),
    );

    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: workItemId,
        from_state: 'verification_done',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'agent' },
      { workflowEngine: null, projectManager: null } as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).seal_transition).toBe(true);
  });

  it('sf_state_transition BLOCKS verification_done → closed with no agent', async () => {
    const workItemId = 'wi-seal-empty';
    await createFullWorkItem(tmpDir, workItemId);

    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: workItemId,
        from_state: 'verification_done',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir },
      { workflowEngine: null, projectManager: null } as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).seal_transition).toBe(true);
  });

  it('sf_state_transition ALLOWS verification_done → closed with close_gate actor (evidence check proceeds)', async () => {
    const workItemId = 'wi-seal-allowed';
    const wiDir = await createFullWorkItem(tmpDir, workItemId);
    await fs.writeFile(
      path.join(wiDir, 'gates', 'close_gate.json'),
      JSON.stringify({ status: 'passed' }),
    );
    // Also write close_gate.md for evidence requirements
    await fs.writeFile(path.join(wiDir, 'close_gate.md'), '# Close Gate\nPassed');

    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: workItemId,
        from_state: 'verification_done',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'close_gate' },
      { workflowEngine: null, projectManager: null } as any,
    );

    // Should pass seal check but may fail at workflowEngine (null deps) — that's OK
    // The key assertion is that it did NOT return seal_transition=true
    expect((result as any).seal_transition).toBeUndefined();
  });

  it('closed → any is forbidden (terminal state)', async () => {
    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: 'wi-closed-any',
        from_state: 'closed',
        to_state: 'created',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'close_gate' },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).forbidden).toBe(true);
  });

  it('blocked → closed is forbidden', async () => {
    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: 'wi-blocked-closed',
        from_state: 'blocked',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'close_gate' },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).forbidden).toBe(true);
  });

  it('rejected → closed is forbidden', async () => {
    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: 'wi-rejected-closed',
        from_state: 'rejected',
        to_state: 'closed',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'close_gate' },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).forbidden).toBe(true);
  });

  it('other seal transitions also enforced (gates_running → approval_required needs gate_runner)', async () => {
    const handler = getHandler('sf_state_transition')!;
    const result = await handler(
      {
        work_item_id: 'wi-seal-gate',
        from_state: 'gates_running',
        to_state: 'approval_required',
        use_v11_state_machine: true,
      },
      { directory: tmpDir, agent: 'agent' },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).seal_transition).toBe(true);
    expect((result as any).required_actor).toBe('gate_runner');
  });
});

// ---------------------------------------------------------------------------
// B. close_gate happy path
// ---------------------------------------------------------------------------

describe('B. close_gate happy path (code_only_fast_path)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-happy-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('full happy path: verification_done → closed with all evidence', async () => {
    const workItemId = 'wi-happy-path';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      actualChangedFiles: [
        { path: 'src/main.ts', operation: 'modify' },
        { path: 'src/utils.ts', operation: 'create' },
      ],
      allowedWriteFiles: [
        { path: 'src/main.ts', operation: 'modify' },
        { path: 'src/utils.ts', operation: 'create' },
      ],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // Assertions: success
    expect(result.success).toBe(true);
    expect(result.state_advanced).toBe(true);
    expect(result.code_permission_revoked).toBe(true);

    // Verify WI status
    const wi = JSON.parse(await fs.readFile(path.join(wiDir, 'work_item.json'), 'utf-8'));
    expect(wi.status).toBe('closed');
    expect(wi.closed_at).toBeDefined();
    expect(wi.code_change_allowed).toBe(false);
    expect(wi.allowed_write_files).toEqual([]);

    // Verify close_gate.json
    const gateJson = JSON.parse(await fs.readFile(path.join(wiDir, 'gates', 'close_gate.json'), 'utf-8'));
    expect(gateJson.status).toBe('passed');
    expect(gateJson.gate_id).toBe('close_gate');

    // Verify close_gate.md
    const closeMd = await fs.readFile(path.join(wiDir, 'close_gate.md'), 'utf-8');
    expect(closeMd).toContain('Close Gate Evidence');
    expect(closeMd).toContain(workItemId);

    // Verify changed_files_audit.md exists
    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('Changed Files Audit');

    // candidate_manifest.entries = [] for code_only_fast_path
    const manifest = JSON.parse(await fs.readFile(path.join(wiDir, 'candidate_manifest.json'), 'utf-8'));
    expect(manifest.entries).toEqual([]);

    // merge_report status = not_applicable for code_only_fast_path
    const mergeReport = await fs.readFile(path.join(wiDir, 'merge_report.md'), 'utf-8');
    expect(mergeReport).toContain('not_applicable');
  });

  it('code_permission already revoked — handler proceeds without error', async () => {
    const workItemId = 'wi-perm-already-revoked';
    await createFullWorkItem(tmpDir, workItemId, { codeChangeAllowed: false });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.code_permission_revoked).toBe(true);
  });

  it('code_permission still active — handler revokes it first', async () => {
    const workItemId = 'wi-perm-active';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      codeChangeAllowed: true,
      allowedWriteFiles: [{ path: 'src/main.ts', operation: 'modify' }],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);

    // close_gate.json should show code_permission_revoked check passed
    const gateJson = JSON.parse(await fs.readFile(path.join(wiDir, 'gates', 'close_gate.json'), 'utf-8'));
    const permCheck = gateJson.checks.find((c: any) => c.check_id === 'close_code_permission_revoked');
    expect(permCheck?.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. close_gate negative tests
// ---------------------------------------------------------------------------

describe('C. close_gate negative tests', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-neg-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('missing verification_report → close_gate failed', async () => {
    const workItemId = 'wi-neg-vr';
    await createFullWorkItem(tmpDir, workItemId, { skipFiles: ['verification_report.md'] });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('verification_report');
  });

  it('missing evidence_manifest → close_gate failed', async () => {
    const workItemId = 'wi-neg-em';
    await createFullWorkItem(tmpDir, workItemId, { skipFiles: ['evidence/evidence_manifest.json'] });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('evidence');
  });

  it('missing trace_delta → close_gate failed', async () => {
    const workItemId = 'wi-neg-td';
    await createFullWorkItem(tmpDir, workItemId, { skipFiles: ['trace_delta.md'] });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('trace_delta');
  });

  it('missing merge_report → close_gate failed', async () => {
    const workItemId = 'wi-neg-mr';
    await createFullWorkItem(tmpDir, workItemId, { skipFiles: ['merge_report.md'] });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('merge_report');
  });

  it('missing candidate_manifest → close_gate failed', async () => {
    const workItemId = 'wi-neg-cm';
    await createFullWorkItem(tmpDir, workItemId, { skipFiles: ['candidate_manifest.json'] });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('candidate_manifest');
  });

  it('missing changed_files_audit AND empty actual_changed_files → handler generates weak audit but still passes close gate', async () => {
    // When audit file is missing, handler generates one from actual_changed_files
    // If actual_changed_files is also empty, generates a weak (0-file) audit
    // The close gate check_10 looks for "pass" or "success" in audit content → still passes
    const workItemId = 'wi-neg-cfa-empty';
    await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [], // Empty — weak audit
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // With empty actual_changed_files, audit passes (0 violations)
    // close_gate check_10 sees "PASSED" in content → passes
    expect(result.success).toBe(true);

    // But verify the audit marks data source clearly
    const wiDir = path.join(tmpDir, '.specforge', 'work-items', workItemId);
    const auditContent = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditContent).toContain('weak audit');
  });

  it('changed_files_audit with violations (out-of-scope writes) → audit FAILED → close_gate failed', async () => {
    const workItemId = 'wi-neg-cfa-fail';
    await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [
        { path: 'src/main.ts', operation: 'modify' },
        { path: 'src/unauthorized.ts', operation: 'create' }, // Not in allowed_write_files
      ],
      allowedWriteFiles: [
        { path: 'src/main.ts', operation: 'modify' },
        // src/unauthorized.ts NOT listed — out of scope
      ],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // The audit itself passes (runChangedFilesAudit reports violations but
    // the close_gate check only looks for "pass"/"success" in the md content)
    // Since the audit has violations, the generated md says "FAILED"
    // close_gate check_10 looks for "pass" or "success" → won't find it → close_gate FAILS
    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('changed_files_audit');
  });

  it('Write Guard violations present → close_gate failed', async () => {
    const workItemId = 'wi-neg-wg';
    await createFullWorkItem(tmpDir, workItemId, {
      writeGuardViolations: ['out_of_scope: src/hacked.ts'],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('write_guard');
  });

  it('user_decision rejected → close_gate failed', async () => {
    const workItemId = 'wi-neg-ud';
    await createFullWorkItem(tmpDir, workItemId, { userDecisionStatus: 'rejected' });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('user_decision');
  });

  it('state not verification_done → close_gate blocked', async () => {
    const workItemId = 'wi-neg-state';
    await createFullWorkItem(tmpDir, workItemId, { status: 'implementation_running' });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('verification_done');
  });

  it('closed WI → sf_close_gate rejects (idempotent protection)', async () => {
    const workItemId = 'wi-neg-already-closed';
    await createFullWorkItem(tmpDir, workItemId, { status: 'closed' });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as string)).toContain('verification_done');
  });
});

// ---------------------------------------------------------------------------
// D. changed_files_audit 真实性验证
// ---------------------------------------------------------------------------

describe('D. changed_files_audit data integrity', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-audit-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('audit includes actual modified files vs allowed_write_files comparison', async () => {
    const workItemId = 'wi-audit-real';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [
        { path: 'src/index.ts', operation: 'modify' },
        { path: 'src/helper.ts', operation: 'create' },
      ],
      allowedWriteFiles: [
        { path: 'src/index.ts', operation: 'modify' },
        { path: 'src/helper.ts', operation: 'create' },
      ],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    expect(result.success).toBe(true);

    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    // Audit should contain file entries
    expect(auditMd).toContain('src/index.ts');
    expect(auditMd).toContain('src/helper.ts');
    expect(auditMd).toContain('PASSED');
    expect(auditMd).toContain('Data Source');
    expect(auditMd).toContain('work_item.actual_changed_files');
    // Should show total count
    expect(auditMd).toContain('Total files');
    expect(auditMd).toContain('2');
  });

  it('audit detects out-of-scope writes', async () => {
    const workItemId = 'wi-audit-oos';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [
        { path: 'src/main.ts', operation: 'modify' },
        { path: 'package.json', operation: 'modify' }, // not in allowed
      ],
      allowedWriteFiles: [
        { path: 'src/main.ts', operation: 'modify' },
      ],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // Audit fails → close gate fails
    expect(result.success).toBe(false);

    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('FAILED');
    expect(auditMd).toContain('package.json');
    expect(auditMd).toContain('Out of scope');
    expect(auditMd).toContain('Violations');
  });

  it('audit detects .specforge/project/ writes by non-merge_runner', async () => {
    const workItemId = 'wi-audit-spec';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [
        { path: '.specforge/project/architecture.md', operation: 'modify' },
      ],
      allowedWriteFiles: [],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    ) as Record<string, unknown>;

    // .specforge/project/ by agent → violation
    expect(result.success).toBe(false);

    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('FAILED');
    expect(auditMd).toContain('spec_write_by_non_merge_runner');
  });

  it('audit with empty actual_changed_files marks data source as weak', async () => {
    const workItemId = 'wi-audit-weak';
    const wiDir = await createFullWorkItem(tmpDir, workItemId, {
      skipFiles: ['changed_files_audit.md'],
      actualChangedFiles: [],
    });

    const handler = getHandler('sf_close_gate')!;
    await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    const auditMd = await fs.readFile(path.join(wiDir, 'changed_files_audit.md'), 'utf-8');
    expect(auditMd).toContain('weak audit');
    expect(auditMd).toContain('Data Source');
  });
});

// ---------------------------------------------------------------------------
// E. Closed 后写入阻断 (Write Guard)
// ---------------------------------------------------------------------------

describe('E. Closed WI write blockade (Write Guard)', () => {
  it('checkWrite blocks all writes when workItem.status=closed', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-001',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: 'code_only_fast_path',
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    // Agent writes to code file → blocked
    const result1 = checkWrite(ctx, 'src/main.ts', 'modify');
    expect(result1.allowed).toBe(false);
    expect(result1.violations[0]).toContain('closed');

    // Agent writes to .specforge/ → blocked
    const result2 = checkWrite(ctx, '.specforge/work-items/wi-001/notes.md', 'create');
    expect(result2.allowed).toBe(false);
    expect(result2.violations[0]).toContain('closed');
  });

  it('checkWrite blocks orchestrator writes when WI is closed', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-002',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.orchestrator,
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/project/architecture.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed');
  });

  it('checkWrite blocks merge_runner writes when WI is closed', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-003',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.mergeRunner,
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/project/trace_matrix.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed');
  });

  it('checkWrite blocks gate_runner writes when WI is closed', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-004',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.gateRunner,
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/wi-001/gates/close_gate.json', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed');
  });

  it('checkWrite blocks close_gate actor writes when WI is closed', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-005',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.closeGate,
      isFrozen: false,
    };

    const result = checkWrite(ctx, '.specforge/work-items/wi-001/close_gate.md', 'modify');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed');
  });

  it('checkWrite blocks delete operations on closed WI', () => {
    const ctx: WriteGuardContext = {
      hasActiveWI: true,
      workItem: {
        work_item_id: 'wi-closed-006',
        status: 'closed',
        code_change_allowed: false,
        allowed_write_files: [],
        workflow_path: null,
      },
      callerRole: ACTOR_ROLES.agent,
      isFrozen: false,
    };

    const result = checkWrite(ctx, 'src/main.ts', 'delete');
    expect(result.allowed).toBe(false);
    expect(result.violations[0]).toContain('closed');
  });
});
