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
    test_matrix: { L1_unit: 'pass' },
    verification_commands: [{ command: 'test', status: 'pass', output_summary: 'passed' }],
    acceptance_criteria: [{ req_id: 'REQ-1', name: 'works', status: 'pass', evidence: 'EV-1' }],
    e2e_tests: [{ name: 'e2e', status: 'pass', evidence: 'EV-1' }],
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
