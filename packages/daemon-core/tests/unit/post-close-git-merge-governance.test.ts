import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  gitMergePlan,
  gitMergeRun,
  gitPostMergeVerify,
} from '../../src/tools/lib/git-governance-stage2.js';
import {
  verifyFormalVersionSnapshotAfterGitMerge,
} from '../../src/tools/lib/project-governance-v2.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root });
  return String(stdout ?? '').trim();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('post-close formal Git merge governance', () => {
  let projectRoot: string;
  const workItemId = 'WI-0001';
  const featureBranch = 'feature/architecture-change-project-contract-wi-0001';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-post-close-merge-'));
    await git(projectRoot, ['init', '-b', 'main']);
    await git(projectRoot, ['config', 'user.name', 'SpecForge Test']);
    await git(projectRoot, ['config', 'user.email', 'specforge-test@example.invalid']);
    await fs.writeFile(path.join(projectRoot, 'README.md'), '# baseline\n');
    await git(projectRoot, ['add', '--', 'README.md']);
    await git(projectRoot, ['commit', '-m', 'chore: baseline']);
    const baseCommit = await git(projectRoot, ['rev-parse', 'HEAD']);

    await git(projectRoot, ['switch', '-c', featureBranch]);
    await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.js'), 'export const value = 1;\n');
    await writeJson(
      path.join(projectRoot, '.specforge', 'work-items', workItemId, 'git_context.json'),
      {
        schema_version: '1.0',
        work_item_id: workItemId,
        git_enabled: true,
        branch_name: featureBranch,
        base_branch: 'main',
        base_commit: baseCommit,
        remote_name: null,
        merge_policy: 'requires_user_confirmation',
      },
    );
    await git(projectRoot, ['add', '--', 'src/main.js', '.specforge/work-items/WI-0001/git_context.json']);
    await git(projectRoot, ['commit', '-m', 'feat: implementation']);
    const implementationCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    const implementationBlob = await git(projectRoot, [
      'rev-parse',
      `${implementationCommit}:src/main.js`,
    ]);

    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(workItemDir, 'gates', 'formal_version_gate.json'), {
      status: 'passed',
    });
    await writeJson(path.join(workItemDir, 'gates', 'close_gate.json'), {
      status: 'passed',
    });
    await writeJson(path.join(workItemDir, 'formal_version_snapshot.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      head_commit: implementationCommit,
      implementation_commit: implementationCommit,
      branch_name: featureBranch,
      implementation_files: ['src/main.js'],
      implementation_tree_fingerprint: digest(`src/main.js\0${implementationBlob}`),
      base_commit: baseCommit,
      diff_fingerprint: '',
    });
    await git(projectRoot, ['add', '--', '.specforge/work-items/WI-0001']);
    await git(projectRoot, ['commit', '-m', 'docs: close evidence']);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('fails merge planning closed when authority or post-close cleanliness is missing', async () => {
    const openPlan = await gitMergePlan({
      projectRoot,
      workItemId,
      authoritativeState: 'verification_done',
    });
    expect(openPlan.can_merge).toBe(false);
    expect(openPlan.blocking_issues).toContain(
      'AUTHORITATIVE_STATE_CLOSED_REQUIRED: current=verification_done',
    );

    await fs.writeFile(
      path.join(projectRoot, '.specforge', 'work-items', workItemId, 'close_gate.md'),
      '# uncommitted close evidence\n',
    );
    const dirtyPlan = await gitMergePlan({
      projectRoot,
      workItemId,
      authoritativeState: 'closed',
    });
    expect(dirtyPlan.can_merge).toBe(false);
    expect(dirtyPlan.blocking_issues).toContain('WORKTREE_NOT_CLEAN_BEFORE_MERGE');
  });

  it('requires explicit confirmation and proves actual repository delivery after merge', async () => {
    const plan = await gitMergePlan({
      projectRoot,
      workItemId,
      authoritativeState: 'closed',
    });
    expect(plan.can_merge).toBe(true);
    expect(plan.blocking_issues).toEqual([]);
    expect(plan.repository_delivery_state).toBe(
      'governance_closed_pending_user_confirmed_git_merge',
    );

    await expect(
      gitMergeRun({
        projectRoot,
        workItemId,
        confirmed: false,
        authoritativeState: 'closed',
        pullFirst: true,
      }),
    ).rejects.toThrow('MERGE_REQUIRES_USER_CONFIRMATION');

    const merged = await gitMergeRun({
      projectRoot,
      workItemId,
      confirmed: true,
      authoritativeState: 'closed',
      pullFirst: true,
    });
    expect(merged.success).toBe(true);
    expect(merged.pull_performed).toBe(false);
    expect(merged.remote_name).toBeNull();
    expect(merged.repository_delivery_state).toBe('git_merged_pending_post_merge_verify');
    expect(await git(projectRoot, ['branch', '--show-current'])).toBe('main');

    const verified = await gitPostMergeVerify({
      projectRoot,
      workItemId,
      authoritativeState: 'closed',
      commands: ['bun test'],
    });
    expect(verified.repository_delivery_complete).toBe(true);
    expect(verified.repository_delivery_state).toBe('closed_and_git_merged');
    expect(verified.work_item_branch_is_ancestor).toBe(true);
    expect(verified.merge_commit).toBe(true);
    expect(verified.formal_version.implementation_tree_matches).toBe(true);
  });

  it('rejects post-merge completion when the approved implementation tree changes', async () => {
    const merged = await gitMergeRun({
      projectRoot,
      workItemId,
      confirmed: true,
      authoritativeState: 'closed',
      pullFirst: false,
    });
    expect(merged.success).toBe(true);
    await fs.writeFile(path.join(projectRoot, 'src', 'main.js'), 'export const value = 2;\n');
    await git(projectRoot, ['add', '--', 'src/main.js']);
    await git(projectRoot, ['commit', '-m', 'feat: mutate after merge']);

    const mutatedHead = await git(projectRoot, ['rev-parse', 'HEAD']);
    await expect(
      verifyFormalVersionSnapshotAfterGitMerge(projectRoot, workItemId, mutatedHead),
    ).rejects.toThrow('POST_MERGE_IMPLEMENTATION_TREE_CHANGED');
  });

  it('aligns tools, Orchestrator, workflow Skill, handoff and experience consumers', async () => {
    const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const read = async (relative: string) =>
      fs.readFile(path.join(repositoryRoot, relative), 'utf8');

    const [orchestrator, skill, postMergeTool, handoff, experience, p0] = await Promise.all([
      read('setup/userlevel-opencode/agents/sf-orchestrator.md'),
      read('setup/userlevel-opencode/skills/sf-workflow-architecture-change/SKILL.md'),
      read('setup/userlevel-opencode/tools/sf_git_post_merge_verify.ts'),
      read('docs/implementation/architecture-consistency/current-handoff.md'),
      read('docs/rule/specforge-development-error-ledger-and-experience.md'),
      read('docs/implementation/architecture-consistency/P0-contract-consumer-closure.md'),
    ]);

    for (const content of [orchestrator, skill]) {
      expect(content).toContain('sf_git_merge_plan');
      expect(content).toContain('sf_git_merge_run');
      expect(content).toContain('sf_git_post_merge_verify');
      expect(content).toContain('repository_delivery_complete=true');
      expect(content).toContain('governance_closed_pending_git_merge');
      expect(content).toContain('Candidate Package');
    }
    expect(postMergeTool).toContain('work_item_id: tool.schema.string()');
    expect(experience).toContain('### ERR-127：WI-0001治理关闭后未执行正式Git Merge');
    expect(experience).toContain('### ERR-128：仍在WI分支且Close产物未提交时错误报告工作项完成');
    expect(experience).toContain('### ERR-129：Git Merge工具没有形成closed到主线交付的完整硬门禁');
    expect(experience).toContain('## EXP-106：治理关闭与仓库交付完成必须使用不同状态');
    expect(handoff).toContain('WI0001_REPOSITORY_DELIVERY_STATE=GOVERNANCE_CLOSED_PENDING_GIT_MERGE');
    expect(handoff).toContain('NEXT_ACTION=DEPLOY_V76_THEN_COMMIT_CLOSE_EVIDENCE_AND_PLAN_GIT_MERGE');
    expect(p0).toContain('### 25.61 WI-0001关闭后正式Git Merge缺口与V76修复边界');
  });
});
