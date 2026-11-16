import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { getHandler } from '../../src/tools/ToolDispatcher';
import { setHardStop, checkHardStop } from '../../src/tools/lib/hard-stop-latch';
import '../../src/tools/handlers/sf-hard-stop-resolve';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-recovery-authority-'));
  roots.push(root);
  const resolver = new PersonalPathResolver();
  const sm = new StateManager(resolver, root);
  await sm.initialize();
  await sm.transition('WI-0001', '', 'created', 'test', 'feature_spec');
  const statePath = resolver.resolveStatePath(root);
  const projection = JSON.parse(await readFile(statePath, 'utf8'));
  projection.workItems[0].current_state = 'approved';
  await writeFile(statePath, JSON.stringify(projection));
  const latch = setHardStop(root, 'WI-0001', 'SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN', 'sf_safe_bash');
  const args = {
    work_item_id: 'WI-0001',
    hard_stop_id: latch.hard_stop_id,
    resolution_type: 'operator_error',
    reason: 'Use the controlled read entry without expanding permissions.',
    evidence: ['synthetic tool selection evidence'],
    blocked_action_disposition: 'abandon',
    allowed_next_action: 'read',
    resume_from_step: 'read',
    safe_alternative_tool: 'read',
  };
  return {
    root,
    resolver,
    statePath,
    args,
    context: { directory: root, agent: 'sf-orchestrator' },
    deps: {
      projectManager: { getProjectStateManager: async () => new StateManager(resolver, root) },
    },
  };
}
describe('HardStop resolution consumes WAL authority', () => {
  it('ignores stale projection after a cold StateManager restart and preserves WAL', async () => {
    const f = await fixture();
    const wal = await readFile(f.resolver.resolveEventsPath(f.root));
    const projection = await readFile(f.statePath);
    const result = (await getHandler('sf_hard_stop_resolve')!(
      f.args,
      f.context,
      f.deps as any
    )) as any;
    expect(result.success).toBe(true);
    const entry = JSON.parse(
      (
        await readFile(
          path.join(f.root, '.specforge/work-items/WI-0001/hard_stop_resolution.jsonl'),
          'utf8'
        )
      ).trim()
    );
    expect(entry.authoritative_state_at_resolution).toBe('created');
    expect(await readFile(f.resolver.resolveEventsPath(f.root))).toEqual(wal);
    expect(await readFile(f.statePath)).toEqual(projection);
  });
  for (const condition of ['missing_owner', 'corrupt_history'] as const) {
    it(`retains the latch and writes no resolution for ${condition}`, async () => {
      const f = await fixture();
      if (condition === 'corrupt_history')
        await writeFile(f.resolver.resolveEventsPath(f.root), '{invalid}\n');
      const result = (await getHandler('sf_hard_stop_resolve')!(
        f.args,
        f.context,
        condition === 'missing_owner' ? ({} as any) : (f.deps as any)
      )) as any;
      expect(result.success).toBe(false);
      expect(checkHardStop(f.root, 'WI-0001').blocked).toBe(true);
      await expect(
        readFile(path.join(f.root, '.specforge/work-items/WI-0001/hard_stop_resolution.jsonl'))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  }
});
