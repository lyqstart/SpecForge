import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectCandidateGateAttemptForReconciliation,
  reconciliationModeForState,
} from '../../src/tools/handlers/sf-v11-gate-run.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function gateReport(workItemId: string, gateId: 'verification_gate' | 'formal_version_gate') {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: gateId,
    gate_type: 'hard_gate',
    required: true,
    status: 'passed',
    input_files: [],
    checks: [{ check_id: 'ok', description: 'ok', passed: true }],
    blocking_issues: [],
    warnings: [],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-08-09T12:00:00.000Z',
    finished_at: '2026-08-09T12:00:01.000Z',
    runner: 'gate_runner',
  };
}

describe('Verification historical Gate Attempt reconciliation', () => {
  it('classifies spec_migration post_merge_verified as verification reconciliation', () => {
    expect(reconciliationModeForState('post_merge_verified', 'spec_migration')).toBe('verification');
    expect(reconciliationModeForState('gates_failed', 'spec_migration')).toBe('candidate');
    expect(reconciliationModeForState('closed', 'spec_migration')).toBeNull();
  });

  it('reuses the latest passed Verification + Formal Version attempt without running gates again', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-verification-reconcile-'));
    roots.push(projectRoot);
    const workItemId = 'WI-0004';
    const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
    const attemptId = 'attempt-0006';
    const attemptPath = join(workItemDir, 'gate_attempts', attemptId);
    const attemptGates = join(attemptPath, 'gates');
    const latestGates = join(workItemDir, 'gates');
    await mkdir(attemptGates, { recursive: true });
    await mkdir(latestGates, { recursive: true });

    for (const gateId of ['verification_gate', 'formal_version_gate'] as const) {
      const body = JSON.stringify(gateReport(workItemId, gateId), null, 2) + '\n';
      await writeFile(join(attemptGates, `${gateId}.json`), body, 'utf-8');
      await writeFile(join(latestGates, `${gateId}.json`), body, 'utf-8');
    }
    const summary = '# Gate Summary\nOverall Status: passed\n';
    await writeFile(join(attemptPath, 'gate_summary.md'), summary, 'utf-8');
    await writeFile(join(workItemDir, 'gate_summary.md'), summary, 'utf-8');
    await writeFile(
      join(attemptPath, 'attempt-result.json'),
      JSON.stringify({
        attempt_id: attemptId,
        work_item_id: workItemId,
        source: 'gate_run',
        summary_status: 'passed',
        completed_at: '2026-08-09T12:00:02.000Z',
      }, null, 2) + '\n',
      'utf-8',
    );
    await writeFile(
      join(attemptPath, 'input-snapshot.json'),
      JSON.stringify({
        schema_version: '1.0',
        attempt_id: attemptId,
        work_item_id: workItemId,
        captured_at: '2026-08-09T12:00:00.000Z',
        inputs: [],
      }, null, 2) + '\n',
      'utf-8',
    );

    const result = await inspectCandidateGateAttemptForReconciliation({
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath: 'spec_migration_path',
      workflowType: 'spec_migration',
      candidatePhase: 'full',
      reconciliationKind: 'verification',
      attemptId,
    });

    expect(result.required_gate_ids).toEqual(['verification_gate', 'formal_version_gate']);
    expect(result.summary_status).toBe('passed');
    expect(result.latest_view_matches).toBe(true);
    expect(result.input_freshness_check).toBe('pass');
  });
});
