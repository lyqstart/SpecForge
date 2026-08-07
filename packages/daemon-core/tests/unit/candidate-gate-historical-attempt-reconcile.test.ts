import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectCandidateGateAttemptForReconciliation,
} from '../../src/tools/handlers/sf-v11-gate-run';

const roots: string[] = [];

const GATE_IDS = [
  'entry_gate',
  'workflow_selection_gate',
  'schema_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'spec_consistency_gate',
  'contract_integrity_gate',
  'workflow_specific_gate',
  'trace_gate',
] as const;

function report(workItemId: string, gateId: (typeof GATE_IDS)[number], inputFile: string) {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: gateId,
    gate_type:
      gateId === 'spec_consistency_gate' || gateId === 'trace_gate'
        ? 'soft_gate'
        : 'hard_gate',
    required: true,
    status: 'passed',
    input_files: [inputFile],
    checks: [{ check_id: `${gateId}_ok`, description: 'ok', passed: true }],
    blocking_issues: [],
    warnings: [],
    waiver_allowed: gateId === 'spec_consistency_gate' || gateId === 'trace_gate',
    waiver_required: false,
    waiver_ids: [],
    started_at: '2026-08-07T02:29:43.000Z',
    finished_at: '2026-08-07T02:29:43.500Z',
    runner: 'gate_runner',
  };
}

async function fixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-attempt-reconcile-'));
  roots.push(projectRoot);
  const workItemId = 'WI-0002';
  const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
  const attemptRoot = join(workItemDir, 'gate_attempts');
  const attemptDir = join(attemptRoot, 'attempt-0003');
  const attemptGates = join(attemptDir, 'gates');
  const latestGates = join(workItemDir, 'gates');
  const candidateDir = join(workItemDir, 'candidates');

  await mkdir(join(attemptRoot, 'attempt-0001'), { recursive: true });
  await mkdir(join(attemptRoot, 'attempt-0002'), { recursive: true });
  await mkdir(attemptGates, { recursive: true });
  await mkdir(latestGates, { recursive: true });
  await mkdir(candidateDir, { recursive: true });

  const inputFile = join(candidateDir, 'trace_delta.md');
  await writeFile(inputFile, '# trace\n', 'utf-8');
  await utimes(
    inputFile,
    new Date('2026-08-07T02:00:00.000Z'),
    new Date('2026-08-07T02:00:00.000Z'),
  );

  for (const gateId of GATE_IDS) {
    const content = JSON.stringify(report(workItemId, gateId, inputFile), null, 2);
    await writeFile(join(attemptGates, `${gateId}.json`), content, 'utf-8');
    await writeFile(join(latestGates, `${gateId}.json`), content, 'utf-8');
  }

  const summary = [
    '# Gate Summary',
    '',
    `Work Item: ${workItemId}`,
    'Overall Status: passed',
    'Generated: 2026-08-07T02:29:43.604Z',
    '',
  ].join('\n');
  await writeFile(join(attemptDir, 'gate_summary.md'), summary, 'utf-8');
  await writeFile(join(workItemDir, 'gate_summary.md'), summary, 'utf-8');
  await writeFile(
    join(attemptDir, 'attempt-result.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        attempt_id: 'attempt-0003',
        work_item_id: workItemId,
        source: 'gate_run',
        completed_at: '2026-08-07T02:29:43.606Z',
        current_report_gate_ids: GATE_IDS,
        summary_report_gate_ids: GATE_IDS,
        summary_status: 'passed',
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { projectRoot, workItemId, workItemDir, latestGates, inputFile };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('historical Candidate Gate Attempt reconciliation', () => {
  it('accepts the latest immutable passed Candidate Attempt with matching latest view', async () => {
    const fx = await fixture();
    const result = await inspectCandidateGateAttemptForReconciliation({
      projectRoot: fx.projectRoot,
      workItemId: fx.workItemId,
      workItemDir: fx.workItemDir,
      workflowPath: 'architecture_change_path',
      workflowType: 'architecture_change',
      candidatePhase: 'full',
      attemptId: 'attempt-0003',
    });
    expect(result.attempt_id).toBe('attempt-0003');
    expect(result.summary_status).toBe('passed');
    expect(result.reports).toHaveLength(10);
    expect(result.required_gate_ids).toHaveLength(10);
    expect(result.latest_view_matches).toBe(true);
    expect(result.input_freshness_check).toBe('pass');
  });

  it('fails closed when the requested Attempt is not the latest', async () => {
    const fx = await fixture();
    await mkdir(join(fx.workItemDir, 'gate_attempts', 'attempt-0004'), { recursive: true });
    await expect(
      inspectCandidateGateAttemptForReconciliation({
        projectRoot: fx.projectRoot,
        workItemId: fx.workItemId,
        workItemDir: fx.workItemDir,
        workflowPath: 'architecture_change_path',
        workflowType: 'architecture_change',
        candidatePhase: 'full',
        attemptId: 'attempt-0003',
      }),
    ).rejects.toThrow('RECONCILE_ATTEMPT_NOT_LATEST');
  });

  it('fails closed when latest compatibility evidence diverges', async () => {
    const fx = await fixture();
    await writeFile(
      join(fx.latestGates, 'contract_integrity_gate.json'),
      JSON.stringify({ changed: true }),
      'utf-8',
    );
    await expect(
      inspectCandidateGateAttemptForReconciliation({
        projectRoot: fx.projectRoot,
        workItemId: fx.workItemId,
        workItemDir: fx.workItemDir,
        workflowPath: 'architecture_change_path',
        workflowType: 'architecture_change',
        candidatePhase: 'full',
        attemptId: 'attempt-0003',
      }),
    ).rejects.toThrow('RECONCILE_LATEST_GATE_VIEW_MISMATCH');
  });

  it('fails closed when a Gate input changed after the Attempt', async () => {
    const fx = await fixture();
    await utimes(
      fx.inputFile,
      new Date('2026-08-07T03:10:00.000Z'),
      new Date('2026-08-07T03:10:00.000Z'),
    );
    await expect(
      inspectCandidateGateAttemptForReconciliation({
        projectRoot: fx.projectRoot,
        workItemId: fx.workItemId,
        workItemDir: fx.workItemDir,
        workflowPath: 'architecture_change_path',
        workflowType: 'architecture_change',
        candidatePhase: 'full',
        attemptId: 'attempt-0003',
      }),
    ).rejects.toThrow('RECONCILE_GATE_INPUT_CHANGED_AFTER_ATTEMPT');
  });

  it('places reconciliation before runRequiredGates and exposes the user-level schema', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const handler = await readFile(
      join(repoRoot, 'packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts'),
      'utf-8',
    );
    const wrapper = await readFile(
      join(repoRoot, 'setup/userlevel-opencode/tools/sf_gate_run.ts'),
      'utf-8',
    );

    expect(handler.indexOf("args['reconcile_attempt_id']")).toBeGreaterThan(0);
    expect(handler.indexOf('await runRequiredGates(')).toBeGreaterThan(
      handler.indexOf("args['reconcile_attempt_id']"),
    );
    expect(handler).toContain("gate_run_action: 'NOT_PERFORMED'");
    expect(handler).toContain('new_gate_attempt_created: false');
    expect(wrapper).toContain('reconcile_attempt_id');
    expect(wrapper).toContain('不会重新执行 Gate');
  });

  it('pins authority and ledger synchronization', async () => {
    const repoRoot = join(import.meta.dirname, '../../../..');
    const authority = await readFile(
      join(repoRoot, 'docs/design/SpecForge架构一致性治理最终实施方案.md'),
      'utf-8',
    );
    const ledger = await readFile(
      join(repoRoot, 'docs/rule/specforge-development-error-ledger-and-experience.md'),
      'utf-8',
    );
    expect(authority).toContain('GATE-ATTEMPT-RECONCILE-001');
    for (const token of ['ERR-182', 'ERR-183', 'ERR-184', 'EXP-154', 'EXP-155', 'EXP-156']) {
      expect(ledger).toContain(token);
    }
  });
});
