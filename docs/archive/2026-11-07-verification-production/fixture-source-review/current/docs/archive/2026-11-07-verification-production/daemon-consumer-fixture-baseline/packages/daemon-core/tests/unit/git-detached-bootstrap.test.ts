import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { planDetachedGitBootstrap, executeDetachedGitBootstrap, withGitBranchMutationLease } from '../../src/tools/lib/git-detached-bootstrap';
import { createBranch } from '../../src/tools/lib/git-governance-core';
import { ToolDispatcher } from '../../src/tools';
import { StateManager } from '../../src/state/StateManager';
import { PersonalPathResolver } from '../../src/daemon/path-resolver';

const exec = promisify(execFile), roots: string[] = [];
const digest = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) { if (!path.basename(root).startsWith('sf-detached-owner-')) throw Error('UNOWNED_FIXTURE'); await fs.rm(root, { recursive: true, force: true }); } });
async function git(root: string, ...args: string[]) { return (await exec('git', args, { cwd: root, windowsHide: true })).stdout.trim(); }
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-detached-owner-')); roots.push(root);
  await git(root, 'init', '-b', 'original'); await git(root, 'config', 'user.name', 'SpecForge Fixture'); await git(root, 'config', 'user.email', 'fixture@example.invalid');
  await fs.writeFile(path.join(root, 'README.md'), '# Original bytes\n'); await git(root, 'add', '--', 'README.md'); await git(root, 'commit', '-m', 'baseline');
  const head = await git(root, 'rev-parse', 'HEAD'); await git(root, 'switch', '--detach', head); await git(root, 'branch', '-D', 'original');
  const wi = path.join(root, '.specforge/work-items/WI-0001'); await fs.mkdir(wi, { recursive: true });
  await fs.writeFile(path.join(wi, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: false, allowed_write_files: [] }));
  const input = { projectRoot: root, workItemId: 'WI-0001', baseBranch: 'main', branchName: 'codex/greet-library-wi-0001', expectedHead: head };
  const bytes = await fs.readFile(path.join(root, 'README.md')), index = await fs.readFile(path.join(root, '.git/index'));
  return { root, wi, head, input, bytes, index };
}
async function prepared() {
  const f = await fixture(), plan = await planDetachedGitBootstrap(f.input);
  return { ...f, plan, execute: { ...f.input, planSha256: plan.bootstrap_plan_sha256, confirmationQuote: '采用 main + codex/greet-library-wi-0001' } };
}
async function unchanged(f: Awaited<ReturnType<typeof fixture>>) {
  expect(await fs.readFile(path.join(f.root, 'README.md'))).toEqual(f.bytes);
  expect(await fs.readFile(path.join(f.root, '.git/index'))).toEqual(f.index);
  expect(await git(f.root, 'rev-parse', 'HEAD')).toBe(f.head);
}

describe('controlled detached Git bootstrap', () => {
  it('plans without creating refs, atomically binds two new branches and standard context, then retries idempotently', async () => {
    const f = await prepared(); expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe(''); await unchanged(f);
    const result = await executeDetachedGitBootstrap(f.execute);
    expect(result).toMatchObject({ success: true, new_commit_created: false, index_unchanged: true });
    expect(await git(f.root, 'branch', '--show-current')).toBe(f.input.branchName);
    expect(await git(f.root, 'rev-parse', 'main')).toBe(f.head); await unchanged(f);
    const context = await fs.readFile(path.join(f.wi, 'git_context.json'));
    expect(JSON.parse(context.toString())).toMatchObject({ git_enabled: true, base_branch: 'main', base_commit: f.head, branch_name: f.input.branchName });
    expect(await executeDetachedGitBootstrap(f.execute)).toEqual(result);
    expect(await fs.readFile(path.join(f.wi, 'git_context.json'))).toEqual(context);
    const audit = await fs.readFile(path.join(f.wi, 'git_bootstrap', f.plan.bootstrap_plan_sha256, 'commands.jsonl'), 'utf8');
    expect(audit.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.event === 'command_finished').every(e => Number.isInteger(e.inner_exit_code))).toBe(true);
  });
  it.each(['refs_created', 'refs_and_head_bound', 'context_bound'])('recovers an interrupted owner at %s without rewriting business/index or duplicating refs', async checkpoint => {
    const f = await prepared();
    await expect(executeDetachedGitBootstrap(f.execute, { onCheckpoint: async stage => { if (stage === checkpoint) throw Error('SIMULATED_INTERRUPTION'); } })).rejects.toThrow('SIMULATED_INTERRUPTION');
    await unchanged(f); expect((await executeDetachedGitBootstrap(f.execute)).success).toBe(true); await unchanged(f);
  });
  it.each(['批准', '不同意 main + codex/greet-library-wi-0001', '采用 main + codex/other-wi-0001'])('rejects unbound confirmation %s before refs', async quote => {
    const f = await prepared(); await expect(executeDetachedGitBootstrap({ ...f.execute, confirmationQuote: quote })).rejects.toThrow('EXPLICIT_BRANCH_CONFIRMATION_REQUIRED');
    expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe(''); await unchanged(f);
  });
  it('rejects a tampered immutable plan before refs', async () => {
    const f = await prepared(), plan = path.join(f.wi, 'git_bootstrap/plans', f.plan.bootstrap_plan_sha256 + '.json');
    await fs.appendFile(plan, ' '); await expect(executeDetachedGitBootstrap(f.execute)).rejects.toThrow('PLAN_DRIFT');
    expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe(''); await unchanged(f);
  });
  it.each(['unknown_schema', 'unknown_field'])('rejects %s with a correct raw hash before refs', async kind => {
    const f = await prepared(); const plan: any = { ...f.plan.plan };
    if (kind === 'unknown_schema') plan.schema_version = '2.0'; else plan.unknown_future_control = true;
    const raw = JSON.stringify(plan, null, 2) + '\n', planSha256 = digest(Buffer.from(raw));
    await fs.writeFile(path.join(f.wi, 'git_bootstrap/plans', planSha256 + '.json'), raw, { flag: 'wx' });
    await expect(executeDetachedGitBootstrap({ ...f.execute, planSha256 })).rejects.toThrow('PLAN_SCHEMA_INVALID');
    expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe(''); await unchanged(f);
  });
  it.each(['main', 'main/topic'])('rejects branch identity collision %s while planning', async branchName => {
    const f = await fixture(); await expect(planDetachedGitBootstrap({ ...f.input, branchName })).rejects.toThrow('BRANCH_NAME_INVALID');
  });
  it('does not match the base name as a substring inside the work branch confirmation', async () => {
    const f = await fixture(), branchName = 'codex/main-greet-wi-0001', plan = await planDetachedGitBootstrap({ ...f.input, branchName });
    await expect(executeDetachedGitBootstrap({ ...f.input, branchName, planSha256: plan.bootstrap_plan_sha256, confirmationQuote: '采用 codex/main-greet-wi-0001' })).rejects.toThrow('EXPLICIT_BRANCH_CONFIRMATION_REQUIRED');
  });
  it('atomically rejects a concurrent HEAD commit before changing either requested ref', async () => {
    const f = await prepared(); let head = '';
    await expect(executeDetachedGitBootstrap(f.execute, { onCheckpoint: async stage => {
      if (stage === 'before_refs_transaction') { await git(f.root, 'commit', '--allow-empty', '-m', 'concurrent'); head = await git(f.root, 'rev-parse', 'HEAD'); }
    } })).rejects.toThrow();
    expect(await git(f.root, 'rev-parse', 'HEAD')).toBe(head); expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe('');
  });
  it('rejects concurrent attachment to a different branch without overwriting that HEAD', async () => {
    const f = await prepared();
    await expect(executeDetachedGitBootstrap(f.execute, { onCheckpoint: async stage => {
      if (stage === 'before_refs_transaction') await git(f.root, 'switch', '-c', 'concurrent');
    } })).rejects.toThrow();
    expect(await git(f.root, 'branch', '--show-current')).toBe('concurrent');
    expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe('refs/heads/concurrent');
  });
  it('holds Git HEAD.lock against an actual concurrent commit, then completes safely', async () => {
    const f = await prepared();
    expect((await executeDetachedGitBootstrap(f.execute, { onCheckpoint: async stage => {
      if (stage === 'head_lease_acquired') await expect(git(f.root, 'commit', '--allow-empty', '-m', 'concurrent')).rejects.toThrow();
    } })).success).toBe(true); await unchanged(f);
  });
  it('preserves an unknown Git HEAD lock and rejects before creating refs', async () => {
    const f = await prepared(), lock = path.join(f.root, '.git/HEAD.lock'); await fs.writeFile(lock, 'unrelated lock');
    await expect(executeDetachedGitBootstrap(f.execute)).rejects.toThrow('HEAD_LEASE_UNKNOWN');
    expect(await fs.readFile(lock, 'utf8')).toBe('unrelated lock'); expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe('');
  });
  it.each(['tracked', 'untracked', 'staged', 'head', 'refs', 'config', 'context'])('rejects %s drift without creating target refs or context', async drift => {
    const f = await prepared();
    if (drift === 'tracked') await fs.appendFile(path.join(f.root, 'README.md'), 'change');
    if (drift === 'untracked') await fs.writeFile(path.join(f.root, 'new.ts'), 'change');
    if (drift === 'staged') await git(f.root, 'add', '--', '.specforge/work-items/WI-0001/work_item.json');
    if (drift === 'head') { await git(f.root, 'commit', '--allow-empty', '-m', 'drift'); }
    if (drift === 'refs') await git(f.root, 'branch', 'unexpected', f.head);
    if (drift === 'config') await git(f.root, 'config', 'user.name', 'changed');
    if (drift === 'context') await fs.writeFile(path.join(f.wi, 'git_context.json'), '{}\n');
    const before = await git(f.root, 'for-each-ref', '--format=%(refname) %(objectname)');
    await expect(executeDetachedGitBootstrap(f.execute)).rejects.toThrow();
    expect(await git(f.root, 'for-each-ref', '--format=%(refname) %(objectname)')).toBe(before);
    if (drift !== 'context') await expect(fs.stat(path.join(f.wi, 'git_context.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects active permission and an existing local branch at plan time', async () => {
    const f = await fixture(); const metadata = JSON.parse(await fs.readFile(path.join(f.wi, 'work_item.json'), 'utf8'));
    await fs.writeFile(path.join(f.wi, 'work_item.json'), JSON.stringify({ ...metadata, code_change_allowed: true }));
    await expect(planDetachedGitBootstrap(f.input)).rejects.toThrow('IMPLEMENTATION_ALREADY_STARTED');
    await fs.writeFile(path.join(f.wi, 'work_item.json'), JSON.stringify(metadata));
    await git(f.root, 'branch', 'present'); await expect(planDetachedGitBootstrap(f.input)).rejects.toThrow('BRANCHLESS_DETACHED_REQUIRED');
  });
  it('rejects a tracked hard-link alias and retains bytes at both names', async () => {
    const f = await prepared(), alias = path.join(f.wi, 'alias'); await fs.link(path.join(f.root, 'README.md'), alias);
    await expect(executeDetachedGitBootstrap(f.execute)).rejects.toThrow('LINK_OR_SPECIAL_FILE');
    expect(await fs.readFile(alias)).toEqual(f.bytes); expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe('');
  });
  it('does not execute repository hooks or change the index', async () => {
    const f = await fixture(), hook = path.join(f.root, '.git/hooks/reference-transaction'), sentinel = path.join(f.root, '.git/hook-ran');
    await fs.writeFile(hook, '#!/bin/sh\necho ran > "$(git rev-parse --git-dir)/hook-ran"\n', { mode: 0o755 });
    const plan = await planDetachedGitBootstrap(f.input);
    await executeDetachedGitBootstrap({ ...f.input, planSha256: plan.bootstrap_plan_sha256, confirmationQuote: '采用 main + codex/greet-library-wi-0001' });
    await expect(fs.stat(sentinel)).rejects.toMatchObject({ code: 'ENOENT' }); await unchanged(f);
  });
  it('shares mutation exclusion with the normal existing-branch owner and preserves its behavior afterward', async () => {
    const f = await fixture(); await git(f.root, 'switch', '-c', 'main');
    await git(f.root, 'add', '--', '.specforge/work-items/WI-0001/work_item.json'); await git(f.root, 'commit', '-m', 'metadata baseline');
    await withGitBranchMutationLease(f.root, 'WI-0001', async () => {
      await expect(createBranch({ projectRoot: f.root, workItemId: 'WI-0001', branchName: 'codex/ordinary', baseBranch: 'main' })).rejects.toThrow('BUSY');
    });
    expect((await createBranch({ projectRoot: f.root, workItemId: 'WI-0001', branchName: 'codex/ordinary', baseBranch: 'main' })).success).toBe(true);
  });
  it('rejects wrong Runtime state and missing real confirmation through the actual dispatcher', async () => {
    const f = await fixture();
    const dispatcher = new ToolDispatcher({} as any);
    expect(await dispatcher.dispatch({ tool: 'sf_git_branch_create', args: { work_item_id: 'WI-0001', branch_name: f.input.branchName, base_branch: 'main', bootstrap_plan_sha256: '0'.repeat(64) }, context: { directory: f.root, agent: 'sf-orchestrator' } })).toMatchObject({ success: false, error: 'BRANCH_NAME_CONFIRMATION_REQUIRED' });
    const result = await dispatcher.dispatch({ tool: 'sf_git_branch_plan', args: { work_item_id: 'WI-0001', title: 'greet', bootstrap_from_detached: true, expected_head: f.head, base_branch: 'main', branch_name: f.input.branchName }, context: { directory: f.root, agent: 'sf-orchestrator' } });
    expect(result).toMatchObject({ success: false }); expect(await git(f.root, 'for-each-ref', '--format=%(refname)')).toBe('');
  });
  it('consumes actual StateManager events through the real public dispatcher while preserving state and recording normal context', async () => {
    const f = await fixture(), sm = new StateManager(new PersonalPathResolver(), f.root); await sm.initialize();
    // Unit fixture seeds the state owner; this does not claim an end-to-end
    // Candidate approval flow. The deployed original session provides that proof.
    await sm.transition('WI-0001', '', 'post_merge_verified', 'fixture', 'feature_spec');
    const wal = await fs.readFile(path.join(f.root, '.specforge/runtime/events.jsonl'));
    const dispatcher = new ToolDispatcher({ projectManager: { getProjectStateManager: async () => sm } } as any);
    const context = { directory: f.root, worktree: f.root, agent: 'sf-orchestrator' };
    const plan: any = await dispatcher.dispatch({ tool: 'sf_git_branch_plan', context, args: { work_item_id: 'WI-0001', title: 'greet', bootstrap_from_detached: true, expected_head: f.head, base_branch: 'main', branch_name: f.input.branchName } });
    expect(plan.success).toBe(true);
    const result = await dispatcher.dispatch({ tool: 'sf_git_branch_create', context, args: { work_item_id: 'WI-0001', base_branch: 'main', branch_name: f.input.branchName, confirmed: true,
      bootstrap_plan_sha256: plan.bootstrap_plan_sha256, bootstrap_confirmation_quote: '采用 main + codex/greet-library-wi-0001' } });
    expect(result).toMatchObject({ success: true, base_commit: f.head });
    expect(await fs.readFile(path.join(f.root, '.specforge/runtime/events.jsonl'))).toEqual(wal); await unchanged(f);
    expect(await dispatcher.dispatch({ tool: 'sf_git_branch_plan', context: { ...context, agent: 'sf-executor' }, args: { work_item_id: 'WI-0001', title: 'greet', bootstrap_from_detached: true } })).toMatchObject({ success: false });
  });
});
