import { it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { planDetachedGitBootstrap, executeDetachedGitBootstrap } from '../../src/tools/lib/git-detached-bootstrap';

it('never starts a repository clean filter while checking or publishing a detached bootstrap', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-detached-filter-'));
  const exec = promisify(execFile), git = async (...args: string[]) => (await exec('git', args, { cwd: root, windowsHide: true })).stdout.trim();
  try {
    await git('init', '-b', 'seed'); await git('config', 'user.name', 'Filter Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
    const file = path.join(root, 'README.md'), bytes = '# filter fixture\n'; await fs.writeFile(file, bytes);
    await git('add', '--', 'README.md'); await git('commit', '-m', 'baseline'); const head = await git('rev-parse', 'HEAD');
    await git('switch', '--detach', head); await git('branch', '-D', 'seed');
    await git('config', 'filter.fixture.clean', 'echo ran > .git/filter-ran; cat');
    await fs.writeFile(path.join(root, '.git/info/attributes'), 'README.md filter=fixture\n');
    await fs.utimes(file, new Date(), new Date(Date.now() + 60000));
    const index = await fs.readFile(path.join(root, '.git/index'));
    const wi = path.join(root, '.specforge/work-items/WI-0001'); await fs.mkdir(wi, { recursive: true });
    await fs.writeFile(path.join(wi, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', code_change_allowed: false }));
    const input = { projectRoot: root, workItemId: 'WI-0001', expectedHead: head, baseBranch: 'main', branchName: 'codex/filter-wi-0001' };
    const plan = await planDetachedGitBootstrap(input).catch(error => ({ error: String(error) }));
    await expect(fs.stat(path.join(root, '.git/filter-ran'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(plan).toMatchObject({ success: true });
    if (!('bootstrap_plan_sha256' in plan)) throw Error('PLAN_FAILED');
    expect((await executeDetachedGitBootstrap({ ...input, planSha256: plan.bootstrap_plan_sha256, confirmationQuote: '采用 main + codex/filter-wi-0001' })).success).toBe(true);
    await expect(fs.stat(path.join(root, '.git/filter-ran'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(file, 'utf8')).toBe(bytes); expect(await fs.readFile(path.join(root, '.git/index'))).toEqual(index);
  } finally {
    if (!path.basename(root).startsWith('sf-detached-filter-')) throw Error('UNOWNED_FIXTURE');
    await fs.rm(root, { recursive: true, force: true });
  }
}, 60000);
