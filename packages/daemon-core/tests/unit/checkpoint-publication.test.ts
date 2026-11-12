import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { WAL } from '../../src/wal';

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

let project: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  vi.mocked(fs.writeFile).mockImplementation(actual.writeFile);
  vi.mocked(fs.rename).mockImplementation(actual.rename);
  if (project) await fs.rm(project, { recursive: true, force: true });
});

it('retains the previous checkpoint and replays the committed event after publication fails', async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-checkpoint-failure-'));
  const resolver = new PersonalPathResolver();
  const manager = new StateManager(resolver, project);
  await manager.initialize();
  const statePath = path.join(path.dirname(manager.getWal().getEventsPath()), 'state.json');
  const before = await fs.readFile(statePath);
  vi.mocked(fs.rename).mockRejectedValueOnce(new Error('CHECKPOINT_PUBLICATION_FAILED'));
  await expect(manager.transition('WI-FAILURE', '', 'created', 'test')).rejects.toThrow(
    'CHECKPOINT_PUBLICATION_FAILED'
  );
  expect(await fs.readFile(statePath)).toEqual(before);
  expect((await fs.readdir(path.dirname(statePath))).filter(name => name.endsWith('.tmp'))).toEqual(
    []
  );
  const cold = new StateManager(resolver, project);
  await cold.rebuildState();
  expect((await cold.getState('WI-FAILURE'))?.current_state).toBe('created');
  expect((await cold.getWal().readAllEvents()).events).toHaveLength(1);
});

it('still rejects a malformed persisted checkpoint instead of ignoring its witness', async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-checkpoint-corrupt-'));
  const manager = new StateManager(new PersonalPathResolver(), project);
  await manager.initialize();
  const wal = manager.getWal();
  await fs.writeFile(path.join(path.dirname(wal.getEventsPath()), 'state.json'), '{');
  await expect(new WAL(wal.getEventsPath()).readAllEvents()).rejects.toBeInstanceOf(SyntaxError);
});

it('keeps a complete checkpoint visible while the next checkpoint bytes are being written', async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-checkpoint-publication-'));
  const resolver = new PersonalPathResolver();
  const manager = new StateManager(resolver, project);
  await manager.initialize();
  // Obtain the production WAL path without duplicating runtime layout constants.
  const wal = manager.getWal();
  const statePath = path.join(path.dirname(wal.getEventsPath()), 'state.json');
  const before = await fs.readFile(statePath, 'utf8');
  const original = (await vi.importActual<typeof import('fs/promises')>('fs/promises')).writeFile;
  let reached!: () => void;
  let release!: () => void;
  const writing = new Promise<void>(resolve => {
    reached = resolve;
  });
  const resume = new Promise<void>(resolve => {
    release = resolve;
  });
  vi.mocked(fs.writeFile).mockImplementation(async (file, data, options) => {
    if (
      typeof file === 'string' &&
      path.dirname(file) === path.dirname(statePath) &&
      path.basename(file).startsWith('state.json')
    ) {
      await original(file, '', options);
      reached();
      await resume;
      // The first write has already created an exclusive temporary file.
      return original(file, data, 'utf8');
    }
    return original(file, data, options);
  });
  const pending = manager.transition('WI-CHECKPOINT', '', 'created', 'test');
  try {
    await writing;
    await expect(new WAL(wal.getEventsPath()).readAllEvents()).resolves.toMatchObject({
      events: [expect.objectContaining({ action: 'state.transition' })],
    });
    expect(await fs.readFile(statePath, 'utf8')).toBe(before);
  } finally {
    release();
    await pending;
  }
  const cold = new StateManager(resolver, project);
  await cold.rebuildState();
  expect((await cold.getState('WI-CHECKPOINT'))?.current_state).toBe('created');
});
