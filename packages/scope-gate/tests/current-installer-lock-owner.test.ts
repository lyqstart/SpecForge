import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  acquireInstallLock,
  getInstallLockPath,
  parseInstallLock,
} from '../../../scripts/lib/install_lock';

async function createRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'specforge-installer-lock-'));
}

const fastOptions = {
  timeoutMs: 40,
  pollIntervalMs: 5,
  heartbeatIntervalMs: 10,
  staleThresholdMs: 20,
  staleRecheckDelayMs: 5,
};

describe('current installer lock owner contract', () => {
  it('keeps one lock implementation for the current installer entry point', async () => {
    const root = join(import.meta.dirname, '../../..');
    const installer = await readFile(join(root, 'scripts/sf-installer.ts'), 'utf8');

    expect(installer.includes('from "./lib/install_lock"')).toBe(true);
    expect(existsSync(join(root, 'scripts/lib/reconcile.ts'))).toBe(false);
    expect(existsSync(join(root, 'setup/userlevel-scripts-lib/reconcile.ts'))).toBe(false);
    expect(existsSync(join(root, 'scripts/lib/lock.ts'))).toBe(false);
    expect(existsSync(join(root, 'setup/userlevel-scripts-lib/lock.ts'))).toBe(false);
  });

  it('requires schema 1.0 and acquired_at as the current runtime contract', () => {
    const current = {
      schema_version: '1.0',
      lock_id: 'lock-1',
      pid: process.pid,
      hostname: hostname(),
      command: 'upgrade',
      acquired_at: '2026-09-01T00:00:00.000Z',
      last_heartbeat: '2026-09-01T00:00:01.000Z',
    };

    expect(parseInstallLock(current)).toEqual(current);
    expect(() => parseInstallLock({ ...current, schema_version: undefined })).toThrow(/schema_version/);
    const { acquired_at: acquiredAt, ...withoutAcquiredAt } = current;
    expect(() => parseInstallLock({
      ...withoutAcquiredAt,
      created_at: acquiredAt,
    })).toThrow(/acquired_at/);
  });

  it('serializes owners and permits acquisition after the owning handle releases', async () => {
    const root = await createRoot();
    expect(getInstallLockPath(root)).toBe(join(root, 'sf-user', '.specforge.lock'));
    const first = await acquireInstallLock(root, 'upgrade', fastOptions);
    const lock = parseInstallLock(JSON.parse(
      await readFile(join(root, 'sf-user', '.specforge.lock'), 'utf8'),
    ));
    expect(lock.schema_version).toBe('1.0');

    await expect(acquireInstallLock(root, 'install', fastOptions)).rejects.toMatchObject({
      code: 'E_LOCK_TIMEOUT',
    });
    await first.release();

    const second = await acquireInstallLock(root, 'install', fastOptions);
    await second.release();
    expect(existsSync(join(root, 'sf-user', '.specforge.lock'))).toBe(false);
  });

  it('does not let an obsolete handle release a replacement owner lock', async () => {
    const root = await createRoot();
    const lockPath = join(root, 'sf-user', '.specforge.lock');
    const obsolete = await acquireInstallLock(root, 'upgrade', {
      ...fastOptions,
      heartbeatIntervalMs: 60_000,
    });
    const now = new Date().toISOString();
    const replacement = {
      schema_version: '1.0',
      lock_id: 'replacement-owner',
      pid: process.pid,
      hostname: hostname(),
      command: 'install',
      acquired_at: now,
      last_heartbeat: now,
    };
    await writeFile(lockPath, `${JSON.stringify(replacement)}\n`);

    await obsolete.release();

    expect(parseInstallLock(JSON.parse(await readFile(lockPath, 'utf8')))).toEqual(replacement);
  });

  it('does not reclaim a stale heartbeat while the same-host PID is alive', async () => {
    const root = await createRoot();
    const old = new Date(Date.now() - 60_000).toISOString();
    await writeFile(join(root, 'sf-user', '.specforge.lock'), JSON.stringify({
      schema_version: '1.0',
      lock_id: 'live-owner',
      pid: process.pid,
      hostname: hostname(),
      command: 'upgrade',
      acquired_at: old,
      last_heartbeat: old,
    }));

    await expect(acquireInstallLock(root, 'install', fastOptions)).rejects.toMatchObject({
      code: 'E_LOCK_TIMEOUT',
    });
    expect(parseInstallLock(JSON.parse(
      await readFile(join(root, 'sf-user', '.specforge.lock'), 'utf8'),
    )).lock_id).toBe('live-owner');
  });

  it('reclaims a stale lock whose PID is not alive', async () => {
    const root = await createRoot();
    const old = new Date(Date.now() - 60_000).toISOString();
    await writeFile(join(root, 'sf-user', '.specforge.lock'), JSON.stringify({
      schema_version: '1.0',
      lock_id: 'dead-owner',
      pid: 2_147_483_647,
      hostname: hostname(),
      command: 'upgrade',
      acquired_at: old,
      last_heartbeat: old,
    }));

    const handle = await acquireInstallLock(root, 'install', fastOptions);
    expect(parseInstallLock(JSON.parse(
      await readFile(join(root, 'sf-user', '.specforge.lock'), 'utf8'),
    )).lock_id).not.toBe('dead-owner');
    await handle.release();
  });

  it('fails closed without deleting malformed lock content', async () => {
    const root = await createRoot();
    const lockPath = join(root, 'sf-user', '.specforge.lock');
    await writeFile(lockPath, '{malformed');

    await expect(acquireInstallLock(root, 'upgrade', fastOptions)).rejects.toMatchObject({
      code: 'E_INVALID_JSON',
    });
    expect(await readFile(lockPath, 'utf8')).toBe('{malformed');
  });
});
