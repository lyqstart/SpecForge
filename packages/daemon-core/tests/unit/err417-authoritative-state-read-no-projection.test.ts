import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { readAuthoritativeState } from '../../src/tools/lib/state-coordinator-v11';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function depsFor(sm: StateManager) {
  return {
    projectManager: {
      getProjectStateManager: async () => sm,
    },
  };
}

describe('ERR-417 authoritative nominal read projection side effects', () => {
  it('replays WAL truth without rewriting an existing state.json projection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-err417-existing-'));
    roots.push(root);
    const resolver = new PersonalPathResolver();
    const writer = new StateManager(resolver, root);
    await writer.initialize();
    await writer.transition('WI-ERR417', '', 'created', 'test', 'bugfix');

    const statePath = resolver.resolveStatePath(root);
    const before = await fs.readFile(statePath);
    const reader = new StateManager(resolver, root);
    const result = await readAuthoritativeState({
      deps: depsFor(reader),
      projectRoot: root,
      workItemId: 'WI-ERR417',
    });
    const after = await fs.readFile(statePath);

    expect(result.current_state).toBe('created');
    expect(result.source).toBe('StateManager');
    expect(result.rebuilt_from_events).toBe(true);
    expect(reader.getLastReplayedEventCount()).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it('does not create state.json when no WAL events exist', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-err417-empty-'));
    roots.push(root);
    const resolver = new PersonalPathResolver();
    const statePath = resolver.resolveStatePath(root);
    const eventsPath = resolver.resolveEventsPath(root);
    const reader = new StateManager(resolver, root);

    await expect(fs.access(statePath)).rejects.toBeTruthy();
    await expect(fs.access(eventsPath)).rejects.toBeTruthy();
    const result = await readAuthoritativeState({
      deps: depsFor(reader),
      projectRoot: root,
      workItemId: 'WI-MISSING',
    });

    expect(result.current_state).toBeNull();
    expect(result.source).toBe('missing');
    expect(result.rebuilt_from_events).toBe(false);
    expect(reader.getLastReplayedEventCount()).toBe(0);
    await expect(fs.access(statePath)).rejects.toBeTruthy();
    await expect(fs.access(eventsPath)).rejects.toBeTruthy();
  });
});
