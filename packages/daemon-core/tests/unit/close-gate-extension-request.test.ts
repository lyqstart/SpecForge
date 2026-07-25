/**
 * close-gate-extension-request.test.ts
 *
 * Tests that runCloseGate() correctly handles extension_request.json while the
 * semantic closure hard gate remains satisfied.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCloseGate } from '../../src/tools/lib/close-gate.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import { captureSemanticClosureProvenance } from '../../src/tools/lib/semantic-closure-provenance.js';

function semanticClosure(workItemId: string): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    outcomes: [{ id: 'OUT-1', requirement_refs: ['REQ-1'], required_evidence_refs: ['EV-1'] }],
    requirements: [
      {
        id: 'REQ-1',
        type: 'MUST',
        outcome_refs: ['OUT-1'],
        design_refs: ['DD-1'],
        task_refs: ['TASK-1'],
        required_evidence_refs: ['EV-1'],
      },
    ],
    design_decisions: [{ id: 'DD-1', requirement_refs: ['REQ-1'], task_refs: ['TASK-1'] }],
    tasks: [
      { id: 'TASK-1', requirement_refs: ['REQ-1'], design_refs: ['DD-1'], evidence_refs: ['EV-1'] },
    ],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_e2e',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };
}

async function createFullWIDir(tmpDir: string, workItemId: string): Promise<string> {
  const wiDir = path.join(tmpDir, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  const wi = {
    work_item_id: workItemId,
    status: 'verification_done',
    code_change_allowed: false,
    code_permission_revoked: true,
    allowed_write_files: [],
    workflow_path: 'code_only_fast_path',
  };
  await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify(wi, null, 2) + '\n');
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake');
  await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC');
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      work_item_id: workItemId,
      workflow_path: 'code_only_fast_path',
      triggered: true,
    }) + '\n'
  );
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Done');
  await fs.writeFile(
    path.join(wiDir, 'trace_delta.md'),
    '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1'
  );
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [],
      workflow_path: 'code_only_fast_path',
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'gate_summary.md'),
    [
      '# Gate Summary',
      '',
      'Overall Status: passed',
      '',
      '## User Decision Required',
      '',
      'All required gates passed. Non-blocking warnings do not require a waiver.',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    '# Verification\nEvidence EV-1 passed.'
  );
  await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nMerge Status: not_applicable');
  await fs.writeFile(path.join(wiDir, 'changed_files_audit.md'), '# Audit\n- Status: PASSED');
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [{ id: 'EV-1', type: 'behavioral_e2e', status: 'passed' }],
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify({ decision_status: 'approved', workflow_path: 'code_only_fast_path' }) + '\n'
  );
  const closure = semanticClosure(workItemId);
  closure.provenance = await captureSemanticClosureProvenance({
    workItemDir: wiDir,
    source: 'test_fixture',
    manifest: closure,
  });
  await fs.writeFile(
    path.join(wiDir, '.semantic_closure.json'),
    JSON.stringify(closure, null, 2) + '\n'
  );

  return wiDir;
}

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
    const result = await runCloseGate({
      workItemId: 'WI-ABSENT',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck).toBeDefined();
    expect(extCheck!.passed).toBe(true);
    expect(extCheck!.description).toContain('not applicable');
    const waiverCheck = result.report.checks.find(
      c => c.check_id === 'close_waiver_follow_up'
    );
    expect(waiverCheck).toBeDefined();
    expect(waiverCheck!.passed).toBe(true);
    expect(waiverCheck!.description).toBe('No waivers requiring follow-up');
  });

  it('pending: extension_request.json exists with no status field + blocking=true → close_gate FAILS', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-PENDING');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-PENDING',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'requirement_types',
        requested_key: 'nfr',
        reason: 'need NFR type',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-PENDING',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck).toBeDefined();
    expect(extCheck!.passed).toBe(false);
    expect(extCheck!.severity).toBe('error');
  });

  it('pending with status=pending → close_gate FAILS', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-PENDING2');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-PENDING2',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'design_types',
        requested_key: 'api_design',
        reason: 'need API design type',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
        status: 'pending',
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-PENDING2',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck!.passed).toBe(false);
  });

  it('resolved: extension_request.json with status=resolved → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-RESOLVED');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-RESOLVED',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'requirement_types',
        requested_key: 'nfr',
        reason: 'need NFR type',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
        status: 'resolved',
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-RESOLVED',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck!.passed).toBe(true);
  });

  it('merged: extension_request.json with status=merged → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-MERGED');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-MERGED',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'gate_types',
        requested_key: 'perf_gate',
        reason: 'need perf gate',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
        status: 'merged',
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-MERGED',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(true);
  });

  it('closed: extension_request.json with status=closed → close_gate passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-CLOSED-EXT');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-CLOSED-EXT',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'task_types',
        requested_key: 'test_task',
        reason: 'need test task type',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
        status: 'closed',
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-CLOSED-EXT',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(true);
  });

  it('unknown status: extension_request.json with status=banana → fail-closed', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-UNKNOWN');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-UNKNOWN',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'requirement_types',
        requested_key: 'nfr',
        reason: 'test',
        blocking_current_flow: true,
        created_at: new Date().toISOString(),
        status: 'banana',
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-UNKNOWN',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(false);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
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
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck!.passed).toBe(false);
    expect(extCheck!.description).toContain('cannot be parsed');
  });

  it('non-blocking: extension_request with blocking_current_flow=false and no status → passes', async () => {
    const wiDir = await createFullWIDir(tmpDir, 'WI-NONBLOCK');
    await fs.writeFile(
      path.join(wiDir, 'extension_request.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-NONBLOCK',
        requested_by_agent: 'sf-orchestrator',
        requested_namespace: 'verification_types',
        requested_key: 'load_test',
        reason: 'optional enhancement',
        blocking_current_flow: false,
        created_at: new Date().toISOString(),
      }) + '\n'
    );
    const result = await runCloseGate({
      workItemId: 'WI-NONBLOCK',
      workItemDir: wiDir,
      projectRoot: tmpDir,
    });
    expect(result.allChecksPassed).toBe(true);
    const extCheck = result.report.checks.find(
      c => c.check_id === 'close_extension_request_resolved'
    );
    expect(extCheck!.passed).toBe(true);
  });
});
