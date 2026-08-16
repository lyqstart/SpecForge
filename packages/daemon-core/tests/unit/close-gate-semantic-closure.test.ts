/**
 * close-gate-semantic-closure.test.ts — close_gate semantic closure hard gate tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCloseGate } from '../../src/tools/lib/close-gate.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import { captureSemanticClosureProvenance } from '../../src/tools/lib/semantic-closure-provenance.js';

function passingSemanticClosure(workItemId: string): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    outcomes: [
      {
        id: 'OUT-1',
        description: 'Application logs are persisted locally and uploaded to server',
        requirement_refs: ['REQ-1'],
        required_evidence_refs: ['EV-1'],
      },
    ],
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
    design_decisions: [
      {
        id: 'DD-1',
        requirement_refs: ['REQ-1'],
        task_refs: ['TASK-1'],
      },
    ],
    tasks: [
      {
        id: 'TASK-1',
        requirement_refs: ['REQ-1'],
        design_refs: ['DD-1'],
        evidence_refs: ['EV-1'],
      },
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
    project_integration: {
      status: 'not_applicable',
    },
  };
}

async function createCloseReadyWorkItem(tmpDir: string, workItemId: string): Promise<string> {
  const wiDir = path.join(tmpDir, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(
      {
        work_item_id: workItemId,
        status: 'verification_done',
        code_change_allowed: false,
        code_permission_revoked: true,
        allowed_write_files: [],
        workflow_path: 'code_only_fast_path',
      },
      null,
      2
    ) + '\n'
  );
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nUser outcome captured.\n');
  await fs.writeFile(
    path.join(wiDir, 'change_classification.md'),
    '# Change Classification\ncode_only_fast_path\n'
  );
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# Impact Analysis\nLow impact.\n');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      work_item_id: workItemId,
      workflow_path: 'code_only_fast_path',
      triggered: true,
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'tasks.md'),
    '# Tasks\n\nWork Item: placeholder\n\n> TODO: 由 Agent 填充\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'tasks.md'),
    '# Tasks\n- [x] TASK-1 implemented.\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'trace_delta.md'),
    '# Trace Delta\n\nTrace Impact: none\n\nReason: Not yet analyzed\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'candidates', 'trace_delta.md'),
    '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1\n',
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
    '# Gate Summary\n\n- Overall Status: passed\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'gates', 'formal_version_gate.json'),
    JSON.stringify({ gate_id: 'formal_version_gate', status: 'passed' }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    '# Verification Report\n\nEvidence EV-1 passed.\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'merge_report.md'),
    '# Merge Report\n\nStatus: not_applicable\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'changed_files_audit.md'),
    '# Changed Files Audit\n\n- Status: PASSED\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [{ id: 'EV-1', type: 'behavioral_e2e', status: 'passed' }],
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify({
      decision_status: 'approved',
      workflow_path: 'code_only_fast_path',
      timestamp: new Date().toISOString(),
    }) + '\n'
  );
  const semanticClosure = passingSemanticClosure(workItemId);
  semanticClosure.provenance = await captureSemanticClosureProvenance({
    workItemDir: wiDir,
    source: 'test_fixture',
    manifest: semanticClosure,
  });
  await fs.writeFile(
    path.join(wiDir, '.semantic_closure.json'),
    JSON.stringify(semanticClosure, null, 2) + '\n'
  );

  return wiDir;
}

describe('runCloseGate semantic closure hard gate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-semantic-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes when semantic closure proves OUT -> REQ -> DD -> TASK -> EV', async () => {
    const workItemId = 'WI-SEM-PASS';
    const wiDir = await createCloseReadyWorkItem(tmpDir, workItemId);

    const result = await runCloseGate({ workItemId, workItemDir: wiDir, projectRoot: tmpDir });

    expect(result.allChecksPassed).toBe(true);
    expect(
      result.report.checks.find(check => check.check_id === 'close_semantic_closure_valid')?.passed
    ).toBe(true);
    expect(
      result.report.checks.find(
        check => check.check_id === 'close_artifact_tasks_authoritative',
      )?.details,
    ).toContain('candidates/tasks.md');
    expect(
      result.report.checks.find(
        check => check.check_id === 'close_artifact_trace_delta_authoritative',
      ),
    ).toBeUndefined();
    expect(result.report.input_files).toEqual(
      expect.arrayContaining(['candidates/tasks.md']),
    );
    expect(result.report.input_files).not.toContain('candidates/trace_delta.md');
  });

  it('fails closed when .semantic_closure.json is missing', async () => {
    const workItemId = 'WI-SEM-MISSING';
    const wiDir = await createCloseReadyWorkItem(tmpDir, workItemId);
    await fs.rm(path.join(wiDir, '.semantic_closure.json'));

    const result = await runCloseGate({ workItemId, workItemDir: wiDir, projectRoot: tmpDir });

    expect(result.allChecksPassed).toBe(false);
    expect(
      result.report.checks.find(check => check.check_id === 'close_file__semantic_closure_json')
        ?.passed
    ).toBe(false);
    expect(
      result.report.checks.find(check => check.check_id === 'close_semantic_closure_json_valid')
        ?.passed
    ).toBe(false);
  });

  it('blocks compile-only evidence from closing user outcome', async () => {
    const workItemId = 'WI-SEM-WEAK';
    const wiDir = await createCloseReadyWorkItem(tmpDir, workItemId);
    const manifest = passingSemanticClosure(workItemId);
    manifest.evidence = [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L2',
        evidence_type: 'compile-only',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ];
    await fs.writeFile(
      path.join(wiDir, '.semantic_closure.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );

    const result = await runCloseGate({ workItemId, workItemDir: wiDir, projectRoot: tmpDir });

    expect(result.allChecksPassed).toBe(false);
    const semanticCheck = result.report.checks.find(
      check => check.check_id === 'close_semantic_closure_valid'
    );
    expect(semanticCheck?.passed).toBe(false);
    expect(semanticCheck?.details).toContain('semantic_outcome_OUT-1_has_passed_evidence');
  });

  it('blocks missing project integration status', async () => {
    const workItemId = 'WI-SEM-INTEGRATION';
    const wiDir = await createCloseReadyWorkItem(tmpDir, workItemId);
    const manifest = passingSemanticClosure(workItemId);
    delete manifest.project_integration;
    await fs.writeFile(
      path.join(wiDir, '.semantic_closure.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );

    const result = await runCloseGate({ workItemId, workItemDir: wiDir, projectRoot: tmpDir });

    expect(result.allChecksPassed).toBe(false);
    const semanticCheck = result.report.checks.find(
      check => check.check_id === 'close_semantic_closure_valid'
    );
    expect(semanticCheck?.details).toContain('semantic_project_integration_closed');
  });
});
