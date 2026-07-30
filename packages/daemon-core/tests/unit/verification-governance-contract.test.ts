import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderVerificationReport } from '../../src/tools/lib/sf_artifact_write_core.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import { captureSemanticClosureProvenance } from '../../src/tools/lib/semantic-closure-provenance.js';
import {
  evaluateVerificationGovernanceContract,
  extractStructuredVerificationReport,
} from '../../src/tools/lib/verification-governance-contract.js';
import { runGate } from '../../src/tools/lib/gate-runner-v11.js';

function closure(workItemId: string): SemanticClosureManifest {
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
        supports: ['OUT-1', 'REQ-1', 'DD-1', 'TASK-1'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };
}

describe('verification governance contract', () => {
  let projectRoot: string;
  let workItemDir: string;
  const workItemId = 'WI-9301';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-verification-contract-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await fs.mkdir(path.join(workItemDir, 'evidence'), { recursive: true });
    const semanticClosure = closure(workItemId);
    const report = renderVerificationReport(
      JSON.stringify({
        conclusion: 'pass',
        test_matrix: {
          L1_unit: 'pass',
          L2_integration: 'pass',
          L3_pbt: 'not_applicable',
          L4_e2e: 'pass',
          L5_smoke: 'pass',
          L6_regression: 'not_applicable',
          L7_performance: 'not_applicable',
          L8_security: 'not_applicable',
          L9_compatibility: 'not_applicable',
          L10_uat: 'not_applicable',
        },
        verification_commands: [{ command: 'test', status: 'pass', output_summary: 'passed' }],
        acceptance_criteria: [{ req_id: 'REQ-1', name: 'works', status: 'pass', evidence: 'EV-1' }],
        e2e_tests: [{ name: 'e2e', status: 'pass', evidence: 'EV-1' }],
        side_effects: 'none',
        summary: 'verified',
        semantic_closure: semanticClosure,
      })
    );
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({ work_item_id: workItemId, workflow_type: 'quick_change' }) + '\n'
    );
    await fs.writeFile(path.join(workItemDir, 'trace_delta.md'), '# Trace\n');
    await fs.writeFile(path.join(workItemDir, 'verification_report.md'), report!);
    await fs.writeFile(
      path.join(workItemDir, 'evidence', 'evidence_manifest.json'),
      JSON.stringify(
        {
          entries: [
            {
              id: 'EV-1',
              status: 'passed',
              level: 'L5',
              type: 'behavioral_e2e',
              supports: ['OUT-1', 'REQ-1', 'DD-1', 'TASK-1'],
            },
          ],
        },
        null,
        2
      ) + '\n'
    );
    await fs.writeFile(path.join(workItemDir, 'merge_report.md'), 'Status: not_applicable\n');
    await fs.writeFile(
      path.join(workItemDir, 'changed_files_audit.md'),
      'Result: PASS\n- Out of scope: 0\n- Violations: 0\n'
    );
    semanticClosure.provenance = await captureSemanticClosureProvenance({
      workItemDir,
      source: 'tool_argument',
      manifest: semanticClosure,
    });
    await fs.writeFile(
      path.join(workItemDir, '.semantic_closure.json'),
      JSON.stringify(semanticClosure, null, 2) + '\n'
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('passes only when report, Evidence, audit, closure and provenance agree', async () => {
    const result = await evaluateVerificationGovernanceContract({
      workItemDir,
      workflowType: 'quick_change',
    });
    expect(result.checks.filter(check => !check.passed)).toEqual([]);
  });

  it('is enforced by the active verification_gate before state advancement', async () => {
    const report = await runGate('verification_gate', {
      workItemId,
      workItemDir,
      projectRoot,
      workflowType: 'quick_change',
      workflowPath: 'code_only_fast_path',
    });
    expect(report.status).toBe('passed');
    expect(
      report.checks.find(check => check.check_id === 'verification_semantic_closure_valid')?.passed
    ).toBe(true);
    expect(
      report.checks.find(
        check => check.check_id === 'verification_semantic_closure_provenance_current'
      )?.passed
    ).toBe(true);
  });

  it('makes the active verification gate fail when semantic closure is missing', async () => {
    await fs.rm(path.join(workItemDir, '.semantic_closure.json'));
    const report = await runGate('verification_gate', {
      workItemId,
      workItemDir,
      projectRoot,
      workflowType: 'quick_change',
      workflowPath: 'code_only_fast_path',
    });
    expect(report.status).toBe('failed');
    expect(
      report.checks.find(check => check.check_id === 'verification_semantic_closure_valid')?.passed
    ).toBe(false);
  });

  it('fails when verification artifacts change after closure generation', async () => {
    await fs.appendFile(path.join(workItemDir, 'verification_report.md'), '\nchanged\n');
    const result = await evaluateVerificationGovernanceContract({
      workItemDir,
      workflowType: 'quick_change',
    });
    expect(
      result.checks.find(
        check => check.check_id === 'verification_semantic_closure_provenance_current'
      )?.passed
    ).toBe(false);
  });

  it('rejects failed acceptance criteria and unregistered report Evidence', async () => {
    const reportPath = path.join(workItemDir, 'verification_report.md');
    const current = extractStructuredVerificationReport(await fs.readFile(reportPath, 'utf-8'))!;
    current.acceptance_criteria[0].status = 'fail';
    current.e2e_tests[0].evidence = 'EV-UNKNOWN';
    await fs.writeFile(reportPath, renderVerificationReport(JSON.stringify(current))!);

    const result = await evaluateVerificationGovernanceContract({
      workItemDir,
      workflowType: 'quick_change',
    });
    expect(
      result.checks.find(check => check.check_id === 'verification_acceptance_criteria_passed')
        ?.passed
    ).toBe(false);
    expect(
      result.checks.find(
        check => check.check_id === 'verification_report_claims_have_registered_evidence'
      )?.passed
    ).toBe(false);
  });

  it('uses the shared report contract to reject structurally incomplete fenced JSON', async () => {
    await fs.writeFile(
      path.join(workItemDir, 'verification_report.md'),
      [
        '# Verification',
        '```json',
        JSON.stringify({
          conclusion: 'pass',
          test_results: [{ command: 'bun test', passed: true }],
          acceptance_criteria: [],
          side_effects: 'none',
          summary: 'verified',
        }),
        '```',
      ].join('\n')
    );

    const result = await evaluateVerificationGovernanceContract({
      workItemDir,
      workflowType: 'quick_change',
    });
    const contractCheck = result.checks.find(
      check => check.check_id === 'verification_report_contract_valid'
    );
    expect(contractCheck?.passed).toBe(false);
    expect(contractCheck?.details).toContain('verification_commands');
  });
});
