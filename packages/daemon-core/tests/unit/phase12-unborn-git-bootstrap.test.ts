import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  checkpointCommit,
  createBranch,
  getCurrentBranch,
  getHeadCommit,
} from '../../src/tools/lib/git-governance-core.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[], allowFailure = false): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: root });
    return { code: 0, stdout: String(stdout ?? '').trim(), stderr: String(stderr ?? '').trim() };
  } catch (error: any) {
    if (!allowFailure) throw error;
    return {
      code: Number(error?.code ?? 1),
      stdout: String(error?.stdout ?? '').trim(),
      stderr: String(error?.stderr ?? error?.message ?? '').trim(),
    };
  }
}

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

describe('Phase 12 unborn default-branch Git bootstrap', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-unborn-git-bootstrap-'));
    await git(projectRoot, ['init', '-b', 'main']);
    await git(projectRoot, ['config', 'user.name', 'SpecForge Test']);
    await git(projectRoot, ['config', 'user.email', 'specforge-test@example.invalid']);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('creates an empty default-branch bootstrap commit and carries only untracked .specforge governance into the WI branch', async () => {
    await write(
      path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'),
      '{"project_spec_version":"PSV-0002"}\n',
    );
    await write(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0001', 'work_item.json'),
      '{"work_item_id":"WI-0001"}\n',
    );

    expect(await getHeadCommit(projectRoot)).toBeNull();

    const result = await createBranch({
      projectRoot,
      workItemId: 'WI-0001',
      branchName: 'feature/work-item-wi-0001',
    });

    expect(result.bootstrap_mode).toBe('unborn_default_branch_empty_commit');
    expect(result.bootstrap_commit_created).toBe(true);
    expect(result.bootstrap_commit).toBe(result.base_commit);
    expect(await getCurrentBranch(projectRoot)).toBe('feature/work-item-wi-0001');

    const mainHead = await git(projectRoot, ['rev-parse', 'main']);
    expect(mainHead.stdout).toBe(result.base_commit);

    const rootCommit = await git(projectRoot, ['rev-list', '--parents', '-n', '1', result.base_commit]);
    expect(rootCommit.stdout.split(/\s+/)).toEqual([result.base_commit]);

    const committedPaths = await git(projectRoot, [
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--name-only',
      '-r',
      result.base_commit,
    ]);
    expect(committedPaths.stdout).toBe('');

    const status = await git(projectRoot, ['status', '--short', '--untracked-files=all']);
    const statusLines = status.stdout.split(/\r?\n/).filter(Boolean);
    expect(statusLines.length).toBeGreaterThan(0);
    expect(statusLines.every((line) => line.startsWith('?? .specforge/'))).toBe(true);

    const context = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, '.specforge', 'work-items', 'WI-0001', 'git_context.json'),
        'utf8',
      ),
    );
    expect(context.base_branch).toBe('main');
    expect(context.base_commit).toBe(result.base_commit);
    expect(context.branch_name).toBe('feature/work-item-wi-0001');

    const mergeBase = await git(projectRoot, [
      'merge-base',
      '--is-ancestor',
      result.base_commit,
      'HEAD',
    ], true);
    expect(mergeBase.code).toBe(0);
  });

  it('fails closed when an unborn repository contains any dirty path outside untracked .specforge governance', async () => {
    await write(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), '{}\n');
    await write(path.join(projectRoot, 'README.md'), '# unexpected business file\n');

    await expect(
      createBranch({
        projectRoot,
        workItemId: 'WI-0001',
        branchName: 'feature/work-item-wi-0001',
      }),
    ).rejects.toThrow('UNBORN_DEFAULT_BRANCH_BOOTSTRAP_SCOPE_VIOLATION: README.md');

    expect(await getHeadCommit(projectRoot)).toBeNull();
    expect(await getCurrentBranch(projectRoot)).toBe('main');
  });

  it('fails closed when .specforge content was staged before unborn bootstrap', async () => {
    await write(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), '{}\n');
    await git(projectRoot, ['add', '--', '.specforge/project/spec_manifest.json']);

    await expect(
      createBranch({
        projectRoot,
        workItemId: 'WI-0001',
        branchName: 'feature/work-item-wi-0001',
      }),
    ).rejects.toThrow('UNBORN_DEFAULT_BRANCH_BOOTSTRAP_SCOPE_VIOLATION');

    expect(await getHeadCommit(projectRoot)).toBeNull();
  });

  it('preserves the ordinary clean-worktree requirement once the default branch already has a commit', async () => {
    await git(projectRoot, ['commit', '--allow-empty', '-m', 'chore: baseline']);
    await write(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), '{}\n');

    await expect(
      createBranch({
        projectRoot,
        workItemId: 'WI-0001',
        branchName: 'feature/work-item-wi-0001',
      }),
    ).rejects.toThrow('WORKTREE_NOT_CLEAN_BEFORE_BRANCH_CREATE');
  });

  it('keeps ordinary checkpoint commits forbidden on the default branch', async () => {
    await git(projectRoot, ['commit', '--allow-empty', '-m', 'chore: baseline']);
    await expect(
      checkpointCommit({
        projectRoot,
        workItemId: 'WI-0001',
        files: [],
        message: 'chore: checkpoint',
      }),
    ).rejects.toThrow('MAIN_WRITE_GUARD_BLOCKED');
  });
});
