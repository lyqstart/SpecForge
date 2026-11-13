import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-contract-register';
import { ensureProjectInit } from '../../src/tools/lib/sf_project_init_core';
import {
  createWorkItem,
  initializeClosureFiles,
} from '../../src/tools/lib/work-item-lifecycle-v11';
import { setHardStop } from '../../src/tools/lib/hard-stop-latch';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { transitionWithEvidence } from '../../src/tools/lib/state-coordinator-v11';

describe('real lifecycle bootstrap to current Contract registration', () => {
  let root: string, wi: string, state: string;
  const id = 'WI-0001';
  const entry = {
    id: 'OrderStatus',
    owner_module: 'CORE',
    value_type: 'string',
    values: ['new', 'done'],
  };
  const handler = getHandler('sf_contract_register')!;
  const invoke = () =>
    handler(
      { work_item_id: id, action: 'add', kind: 'shared_enum', entry },
      { directory: root, agent: 'sf-orchestrator' },
      {
        projectManager: { getProjectStateManager: async () => ({ getState: async () => state }) },
      } as any
    ) as Promise<any>;
  async function manifest() {
    return JSON.parse(await fs.readFile(path.join(wi, 'candidate_manifest.json'), 'utf8'));
  }
  async function oldBootstrap() {
    const value = await manifest();
    delete value.workflow_type;
    await fs.writeFile(
      path.join(wi, 'candidate_manifest.json'),
      JSON.stringify(value, null, 2) + '\n'
    );
  }
  async function snapshot() {
    const result: Record<string, string> = {};
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else result[path.relative(root, p)] = (await fs.readFile(p)).toString('base64');
      }
    }
    await walk(root);
    return result;
  }
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-bootstrap-contract-'));
    await ensureProjectInit(root, 'Synthetic bootstrap Contract regression', {
      ensureHostProfile: async () => {},
    });
    wi = await createWorkItem({
      projectRoot: root,
      workItemId: id,
      userRequest: 'Synthetic new project contracts',
      workflowType: 'feature_spec',
      workflowPath: 'requirement_change_path',
    });
    await initializeClosureFiles(wi, id, 'requirement_change_path', 'PSV-0001');
    state = 'candidate_preparing';
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  it('registers through the production handler after actual lifecycle initialization', async () => {
    expect((await manifest()).workflow_type).toBe('feature_spec');
    expect((await invoke()).success).toBe(true);
    expect((await manifest()).entries).toHaveLength(1);
  });
  it('materializes only an exact old bootstrap, preserving original bytes and formal Registry', async () => {
    await oldBootstrap();
    const old = await fs.readFile(path.join(wi, 'candidate_manifest.json'));
    const live = await fs.readFile(path.join(root, '.specforge/project/extension_registry.json'));
    expect((await invoke()).success).toBe(true);
    expect((await manifest()).workflow_type).toBe('feature_spec');
    const names = await fs.readdir(path.join(wi, 'candidate_manifest_bootstrap_history'));
    expect(names).toHaveLength(1);
    expect(
      await fs.readFile(path.join(wi, 'candidate_manifest_bootstrap_history', names[0]!))
    ).toEqual(old);
    expect(
      await fs.readFile(path.join(root, '.specforge/project/extension_registry.json'))
    ).toEqual(live);
  });
  it.each(['blocked', 'candidate_prepared', 'approval_required', 'closed'])(
    'does not normalize in %s',
    async value => {
      await oldBootstrap();
      state = value;
      const before = await snapshot();
      expect((await invoke()).success).toBe(false);
      expect(await snapshot()).toEqual(before);
    }
  );
  it.each([
    { workflow_type: 'contract_change' },
    { workflow_type: null },
    { workflow_path: 'design_change_path' },
    { base_spec_version: 'PSV-9999' },
    { candidate_phase: 'full' },
    { unexpected: true },
    { merge_required: false },
    { entries: [{ candidate_path: 'candidates/a.md', target_path: '.specforge/project/a.md' }] },
  ])('rejects conflicting or non-bootstrap identity without writes: %j', async change => {
    await oldBootstrap();
    const value = { ...(await manifest()), ...change };
    await fs.writeFile(path.join(wi, 'candidate_manifest.json'), JSON.stringify(value));
    const before = await snapshot();
    expect((await invoke()).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
  it('preserves HardStop and refuses normalization', async () => {
    await oldBootstrap();
    setHardStop(root, id, 'synthetic refusal', 'sf_safe_bash');
    const before = await snapshot();
    expect((await invoke()).hard_stop).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
  it.each([false, true])('handles an existing immutable archive (tampered=%s)', async tampered => {
    await oldBootstrap();
    const bytes = await fs.readFile(path.join(wi, 'candidate_manifest.json'));
    const folder = path.join(wi, 'candidate_manifest_bootstrap_history');
    await fs.mkdir(folder);
    await fs.writeFile(
      path.join(folder, createHash('sha256').update(bytes).digest('hex') + '.json'),
      tampered ? 'tampered' : bytes
    );
    const before = await snapshot();
    const result = await invoke();
    expect(result.success).toBe(!tampered);
    if (tampered) expect(await snapshot()).toEqual(before);
  });
  it('refuses a linked history directory without modifying its target', async () => {
    await oldBootstrap();
    const target = path.join(root, 'external-history');
    await fs.mkdir(target);
    await fs.symlink(
      target,
      path.join(wi, 'candidate_manifest_bootstrap_history'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    expect((await invoke()).success).toBe(false);
    expect(await fs.readdir(target)).toEqual([]);
    expect((await manifest()).workflow_type).toBeUndefined();
  });
  it('uses the existing state owner recovery edge, keeps blocked history, and then registers the old bootstrap', async () => {
    await oldBootstrap();
    const sm = new StateManager(new PersonalPathResolver(), root);
    await sm.initialize();
    await sm.transition(
      id,
      '',
      'candidate_preparing',
      'synthetic-upstream-fixture',
      'feature_spec'
    );
    await sm.transition(id, 'candidate_preparing', 'blocked', 'sf-orchestrator', 'feature_spec');
    const blocking = await sm.readLastWorkItemTransition(id);
    const input = {
      projectRoot: root,
      workItemDir: wi,
      workItemId: id,
      fromState: 'blocked',
      toState: 'candidate_preparing',
      workflowType: 'feature_spec',
      actorRole: 'sf-orchestrator',
      evidence: 'Synthetic qualified bootstrap repair',
      transitionContext: { source: 'sf_state_transition' },
      deps: { projectManager: { getProjectStateManager: async () => sm } },
    };
    expect((await transitionWithEvidence(input)).advanced).toBe(true);
    const result = (await handler(
      { work_item_id: id, action: 'add', kind: 'shared_enum', entry },
      { directory: root, agent: 'sf-orchestrator' },
      input.deps as any
    )) as any;
    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(root, '.specforge/runtime/events.jsonl'), 'utf8')).toContain(
      blocking!.eventId
    );
    await expect(transitionWithEvidence(input)).rejects.toThrow('Optimistic lock');
    expect(
      JSON.parse(await fs.readFile(path.join(wi, 'work_item.json'), 'utf8')).code_change_allowed
    ).toBe(false);
  });
});
