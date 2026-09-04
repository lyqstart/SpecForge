import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { StateManager } from '../../src/state/StateManager';
import { WAL } from '../../src/wal/WAL';
import type { IPathResolver } from '../../src/daemon/path-resolver';
import { RUNTIME_SCHEMA_DESCRIPTORS } from '../../src/state/runtime-schema-descriptors';

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

class RuntimePathResolver implements IPathResolver {
  constructor(private readonly runtimeRoot: string) {}

  resolveProjectRuntimeDir(): string { return this.runtimeRoot; }
  resolveStatePath(): string { return join(this.runtimeRoot, 'state.json'); }
  resolveEventsPath(): string { return join(this.runtimeRoot, 'events.jsonl'); }
  resolveSessionsDir(): string { return join(this.runtimeRoot, 'sessions'); }
  resolveDaemonRuntimeDir(): string { return this.runtimeRoot; }
  resolveHandshakePath(): string { return join(this.runtimeRoot, 'handshake.json'); }
  resolveDaemonJsonPath(): string { return join(this.runtimeRoot, 'daemon.json'); }
  resolveDaemonStatePath(): string { return join(this.runtimeRoot, 'state.json'); }
  resolveDaemonEventsPath(): string { return join(this.runtimeRoot, 'events.jsonl'); }
}

describe('current Runtime persistence boundary', () => {
  let root: string;
  let resolver: RuntimePathResolver;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'specforge-current-runtime-schema-'));
    resolver = new RuntimePathResolver(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('declares optional exact-schema owners for checkpoint and WAL', () => {
    expect(RUNTIME_SCHEMA_DESCRIPTORS.map((descriptor) => ({
      id: descriptor.id,
      relativePath: descriptor.relativePath,
      format: descriptor.format,
      required: descriptor.required,
      schema: descriptor.currentSchemaId,
    }))).toEqual([
      {
        id: 'runtime-checkpoint',
        relativePath: 'state.json',
        format: 'json',
        required: false,
        schema: '1.0',
      },
      {
        id: 'runtime-wal',
        relativePath: 'events.jsonl',
        format: 'jsonl',
        required: false,
        schema: '1.0',
      },
    ]);
  });

  it('writes the authoritative checkpoint schema field without persisting an empty WAL', async () => {
    const manager = new StateManager(resolver, 'project-root');
    await manager.initialize();

    const checkpoint = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'));
    expect(checkpoint.schema_version).toBe('1.0');
    expect(checkpoint).not.toHaveProperty('schemaVersion');
    expect(await exists(join(root, 'events.jsonl'))).toBe(false);
  });

  it('fails closed on an existing empty WAL before overwriting Runtime state', async () => {
    await writeFile(join(root, 'events.jsonl'), '');
    const manager = new StateManager(resolver, 'project-root');

    await expect(manager.initialize()).rejects.toThrow('RUNTIME_SCHEMA_PRECHECK_BLOCKED');
    expect(await readFile(join(root, 'events.jsonl'), 'utf8')).toBe('');
    expect(await exists(join(root, 'state.json'))).toBe(false);
  });

  it('fails closed on corrupt WAL bytes instead of skipping them', async () => {
    const corrupt = 'THIS IS NOT JSON\n';
    await writeFile(join(root, 'events.jsonl'), corrupt);
    const manager = new StateManager(resolver, 'project-root');

    await expect(manager.initialize()).rejects.toThrow('RUNTIME_SCHEMA_PRECHECK_BLOCKED');
    expect(await readFile(join(root, 'events.jsonl'), 'utf8')).toBe(corrupt);
    expect(await exists(join(root, 'state.json'))).toBe(false);
  });

  it('fails closed on a corrupt checkpoint instead of treating it as version zero', async () => {
    const corrupt = '{not-json';
    await writeFile(join(root, 'state.json'), corrupt);
    const manager = new StateManager(resolver, 'project-root');

    await expect(manager.initialize()).rejects.toThrow('RUNTIME_SCHEMA_PRECHECK_BLOCKED');
    expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(corrupt);
    expect(await exists(join(root, 'events.jsonl'))).toBe(false);
  });

  it('makes direct WAL reads fail closed on corrupt input', async () => {
    await mkdir(root, { recursive: true });
    const walPath = join(root, 'events.jsonl');
    await writeFile(walPath, 'bad-line\n');
    const wal = new WAL(walPath);

    await expect(wal.readAllEvents()).rejects.toThrow('WAL_CORRUPT_INPUT');
  });

  it('rejects non-current events before any WAL bytes are persisted', async () => {
    const walPath = join(root, 'events.jsonl');
    const wal = new WAL(walPath);
    await wal.initialize();

    await expect(wal.appendEvent({
      eventId: 'missing-current-contract',
      ts: 1,
      action: 'invalid.event',
      payload: {},
      metadata: { schemaVersion: '1.0', source: 'client' },
    })).rejects.toThrow('WAL_EVENT_SCHEMA_INVALID');
    expect(await exists(walPath)).toBe(false);
  });
});
