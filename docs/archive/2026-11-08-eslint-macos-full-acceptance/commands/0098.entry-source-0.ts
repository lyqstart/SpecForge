import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'fs';
import type { PathLike, OpenMode, Mode } from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { HandshakeManager } from '../../src/daemon/HandshakeManager';

const native = vi.hoisted(() => ({
  enabled: true, exclusive: 2 as number | undefined, nonblocking: 4 as number | undefined,
  unlock: 8 as number | undefined, failLock: false, failUnlock: false,
  calls: [] as [number, number][], receivers: [] as unknown[], opened: [] as number[], closed: [] as number[],
}));
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    constants: { ...actual.constants, get LOCK_EX(): number | undefined { return native.exclusive; }, get LOCK_NB(): number | undefined { return native.nonblocking; }, get LOCK_UN(): number | undefined { return native.unlock; } },
    get flockSync(): ((this: unknown, fd: number, flags: number) => void) | undefined {
      if (!native.enabled) return undefined;
      return function(this: unknown, fd: number, flags: number): void {
        native.calls.push([fd, flags]); native.receivers.push(this);
        if ((flags === native.unlock && native.failUnlock) || (flags !== native.unlock && native.failLock)) throw new Error('SYNTHETIC_FLOCK_FAILURE');
      };
    },
    openSync(file: PathLike, flags: OpenMode, mode?: Mode): number {
      const fd = actual.openSync(file, flags, mode); native.opened.push(fd); return fd;
    },
    closeSync(fd: number): void { native.closed.push(fd); actual.closeSync(fd); },
  };
});

describe('optional native file lock ownership', () => {
  let root: string;
  let manager: HandshakeManager;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-optional-lock-'));
    Object.assign(native, { enabled: true, exclusive: 2, nonblocking: 4, unlock: 8, failLock: false, failUnlock: false });
    native.calls.length = native.receivers.length = native.opened.length = native.closed.length = 0;
    const config = new DaemonConfig([]);
    vi.spyOn(config, 'getRuntimeDir').mockReturnValue(root);
    vi.spyOn(config, 'getHandshakeFile').mockReturnValue(path.join(root, 'handshake.json'));
    manager = new HandshakeManager(config);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await manager.cleanup();
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('sf-optional-lock-')) throw new Error('UNOWNED_TEST_ROOT');
    await fs.rm(root, { recursive: true, force: true });
  });
  function onlyOpenedFd(): number {
    expect(native.opened).toHaveLength(1);
    const fd = native.opened[0];
    if (fd === undefined) throw new Error('No owned descriptor');
    return fd;
  }
  function expectClosed(fd: number): void {
    expect(native.closed).toContain(fd);
    expect(() => fsSync.fstatSync(fd)).toThrow();
  }
  it('uses exclusive nonblocking acquisition, matching unlock and the filesystem receiver', async () => {
    await manager.enforceSingleInstance();
    const fd = onlyOpenedFd();
    expect(native.calls).toEqual([[fd, 6]]);
    await manager.cleanup();
    expect(native.calls).toEqual([[fd, 6], [fd, 8]]);
    expect(native.receivers.every(receiver => receiver === fsSync)).toBe(true);
    expectClosed(fd);
  });
  it('preserves PID fallback and rejects an already live PID when flock is absent', async () => {
    native.enabled = false;
    await fs.writeFile(path.join(root, 'daemon.lock'), String(process.pid));
    await expect(manager.enforceSingleInstance()).rejects.toThrow('already running');
    expect(native.calls).toHaveLength(0);
    expectClosed(onlyOpenedFd());
  });
  it('fails closed on incomplete native flags and closes the owned descriptor', async () => {
    native.exclusive = undefined;
    await expect(manager.enforceSingleInstance()).rejects.toThrow('already running');
    expect(native.calls).toHaveLength(0);
    expectClosed(onlyOpenedFd());
    expect(await fs.readFile(path.join(root, 'daemon.lock'), 'utf8')).toBe('');
  });
  it('closes the descriptor after an actual lock operation rejects', async () => {
    native.failLock = true;
    await expect(manager.enforceSingleInstance()).rejects.toThrow('already running');
    expectClosed(onlyOpenedFd());
  });
  it('closes the descriptor even if native unlock throws', async () => {
    await manager.enforceSingleInstance();
    const fd = onlyOpenedFd(); native.failUnlock = true;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await manager.cleanup();
    expect(warning).toHaveBeenCalled();
    expectClosed(fd);
  });
  it('releases the lock even if owned handshake deletion fails', async () => {
    await manager.enforceSingleInstance();
    const fd = onlyOpenedFd();
    vi.spyOn(manager, 'removeHandshake').mockRejectedValue(new Error('SYNTHETIC_UNLINK_FAILURE'));
    await expect(manager.cleanup()).rejects.toThrow('SYNTHETIC_UNLINK_FAILURE');
    expect(native.calls).toEqual([[fd, 6], [fd, 8]]);
    expectClosed(fd);
  });
});
