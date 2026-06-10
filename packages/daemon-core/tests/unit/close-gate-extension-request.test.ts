/**
 * close-gate-extension-request.test.ts
 *
 * Tests that runCloseGate() correctly handles extension_request.json:
 * - absent: close allowed
 * - pending/unresolved: close blocked
 * - resolved/merged/closed: close allowed
 * - unknown status: fail-closed (blocked)
 * - unparseable file: fail-closed (blocked)
 * - non-blocking request without status: close allowed
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCloseGate } from '../../src/tools/lib/close-gate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createFullWIDir(tmpDir: string, workItemId: string): Promise<string> {
  const wiDir = path.join(tmpDir, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  // All required files for close_gate to pass (minus extension_request which is the variable)
  const wi = {
    work_item_id: workItemId,
    status: 'verification_done',
    code_change_allowed: false,
    allowed_write_files: [],
    workflow_path: 'code_only_fast_path',
  };
  await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify(wi, null, 2));
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake');
  await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC');
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA');
  await fs.writeFile(path.join(wiDir, 'trigger_result.json'), '{"triggered":true}');
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
  await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace\nNo spec impact');
  await fs.writeFile(path.join(wiDir, 'candidate_manifest.json'), JSON.stringify({ entries: [] }));
  await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary\n- Overall Status: passed');
  await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Verification\nAll evidence reviewed.');
  await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nMerge Status: not_applicable');
  await fs.writeFile(path.join(wiDir, 'changed_files_audit.md'), '# Audit\n- Status: PASSED');
  await fs.writeFile(path.join(wiDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({ entries: [{ type: 'log' }] }));
  await fs.writeFile(path.join(wiDir, 'user_decision.json'), JSON.stringify({ decision_status: 'approved' }));

  return wiDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runCloseGate — extension_request.json check (Patch 1 §7.9)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-ext-req-cg-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('absent: extension_request.json does not exist → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-ABSENT');
    // No extension_request.json created

    const result = await runCloseGate({
      workItemId: 'WI-ABSENT',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck).toBeDefined();
    expect(extCheck!.passed).toBe(true);
    expect(extCheck!.description).toContain('not applicable');
  });

  it('pending: extension_request.json exists with no status field + blocking=true → close_gate FAILS', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-PENDING');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-PENDING',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'requirement_types',
      requested_key: 'nfr',
      reason: 'need NFR type',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
    }));

    const result = await runCloseGate({
      workItemId: 'WI-PENDING',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck).toBeDefined();
    expect(extCheck!.passed).toBe(false);
    expect(extCheck!.severity).toBe('error');
  });

  it('pending with status=pending → close_gate FAILS', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-PENDING2');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-PENDING2',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'design_types',
      requested_key: 'api_design',
      reason: 'need API design type',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
      status: 'pending',
    }));

    const result = await runCloseGate({
      workItemId: 'WI-PENDING2',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(false);
  });

  it('resolved: extension_request.json with status=resolved → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-RESOLVED');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-RESOLVED',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'requirement_types',
      requested_key: 'nfr',
      reason: 'need NFR type',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
      status: 'resolved',
    }));

    const result = await runCloseGate({
      workItemId: 'WI-RESOLVED',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(true);
  });

  it('merged: extension_request.json with status=merged → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-MERGED');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-MERGED',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'gate_types',
      requested_key: 'perf_gate',
      reason: 'need perf gate',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
      status: 'merged',
    }));

    const result = await runCloseGate({
      workItemId: 'WI-MERGED',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(true);
  });

  it('closed: extension_request.json with status=closed → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-CLOSED-EXT');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-CLOSED-EXT',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'task_types',
      requested_key: 'test_task',
      reason: 'need test task type',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
      status: 'closed',
    }));

    const result = await runCloseGate({
      workItemId: 'WI-CLOSED-EXT',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
  });

  it('unknown status: extension_request.json with status=banana → fail-closed', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-UNKNOWN');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-UNKNOWN',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'requirement_types',
      requested_key: 'nfr',
      reason: 'test',
      blocking_current_flow: true,
      created_at: new Date().toISOString(),
      status: 'banana',
    }));

    const result = await runCloseGate({
      workItemId: 'WI-UNKNOWN',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(false);
  });

  it('unparseable: extension_request.json contains invalid JSON → fail-closed', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-INVALID');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), 'not valid json {{{');

    const result = await runCloseGate({
      workItemId: 'WI-INVALID',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(false);
    expect(extCheck!.description).toContain('cannot be parsed');
  });

  it('non-blocking: extension_request with blocking_current_flow=false and no status → passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-NONBLOCK');
    await fs.writeFile(path.join(wiDir, 'extension_request.json'), JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-NONBLOCK',
      requested_by_agent: 'sf-orchestrator',
      requested_namespace: 'verification_types',
      requested_key: 'load_test',
      reason: 'optional enhancement',
      blocking_current_flow: false,
      created_at: new Date().toISOString(),
    }));

    const result = await runCloseGate({
      workItemId: 'WI-NONBLOCK',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });

    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(c => c.check_id === 'close_extension_request_resolved');
    expect(extCheck!.passed).toBe(true);
  });
});
