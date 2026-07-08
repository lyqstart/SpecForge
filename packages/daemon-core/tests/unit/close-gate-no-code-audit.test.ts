/**
 * close-gate-no-code-audit.test.ts
 *
 * Regression for v1.3.2: close_gate accepts no-code investigation audit when
 * code_permission was never enabled, but keeps normal implementation checks intact.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCloseGate } from '../../src/tools/lib/close-gate.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';

function investigationSemanticClosure(workItemId: string): SemanticClosureManifest {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    outcomes: [
      { id: 'OUT-1', description: 'Investigation report identifies requirement coverage gaps', requirement_refs: ['REQ-1'] },
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
    design_decisions: [{ id: 'DD-1', requirement_refs: ['REQ-1'], task_refs: ['TASK-1'] }],
    tasks: [{ id: 'TASK-1', requirement_refs: ['REQ-1'], design_refs: ['DD-1'], evidence_refs: ['EV-1'] }],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'code_audit',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };
}

async function createCloseReadyNoCodeWorkItem(projectRoot: string, workItemId = 'WI-0001'): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'candidates', 'project', 'modules', 'core'), { recursive: true });
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify(
      {
        schema_version: '1.1',
        work_item_id: workItemId,
        status: 'verification_done',
        workflow_type: 'investigation',
        workflow_path: 'requirement_change_path',
        code_change_allowed: false,
        allowed_write_files: [],
      },
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nInvestigation request.');
  await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# Change Classification\ninvestigation');
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# Impact Analysis\nNo code impact.');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({ work_item_id: workItemId, workflow_type: 'investigation', workflow_path: 'requirement_change_path' }) + '\n',
  );
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] Review requirements and source.');
  await fs.writeFile(path.join(wiDir, 'trace_delta.md'), '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1');
  await fs.writeFile(path.join(wiDir, 'candidates', 'project', 'modules', 'core', 'requirements.candidate.md'), '# Requirements Candidate\nREQ-1');
  await fs.writeFile(path.join(wiDir, 'candidates', 'project', 'modules', 'core', 'design.candidate.md'), '# Design Candidate\nDD-1');
  await fs.writeFile(path.join(wiDir, 'candidates', 'trace_delta.md'), '# Trace Candidate\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1');
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify(
      {
        work_item_id: workItemId,
        workflow_path: 'requirement_change_path',
        entries: [
          {
            candidate_path: 'candidates/project/modules/core/requirements.candidate.md',
            target_path: '.specforge/project/modules/core/requirements.md',
            operation: 'replace',
            type: 'requirements',
          },
          {
            candidate_path: 'candidates/project/modules/core/design.candidate.md',
            target_path: '.specforge/project/modules/core/design.md',
            operation: 'replace',
            type: 'design',
          },
          {
            candidate_path: 'candidates/trace_delta.md',
            target_path: '.specforge/project/trace_matrix.md',
            operation: 'replace',
            type: 'trace_delta',
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(path.join(wiDir, 'gate_summary.md'), '# Gate Summary\n\n- Overall Status: passed\n');
  await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Verification Report\n\nEvidence EV-1 passed.');
  await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge Report\n\nMerge Status: not_applicable');
  await fs.writeFile(
    path.join(wiDir, 'changed_files_audit.md'),
    [
      '# Changed Files Audit',
      '',
      'Mode: no_code_change / not_applicable',
      '',
      '## Result: PASS',
      '',
      '- Status: not_applicable / no_code_change / PASS',
      '- Total files: 0',
      '- In scope: 0',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 0',
      '- Historical/resolved blocked write attempts: 0',
      '- Unresolved blocked write attempts: 0',
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({ work_item_id: workItemId, entries: [{ id: 'EV-1', type: 'code_audit', status: 'passed' }] }) + '\n',
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify(
      {
        decision_status: 'approved',
        decision_type: 'user_approved',
        decided_by: 'user',
        workflow_path: 'requirement_change_path',
        user_response_quote: 'approved no-code investigation closeout',
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  await fs.writeFile(path.join(wiDir, '.semantic_closure.json'), JSON.stringify(investigationSemanticClosure(workItemId), null, 2) + '\n');
  return wiDir;
}

describe('runCloseGate no-code investigation audit', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-no-code-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes no-code investigation close when code_permission was never enabled and audit is not_applicable', async () => {
    const wiDir = await createCloseReadyNoCodeWorkItem(tmpDir);
    const result = await runCloseGate({ workItemId: 'WI-0001', workItemDir: wiDir, projectRoot: tmpDir });

    expect(result.allChecksPassed).toBe(true);
    expect(result.report.checks.find((check) => check.check_id === 'close_code_permission_revoked')?.passed).toBe(true);
    expect(result.report.checks.find((check) => check.check_id === 'close_changed_files_audit_passed')?.passed).toBe(true);
  });

  it('does not accept no-code audit wording for feature_spec implementation WI', async () => {
    const wiDir = await createCloseReadyNoCodeWorkItem(tmpDir);
    const wiPath = path.join(wiDir, 'work_item.json');
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    wi.workflow_type = 'feature_spec';
    await fs.writeFile(wiPath, JSON.stringify(wi, null, 2) + '\n');

    const result = await runCloseGate({ workItemId: 'WI-0001', workItemDir: wiDir, projectRoot: tmpDir });
    expect(result.allChecksPassed).toBe(false);
    expect(result.report.checks.find((check) => check.check_id === 'close_code_permission_revoked')?.passed).toBe(false);
  });
});
