/**
 * sf-v11-close-gate.test.ts — Close Gate handler integration test
 *
 * Tests the full WI lifecycle closure:
 * - Precondition: state=verification_done
 * - code_permission revoked
 * - changed_files_audit generated
 * - close_gate checks run
 * - State advanced to closed
 * - Evidence files written
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import handler registration (side-effect)
import '../../src/tools/handlers/sf-v11-close-gate.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

async function createMinimalWorkItem(
  projectRoot: string,
  workItemId: string,
  opts?: {
    status?: string;
    codeChangeAllowed?: boolean;
    allowedWriteFiles?: Array<{ path: string; operation: string }>;
  },
): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  const workItem = {
    work_item_id: workItemId,
    status: opts?.status ?? 'verification_done',
    code_change_allowed: opts?.codeChangeAllowed ?? false,
    allowed_write_files: opts?.allowedWriteFiles ?? [],
    workflow_path: 'code_only_fast_path',
    actual_changed_files: [
      { path: 'src/main.ts', operation: 'modify' },
    ],
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(workItem, null, 2) + '\n',
  );

  // Required files for close gate
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nMinimal.');
  await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC\ncode_only');
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA\nLow impact');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({ work_item_id: workItemId, workflow_path: 'code_only_fast_path', triggered: true }),
  );
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
  await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace\nNo spec impact');
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify({ work_item_id: workItemId, entries: [], workflow_path: 'code_only_fast_path' }),
  );
  await fs.writeFile(
    path.join(wiDir, 'gate_summary.md'),
    '# Gate Summary\n\n- Overall Status: passed\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    '# Verification Report\n\nAll evidence checks pass.',
  );
  await fs.writeFile(
    path.join(wiDir, 'merge_report.md'),
    '# Merge Report\n\nMerge Status: not_applicable',
  );
  await fs.writeFile(
    path.join(wiDir, 'changed_files_audit.md'),
    '# Changed Files Audit\n\n- Status: PASSED\nAll files in scope.',
  );
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({ work_item_id: workItemId, entries: [{ type: 'test', path: 'test.log' }] }),
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify({ decision_status: 'approved', timestamp: new Date().toISOString() }),
  );

  return wiDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sf_close_gate handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-gate-handler-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should be registered in the handler table', () => {
    const handler = getHandler('sf_close_gate');
    expect(handler).toBeDefined();
  });

  it('should reject when work_item_id is missing', async () => {
    const handler = getHandler('sf_close_gate')!;
    const result = await handler({}, { directory: tmpDir }, {} as any);
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('work_item_id');
  });

  it('should reject when state is not verification_done', async () => {
    const workItemId = 'wi-wrong-state';
    await createMinimalWorkItem(tmpDir, workItemId, { status: 'implementation_running' });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('verification_done');
  });

  it('should revoke code_permission if still active', async () => {
    const workItemId = 'wi-revoke-perm';
    await createMinimalWorkItem(tmpDir, workItemId, {
      codeChangeAllowed: true,
      allowedWriteFiles: [{ path: 'src/main.ts', operation: 'modify' }],
    });

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).code_permission_revoked).toBe(true);

    // Verify work_item.json was updated
    const wiPath = path.join(
      tmpDir,
      '.specforge',
      'work-items',
      workItemId,
      'work_item.json',
    );
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    expect(wi.code_change_allowed).toBe(false);
    expect(wi.allowed_write_files).toEqual([]);
  });

  it('should generate changed_files_audit.md when not present', async () => {
    const workItemId = 'wi-gen-audit';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);

    // Remove the pre-created audit file to test generation
    await fs.rm(path.join(wiDir, 'changed_files_audit.md'));

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    // Audit should have been generated
    const auditPath = path.join(wiDir, 'changed_files_audit.md');
    const auditContent = await fs.readFile(auditPath, 'utf-8');
    expect(auditContent).toContain('Changed Files Audit');
    expect(auditContent).toContain(workItemId);
    expect((result as any).changed_files_audit).toBeDefined();
  });

  it('should write close_gate evidence on success', async () => {
    const workItemId = 'wi-close-success';
    await createMinimalWorkItem(tmpDir, workItemId);

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(true);

    // close_gate.json in gates/
    const gateJsonPath = path.join(
      tmpDir,
      '.specforge',
      'work-items',
      workItemId,
      'gates',
      'close_gate.json',
    );
    const gateJson = JSON.parse(await fs.readFile(gateJsonPath, 'utf-8'));
    expect(gateJson.status).toBe('passed');
    expect(gateJson.gate_id).toBe('close_gate');

    // close_gate.md evidence
    const closeMdPath = path.join(
      tmpDir,
      '.specforge',
      'work-items',
      workItemId,
      'close_gate.md',
    );
    const closeMd = await fs.readFile(closeMdPath, 'utf-8');
    expect(closeMd).toContain('Close Gate Evidence');
    expect(closeMd).toContain(workItemId);
  });

  it('should advance state to closed', async () => {
    const workItemId = 'wi-state-advance';
    await createMinimalWorkItem(tmpDir, workItemId);

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(true);
    expect((result as any).state_advanced).toBe(true);

    const wiPath = path.join(
      tmpDir,
      '.specforge',
      'work-items',
      workItemId,
      'work_item.json',
    );
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    expect(wi.status).toBe('closed');
    expect(wi.closed_at).toBeDefined();
  });

  it('should fail when required evidence files are missing', async () => {
    const workItemId = 'wi-missing-evidence';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);

    // Remove verification_report to cause failure
    await fs.rm(path.join(wiDir, 'verification_report.md'));

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('close_file_verification_report_md');
    // Even on failure, code_permission should still be revoked
    expect((result as any).code_permission_revoked).toBe(true);
  });

  it('should fail when user_decision is invalid', async () => {
    const workItemId = 'wi-invalid-decision';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);

    // Override user_decision with rejected status
    await fs.writeFile(
      path.join(wiDir, 'user_decision.json'),
      JSON.stringify({ decision_status: 'rejected', timestamp: new Date().toISOString() }),
    );

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('close_user_decision_valid');
  });

  it('should still write close_gate.json on failure for diagnostics', async () => {
    const workItemId = 'wi-fail-evidence';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);

    // Remove evidence manifest
    await fs.rm(path.join(wiDir, 'evidence', 'evidence_manifest.json'));

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).evidence_path).toContain('close_gate.json');

    // Verify the file exists with failure status
    const gateJsonPath = path.join(wiDir, 'gates', 'close_gate.json');
    const gateJson = JSON.parse(await fs.readFile(gateJsonPath, 'utf-8'));
    expect(gateJson.status).toBe('failed');
  });

  it('should not advance state when close gate fails', async () => {
    const workItemId = 'wi-no-advance';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);

    await fs.rm(path.join(wiDir, 'evidence', 'evidence_manifest.json'));

    const handler = getHandler('sf_close_gate')!;
    await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any,
    );

    const wiPath = path.join(wiDir, 'work_item.json');
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    expect(wi.status).toBe('verification_done');
    expect(wi.closed_at).toBeUndefined();
  });
});
