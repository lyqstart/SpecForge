import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../src/tools/handlers/sf-v11-decision.js';
import '../../src/tools/handlers/sf-v11-gate-run.js';
import '../../src/tools/handlers/sf-v11-merge.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createUnknownDecisionFixture(workItemId: string): Promise<{
  projectRoot: string;
  workItemDir: string;
  decisionPath: string;
  original: string;
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-user-decision-boundary-'));
  roots.push(projectRoot);
  const workItemDir = join(projectRoot, '.specforge', 'work-items', workItemId);
  await mkdir(workItemDir, { recursive: true });
  await writeFile(join(workItemDir, 'work_item.json'), JSON.stringify({
    schema_version: '1.1',
    work_item_id: workItemId,
    workflow_type: 'feature_spec',
    workflow_path: 'requirement_change_path',
  }) + '\n');
  const decisionPath = join(workItemDir, 'user_decision.json');
  const original = JSON.stringify({
    schema_version: '1.1',
    work_item_id: workItemId,
    decision_status: 'approved',
  }) + '\n';
  await writeFile(decisionPath, original);
  return { projectRoot, workItemDir, decisionPath, original };
}

function stateDeps(currentState: string) {
  return {
    projectManager: {
      getProjectStateManager: vi.fn().mockResolvedValue({
        rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
        getState: vi.fn().mockResolvedValue({ current_state: currentState }),
      }),
    },
  };
}

describe('User Decision public schema boundaries', () => {
  it('Decision Recorder does not overwrite an unknown existing schema', async () => {
    const fixture = await createUnknownDecisionFixture('WI-7201');
    const result = await getHandler('sf_v11_decision')!(
      {
        work_item_id: 'WI-7201',
        decision_status: 'approved',
        decision_type: 'user_approved',
        user_response_quote: '同意',
      },
      { directory: fixture.projectRoot, agent: 'sf-orchestrator' },
      stateDeps('approval_required') as any,
    );
    expect(result).toMatchObject({
      success: false,
      error: 'USER_DECISION_SCHEMA_BLOCKED: SCHEMA_VERSION_MISMATCH: user_decision.json',
    });
    expect(await readFile(fixture.decisionPath, 'utf8')).toBe(fixture.original);
  });

  it('Merge Runner rejects an unknown decision before producing a report', async () => {
    const fixture = await createUnknownDecisionFixture('WI-7202');
    const result = await getHandler('sf_v11_merge')!(
      { work_item_id: 'WI-7202' },
      { directory: fixture.projectRoot, agent: 'sf-orchestrator' },
      {} as any,
    );
    expect(result).toMatchObject({
      success: false,
      error: 'USER_DECISION_SCHEMA_BLOCKED: SCHEMA_VERSION_MISMATCH: user_decision.json',
    });
    expect(await readFile(fixture.decisionPath, 'utf8')).toBe(fixture.original);
  });

  it('Gate Runner rejects an unknown decision before creating a gate attempt', async () => {
    const fixture = await createUnknownDecisionFixture('WI-7203');
    const result = await getHandler('sf_v11_gate_run')!(
      { work_item_id: 'WI-7203', gate_ids: ['merge_ready_gate'] },
      { directory: fixture.projectRoot, agent: 'sf-orchestrator' },
      stateDeps('approved') as any,
    );
    expect(result).toMatchObject({
      success: false,
      error: 'USER_DECISION_SCHEMA_BLOCKED: SCHEMA_VERSION_MISMATCH: user_decision.json',
    });
    expect(await readFile(fixture.decisionPath, 'utf8')).toBe(fixture.original);
    await expect(readFile(join(fixture.workItemDir, 'gates', 'attempts', 'index.json'), 'utf8'))
      .rejects.toBeTruthy();
  });
});
