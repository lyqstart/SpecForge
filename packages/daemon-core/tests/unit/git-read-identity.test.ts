import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readGitIdentity } from '../../src/tools/lib/git-read-identity';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('sf-git-fields-'))
      throw Error('UNOWNED_FIXTURE');
    await fs.rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-git-fields-'));
  roots.push(root);
  const project = path.join(root, 'project with spaces');
  await fs.mkdir(project);
  const git = async (cwd: string, args: string[]) => (await exec('git', [
    '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@localhost.invalid',
    '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
    ...args,
  ], { cwd, windowsHide: true })).stdout;
  await git(project, ['init', '-q', '-b', 'main']);
  return { root, project, git };
}
describe('fresh read-only Git identity fields', () => {
  it.each([false, true])('retains original head verification=%s after owner boundary validation', async verify => {
    const head = 'a'.repeat(40), events: string[] = [];
    const read = vi.fn(async (args: string[]) => {
      events.push(args.includes('HEAD') ? 'HEAD' : 'directories');
      return args.includes('HEAD') ? head + '\n' : 'C:/space dir\n.git\n';
    });
    const guard = (top: string, common: string) => { events.push('guard'); expect(top).toBe('C:/space dir'); expect(common).toBe('.git'); };
    expect(await readGitIdentity(read, guard, verify)).toEqual({ top: 'C:/space dir', common: '.git', head });
    expect(read.mock.calls).toEqual([
      [['rev-parse', '--show-toplevel', '--git-common-dir']],
      [['rev-parse', ...(verify ? ['--verify'] : []), 'HEAD']],
    ]);
    expect(events).toEqual(['directories', 'guard', 'HEAD']);
    await readGitIdentity(read, guard, verify);
    expect(read).toHaveBeenCalledTimes(4); // A second snapshot must never use cached fields.
  });
  it('never reads HEAD when the owner rejects an external directory', async () => {
    const read = vi.fn(async () => '/root\n/external/common\n');
    await expect(readGitIdentity(read, () => { throw Error('EXTERNAL_DIRECTORY'); })).rejects.toThrow('EXTERNAL_DIRECTORY');
    expect(read.mock.calls).toEqual([[['rev-parse', '--show-toplevel', '--git-common-dir']]]);
  });
  it('does not retry or mask runner rejection', async () => {
    const failure = Error('BOUNDED_GIT_FAILURE'), read = vi.fn(async () => { throw failure; });
    await expect(readGitIdentity(read, () => {}, true)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('falls back to all original field reads for an ambiguous response', async () => {
    const head = 'b'.repeat(40), read = vi.fn()
      .mockResolvedValueOnce('/path\nwith newline\n.git\n')
      .mockResolvedValueOnce('/path\nwith newline\n')
      .mockResolvedValueOnce('.git\n')
      .mockResolvedValueOnce(head + '\n');
    expect(await readGitIdentity(read, () => {}, true)).toEqual({ top: '/path\nwith newline', common: '.git', head });
    expect(read.mock.calls.slice(1)).toEqual([
      [['rev-parse', '--show-toplevel']], [['rev-parse', '--git-common-dir']], [['rev-parse', '--verify', 'HEAD']],
    ]);
  });
  it('matches separate real queries on a branch, detached HEAD and linked worktree and observes a new commit', async () => {
    const { root, project, git } = await fixture();
    await git(project, ['commit', '-q', '--allow-empty', '-m', 'first']);
    const check = async (cwd: string) => {
      const read = (args: string[]) => git(cwd, args);
      const observed = await readGitIdentity(read, () => {}, true);
      expect(observed).toEqual({
        top: (await read(['rev-parse', '--show-toplevel'])).trim(),
        common: (await read(['rev-parse', '--git-common-dir'])).trim(),
        head: (await read(['rev-parse', '--verify', 'HEAD'])).trim(),
      });
      return observed;
    };
    const first = await check(project);
    await git(project, ['commit', '-q', '--allow-empty', '-m', 'second']);
    expect((await check(project)).head).not.toBe(first.head);
    const linked = path.join(root, 'linked');
    await git(project, ['worktree', 'add', '-q', '-b', 'linked', linked]);
    const linkedIdentity = await check(linked);
    expect(path.resolve(linked, linkedIdentity.common)).not.toBe(path.join(linked, '.git'));
    await git(project, ['switch', '--detach']);
    await check(project);
  });
  it('rejects an unborn HEAD through the existing real Git runner', async () => {
    const { project, git } = await fixture();
    await expect(readGitIdentity(args => git(project, args), () => {}, true)).rejects.toThrow();
  });
  it.skipIf(process.platform === 'win32')('preserves real POSIX newline paths via legacy fallback', async () => {
    const { root, project, git } = await fixture(), newline = path.join(root, 'line\nbreak');
    await git(project, ['commit', '-q', '--allow-empty', '-m', 'first']);
    await fs.rename(project, newline);
    const identity = await readGitIdentity(args => git(newline, args), () => {}, true);
    expect(identity.top).toBe(newline);
    expect(identity.common).toBe('.git');
  });
});
