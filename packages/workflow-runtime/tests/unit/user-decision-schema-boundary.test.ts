import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowEngine } from '../../src/WorkflowEngine.js';
import { currentUserDecision } from '../helpers/current-user-decision.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function workItemDir(workItemId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-workflow-user-decision-'));
  roots.push(root);
  const dir = join(root, workItemId);
  await import('node:fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));
  return dir;
}

describe('WorkflowEngine User Decision schema boundary', () => {
  it('accepts an exact current approved decision', async () => {
    const workItemId = 'WI-7101';
    const dir = await workItemDir(workItemId);
    await writeFile(
      join(dir, 'user_decision.json'),
      JSON.stringify(currentUserDecision(workItemId)) + '\n',
    );

    await expect(new WorkflowEngine().enforceTransitionEvidencePublic('merge_ready', dir))
      .resolves.toBeUndefined();
  });

  it('fails closed on an unknown schema without modifying the decision', async () => {
    const workItemId = 'WI-7102';
    const dir = await workItemDir(workItemId);
    const decisionPath = join(dir, 'user_decision.json');
    const original = JSON.stringify({
      ...currentUserDecision(workItemId),
      schema_version: '1.1',
    }) + '\n';
    await writeFile(decisionPath, original);

    await expect(new WorkflowEngine().enforceTransitionEvidencePublic('merge_ready', dir))
      .rejects.toThrow(/USER_DECISION_SCHEMA_BLOCKED.*CHAIN_GAP/);
    expect(await readFile(decisionPath, 'utf8')).toBe(original);
  });
});
