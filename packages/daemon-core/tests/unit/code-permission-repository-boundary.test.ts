import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const registration = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  delegate: vi.fn(async () => ({ downstream: true })),
}));
vi.mock('../../src/tools/ToolDispatcher', () => ({
  getHandler: () => registration.delegate,
  registerHandler: (name: string, handler: (...args: any[]) => Promise<any>) => {
    registration.handlers.set(name, handler);
  },
}));
import '../../src/tools/handlers/sf-git-code-permission-guard';

const exec = promisify(execFile);
let root: string;
let child: string;
const id = 'WI-0001';
async function invoke(directory: string, action = 'enable', workItemId = id) {
  return registration.handlers.get('sf_code_permission')!(
    { action, work_item_id: workItemId, allowed_write_files: ['docs/readiness.md'] },
    { directory },
    {}
  );
}
async function context(text: string) {
  const file = path.join(child, '.specforge/work-items', id, 'git_context.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
  return file;
}

describe('public code permission repository boundary', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-permission-boundary-'));
    child = path.join(root, 'independent-project');
    await fs.mkdir(child);
    await exec('git', ['init', '-b', 'main'], { cwd: root });
    registration.delegate.mockClear();
  });
  afterEach(async () => {
    expect(path.basename(root)).toMatch(/^sf-permission-boundary-/);
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each(['enable', 'release', 'extend', 'append'])(
    'retains real default-branch rejection for %s',
    async action => {
      expect(await invoke(root, action)).toMatchObject({
        success: false,
        error: 'MAIN_WRITE_GUARD_BLOCKED',
      });
      expect(registration.delegate).not.toHaveBeenCalled();
    }
  );
  it.each(['enable', 'release', 'extend', 'append'])(
    'leaves unrelated ancestor main outside the project for %s',
    async action => {
      expect((await exec('git', ['branch', '--show-current'], { cwd: child })).stdout.trim()).toBe(
        'main'
      );
      expect(await invoke(child, action)).toEqual({ downstream: true });
      expect(registration.delegate).toHaveBeenCalledOnce();
      expect(await fs.readdir(child)).toEqual([]);
    }
  );
  it('protects an ancestor repository explicitly bound by the WI', async () => {
    const file = await context(JSON.stringify({ git_enabled: true, branch_name: 'main' }));
    const before = await fs.readFile(file);
    expect(await invoke(child)).toMatchObject({
      success: false,
      error: 'MAIN_WRITE_GUARD_BLOCKED',
    });
    expect(registration.delegate).not.toHaveBeenCalled();
    expect(await fs.readFile(file)).toEqual(before);
  });
  it('preserves ordinary semantic branch dispatch', async () => {
    await exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/feature/wi-0001'], { cwd: root });
    expect(await invoke(root)).toEqual({ downstream: true });
    expect(registration.delegate).toHaveBeenCalledOnce();
  });
  it.each(['{broken', 'null', '[]'])(
    'refuses unreadable or invalid binding %s without permission dispatch',
    async text => {
      const file = await context(text);
      expect(await invoke(child)).toMatchObject({
        success: false,
        error: 'CODE_PERMISSION_GIT_CONTEXT_UNREADABLE',
      });
      expect(registration.delegate).not.toHaveBeenCalled();
      expect(await fs.readFile(file, 'utf8')).toBe(text);
    }
  );
  it('validates the WI identifier before reading a context path', async () => {
    expect((await invoke(child, 'enable', '../outside')).success).toBe(false);
    expect(registration.delegate).not.toHaveBeenCalled();
  });
});
