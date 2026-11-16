import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';
import { WAL } from '../../src/wal/WAL';

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    open: vi.fn(actual.open),
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
  };
});

let project: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (project) {
    expect(path.dirname(project)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(project)).toMatch(/^sf-checkpoint-reader-/);
    await fs.rm(project, { recursive: true, force: true });
  }
});

it('waits for an actual WAL checkpoint reader to close before publishing its replacement', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-checkpoint-reader-'));
  const manager = new StateManager(new PersonalPathResolver(), project);
  await manager.initialize();
  const eventsPath = manager.getWal().getEventsPath();
  const checkpoint = path.join(path.dirname(eventsPath), 'state.json');
  let writing!: () => void, resumeWrite!: () => void, reading!: () => void, resumeRead!: () => void;
  const writeReached = new Promise<void>(r => {
    writing = r;
  });
  const writeResume = new Promise<void>(r => {
    resumeWrite = r;
  });
  const readReached = new Promise<void>(r => {
    reading = r;
  });
  const readResume = new Promise<void>(r => {
    resumeRead = r;
  });
  let synced!: () => void;
  const syncReached = new Promise<void>(r => {
    synced = r;
  });
  let held = false,
    armed = false,
    overlap = false;
  vi.mocked(fs.open).mockImplementation(async (file, flags, mode) => {
    const handle = await actual.open(file, flags, mode);
    if (typeof file === 'string' && file.startsWith(checkpoint + '.') && file.endsWith('.tmp')) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        synced();
      };
    }
    return handle;
  });
  vi.mocked(fs.writeFile).mockImplementation(async (file, data, options) => {
    await actual.writeFile(file, data, options);
    if (typeof file === 'string' && file.startsWith(checkpoint + '.') && file.endsWith('.tmp')) {
      writing();
      await writeResume;
    }
  });
  vi.mocked(fs.readFile).mockImplementation(async (file, options) => {
    if (armed && file === checkpoint) {
      armed = false;
      const handle = await actual.open(checkpoint, 'r');
      try {
        const bytes = await handle.readFile(options as BufferEncoding);
        held = true;
        reading();
        await readResume;
        return bytes;
      } finally {
        await handle.close();
        held = false;
      }
    }
    return actual.readFile(file, options);
  });
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    if (to === checkpoint && held) overlap = true;
    return actual.rename(from, to);
  });
  // Attach rejection handling immediately; retain the actual error for the assertion.
  const publication = manager.transition('WI-READER', '', 'created', 'test').then(
    () => ({ success: true as const }),
    error => ({ success: false as const, error: String(error) })
  );
  await writeReached;
  armed = true;
  const reader = new WAL(eventsPath).readAllEvents();
  try {
    await readReached;
    resumeWrite();
    await syncReached;
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    resumeRead();
    resumeWrite();
  }
  await expect(reader).resolves.toMatchObject({
    events: [expect.objectContaining({ action: 'state.transition' })],
  });
  expect(await publication).toEqual({ success: true });
  expect(overlap).toBe(false);
  const cold = new StateManager(new PersonalPathResolver(), project);
  await cold.rebuildState();
  expect(cold.getState('WI-READER')?.current_state).toBe('created');
});
