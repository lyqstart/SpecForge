import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readAuthoritativeWorkItems } from '../../src/tools/lib/authoritative-work-items';

describe('authoritative work item response boundary', () => {
  const roots: string[] = [];
  afterEach(async () => { for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('sf-state-reader-')) throw new Error('UNOWNED_TEST_ROOT');
    await fs.rm(root, { recursive: true, force: true });
  } });
  it('replays before reading and preserves both owner receivers', async () => {
    const trace: string[] = [];
    const state = { work_item_id: 'WI-0001', current_state: 'closed', workflow_type: 'feature_spec', created_at: 1, updated_at: 2 };
    const manager = {
      async rebuildState(): Promise<void> { expect(this).toBe(manager); trace.push('replay'); },
      listWorkItems(): typeof state[] { expect(this).toBe(manager); trace.push('list'); return [state]; },
    };
    const owner = { getProjectStateManager(): typeof manager { expect(this).toBe(owner); return manager; } };
    expect(await readAuthoritativeWorkItems({ projectManager: owner }, 'synthetic')).toEqual([state]);
    expect(trace).toEqual(['replay', 'list']);
  });
  it('retains keyed legacy string and record state ports', async () => {
    const manager = { getAllStates: () => ({ 'WI-0001': 'closed', 'WI-0002': { current_state: 'implementation_running', marker: 'owner' } }) };
    expect(await readAuthoritativeWorkItems({ projectManager: { getProjectStateManager: () => manager } }, 'synthetic')).toEqual([
      { work_item_id: 'WI-0001', current_state: 'closed' },
      { work_item_id: 'WI-0002', current_state: 'implementation_running', marker: 'owner' },
    ]);
  });
  it('uses directory names only as candidates for the existing owner point-read port', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-state-reader-')); roots.push(root);
    const directory = path.join(root, '.specforge', 'work-items');
    for (const id of ['WI-0001', 'WI-0002']) await fs.mkdir(path.join(directory, id), { recursive: true });
    await fs.writeFile(path.join(directory, 'WI-0001', 'state.json'), '{"current_state":"FORGED_PROJECTION"}');
    const manager = { getState(id: string): string | null { expect(this).toBe(manager); return id === 'WI-0001' ? 'closed' : null; } };
    expect(await readAuthoritativeWorkItems({ projectManager: { getProjectStateManager: () => manager } }, root)).toEqual([{ work_item_id: 'WI-0001', current_state: 'closed' }]);
  });
  it('rejects malformed authoritative responses instead of selecting a weaker fallback', async () => {
    for (const invalid of [null, {}, [null], [{ work_item_id: 'WI-0001', current_state: {} }]]) {
      const fallback = vi.fn(() => ({ 'WI-0001': 'closed' }));
      const manager = { listWorkItems: () => invalid, getAllStates: fallback };
      await expect(readAuthoritativeWorkItems({ projectManager: { getProjectStateManager: () => manager } }, 'synthetic')).rejects.toThrow('AUTHORITATIVE_STATE_INVALID');
      expect(fallback).not.toHaveBeenCalled();
    }
  });
  it('rejects a missing owner without inferring state', async () => {
    await expect(readAuthoritativeWorkItems({}, 'synthetic')).rejects.toThrow('AUTHORITATIVE_STATE_UNAVAILABLE');
  });
});
