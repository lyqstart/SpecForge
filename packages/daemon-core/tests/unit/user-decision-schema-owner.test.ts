import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createUserDecisionSchemaDescriptor,
  invalidateUserDecision,
  recordUserDecision,
  validateCurrentUserDecisionJson,
} from '../../src/tools/lib/user-decision-recorder-v11';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createWorkItem(workItemId = 'WI-7001'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-user-decision-owner-'));
  roots.push(root);
  const workItemDir = join(root, workItemId);
  await mkdir(join(workItemDir, 'candidates'), { recursive: true });
  await writeFile(
    join(workItemDir, 'candidate_manifest.json'),
    JSON.stringify({ schema_version: '1.0', work_item_id: workItemId }) + '\n',
    'utf8',
  );
  await writeFile(join(workItemDir, 'gate_summary.md'), '# Gate Summary\n', 'utf8');
  return workItemDir;
}

function validDecision(workItemId = 'WI-7001') {
  return {
    schema_version: '1.0',
    decision_id: `UD-${workItemId}-1`,
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    candidate_manifest_path: 'candidate_manifest.json',
    manifest_hash: 'sha256:manifest',
    candidate_hash: 'sha256:candidate',
    gate_summary_path: 'gate_summary.md',
    gate_summary_hash: 'sha256:gate',
    decision_status: 'approved',
    decision_type: 'user_approved',
    decided_by: 'user',
    decided_at: '2026-09-05T00:00:00.000Z',
    decision_scope: 'full',
    waivers: [],
    recorded_by: 'sf-orchestrator',
    recorder_role: 'user_decision_recorder',
    recorded_at: '2026-09-05T00:00:00.000Z',
    user_response_quote: '同意当前候选',
  };
}

describe('User Decision persistent-file owner', () => {
  it('exposes one exact current contract bound to the Work Item identity', () => {
    expect(validateCurrentUserDecisionJson(JSON.stringify(validDecision()), 'WI-7001')).toMatchObject({
      valid: true,
      errors: [],
    });
    expect(validateCurrentUserDecisionJson(JSON.stringify(validDecision('WI-OTHER')), 'WI-7001').valid)
      .toBe(false);
  });

  it('registers schema 1.0 with no invented compatibility transition', () => {
    expect(createUserDecisionSchemaDescriptor('WI-7001')).toMatchObject({
      owner: '@specforge/daemon-core/user-decision-recorder',
      relativePath: 'user_decision.json',
      required: false,
      currentSchemaId: '1.0',
      transitions: [],
    });
  });

  it('does not overwrite an existing decision with an unknown schema', async () => {
    const workItemDir = await createWorkItem();
    const decisionPath = join(workItemDir, 'user_decision.json');
    const original = JSON.stringify({ ...validDecision(), schema_version: '1.1' }) + '\n';
    await writeFile(decisionPath, original, 'utf8');

    await expect(recordUserDecision({
      workItemDir,
      workItemId: 'WI-7001',
      workflowPath: 'requirement_change_path',
      baseSpecVersion: 'PSV-0001',
      candidateManifestPath: 'candidate_manifest.json',
      gateSummaryPath: 'gate_summary.md',
      decisionStatus: 'approved',
      decisionType: 'user_approved',
      decidedBy: 'user',
      decisionScope: 'full',
    })).rejects.toThrow(/USER_DECISION_SCHEMA_BLOCKED.*CHAIN_GAP/);

    expect(await readFile(decisionPath, 'utf8')).toBe(original);
  });

  it('does not invalidate an existing decision with an unknown schema', async () => {
    const workItemDir = await createWorkItem();
    const decisionPath = join(workItemDir, 'user_decision.json');
    const original = JSON.stringify({ ...validDecision(), schema_version: '1.1' }) + '\n';
    await writeFile(decisionPath, original, 'utf8');

    await expect(invalidateUserDecision(workItemDir, 'candidate changed'))
      .rejects.toThrow(/USER_DECISION_SCHEMA_BLOCKED.*CHAIN_GAP/);
    expect(await readFile(decisionPath, 'utf8')).toBe(original);
  });
});
