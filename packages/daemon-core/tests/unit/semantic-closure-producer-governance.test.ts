import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import '../../src/tools/handlers/sf-artifact-write.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';
import { buildSemanticClosureFromArtifacts } from '../../src/tools/lib/semantic-closure-builder.js';

function verificationPayload(workItemId: string) {
  return {
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
    acceptance_criteria: [
      { req_id: 'REQ-1', name: 'works', status: 'pass', evidence_refs: ['EV-1'] },
    ],
    e2e_tests: [{ name: 'e2e', status: 'pass', evidence_refs: ['EV-1'] }],
    side_effects: 'none',
    summary: 'verified',
    semantic_closure: {
      schema_version: '1.0',
      work_item_id: workItemId,
      outcomes: [{ id: 'OUT-1', requirement_refs: ['REQ-1'] }],
      requirements: [{ id: 'REQ-1', type: 'MUST', task_refs: ['TASK-1'] }],
      tasks: [{ id: 'TASK-1', requirement_refs: ['REQ-1'] }],
      evidence: [],
      project_integration: { status: 'not_applicable' },
    },
  };
}

function depsWithState(currentState: string) {
  return {
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => ({ replayed: false }),
        getState: async () => ({ current_state: currentState }),
      }),
    },
  };
}

describe('semantic closure producer governance', () => {
  let projectRoot: string;
  const workItemId = 'WI-9401';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-producer-governance-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('connects the active artifact handler to the verification template renderer', async () => {
    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        template: 'verification_report',
        content: verificationPayload(workItemId),
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      {} as any
    );

    expect((result as any).success).toBe(true);
    const report = await fs.readFile(
      path.join(projectRoot, '.specforge', 'work-items', workItemId, 'verification_report.md'),
      'utf-8'
    );
    expect(report).toContain('Machine-readable Verification Contract');
    expect(report).toContain('```json');
    const build = buildSemanticClosureFromArtifacts({
      workItemId,
      verificationReportMd: report,
    });
    expect(build.source).toBe('verification_report_json');
  });

  it('rejects Orchestrator attempts to author verifier-owned artifacts', async () => {
    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        template: 'verification_report',
        content: JSON.stringify(verificationPayload(workItemId)),
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('ARTIFACT_OWNER_MISMATCH');
    expect((result as any).required_agent).toBe('sf-verifier');
  });

  it('rejects an unstructured verification report even from the owning Verifier', async () => {
    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        content: '# Verification\npass',
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('VERIFICATION_REPORT_TEMPLATE_REQUIRED');
  });

  it('rejects the historical incomplete report shape before it reaches disk', async () => {
    const reportPath = path.join(
      projectRoot,
      '.specforge',
      'work-items',
      workItemId,
      'verification_report.md'
    );
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, 'preserved report\n');

    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        template: 'verification_report',
        content: JSON.stringify({
          conclusion: 'pass',
          verification_status: 'pass',
          test_results: [{ command: 'bun test', passed: true }],
          acceptance_criteria: [
            {
              id: 'AC-001',
              description: 'works',
              status: 'pass',
              evidence_ref: 'EV-1',
            },
          ],
          side_effects: 'none',
          summary: 'verified',
        }),
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('INVALID_VERIFICATION_REPORT_CONTRACT');
    expect((result as any).contract_id).toBe('verification-report/v1');
    expect((result as any).contract_id).toBe('verification-report/v1');
    expect((result as any).validation_errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('test_matrix'),
        expect.stringContaining('verification_commands'),
        expect.stringContaining('e2e_tests'),
        expect.stringContaining('evidence_ref'),
        expect.stringContaining('semantic_closure'),
      ])
    );
    await expect(fs.readFile(reportPath, 'utf-8')).resolves.toBe('preserved report\n');
  });

  it('rejects descriptive evidence text that is not an Evidence ID', async () => {
    const payload = verificationPayload(workItemId);
    payload.acceptance_criteria[0] = {
      req_id: 'REQ-1',
      name: 'works',
      status: 'pass',
      evidence: '已通过',
    } as any;

    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        template: 'verification_report',
        content: JSON.stringify(payload),
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).validation_errors).toEqual(
      expect.arrayContaining([expect.stringContaining('INVALID_EVIDENCE_REFERENCE')])
    );
  });

  it('freezes verification inputs after verification_gate advances state', async () => {
    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'verification_report',
        template: 'verification_report',
        content: JSON.stringify(verificationPayload(workItemId)),
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      depsWithState('verification_done') as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('VERIFICATION_INPUTS_FROZEN');
    await expect(
      fs.access(
        path.join(projectRoot, '.specforge', 'work-items', workItemId, 'verification_report.md')
      )
    ).rejects.toThrow();
  });
});
