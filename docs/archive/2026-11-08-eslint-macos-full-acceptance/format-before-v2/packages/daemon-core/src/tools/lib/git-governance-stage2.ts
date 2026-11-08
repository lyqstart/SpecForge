import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { analyzeIgnore, getCurrentBranch, getHeadCommit, normalizeRelativePath, preflight } from './git-governance-core';
import {
  assertFormalVersionSnapshotForGitMerge,
  verifyFormalVersionSnapshotAfterGitMerge,
} from './project-governance-v2.js';

const execFileAsync = promisify(execFile);
export interface GitContextV1 {
  schema_version: string;
  work_item_id: string;
  git_enabled: boolean;
  branch_name: string;
  base_branch: string;
  base_commit: string;
  branch_relationship?: string;
  remote_name?: string | null;
  push_policy?: string;
  merge_policy?: string;
}
export interface GitDiffEntry { status: string; path: string; old_path?: string; }

async function runGit(projectRoot: string, args: string[], allowFailure = false): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code: 0 };
  } catch (err: any) {
    if (allowFailure) return { stdout: String(err?.stdout ?? ''), stderr: String(err?.stderr ?? err?.message ?? ''), code: Number(err?.code ?? 1) };
    throw new Error(`git ${args.join(' ')} failed: ${String(err?.stderr ?? err?.message ?? 'git command failed')}`);
  }
}
export async function readGitContext(projectRoot: string, workItemId: string): Promise<GitContextV1> {
  const contextPath = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, 'git_context.json');
  if (!existsSync(contextPath)) throw new Error(`GIT_CONTEXT_NOT_FOUND: ${normalizeRelativePath(path.relative(projectRoot, contextPath))}`);
  return JSON.parse(await fs.readFile(contextPath, 'utf-8')) as GitContextV1;
}
function parseDiffNameStatus(stdout: string): GitDiffEntry[] {
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/\t+/); const status = parts[0] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) return { status, old_path: normalizeRelativePath(parts[1] ?? ''), path: normalizeRelativePath(parts[2] ?? parts[1] ?? '') };
    return { status, path: normalizeRelativePath(parts[1] ?? '') };
  }).filter(entry => entry.path.length > 0);
}
export async function diffFromBase(projectRoot: string, baseCommit: string): Promise<GitDiffEntry[]> {
  const result = await runGit(projectRoot, ['diff', '--name-status', `${baseCommit}...HEAD`], true);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'GIT_DIFF_FAILED');
  return parseDiffNameStatus(result.stdout);
}
function markdownList(items: Array<{ path: string; reason?: string }>): string {
  if (items.length === 0) return '- 无\n';
  return items.map(item => `- ${item.path}${item.reason ? ` — ${item.reason}` : ''}`).join('\n') + '\n';
}
export async function writeGitAuditReport(projectRoot: string, workItemId: string, report: any): Promise<string> {
  const reportPath = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId, 'git_audit.md');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const body = `# ${workItemId} Git Audit\n\n` +
    `## 结论\n\n- success: ${report.success}\n- audit_passed: ${report.audit_passed}\n- base_commit: ${report.base_commit ?? ''}\n- head_commit: ${report.head_commit ?? ''}\n\n` +
    `## Changed Files\n\n${markdownList((report.changed_files ?? []).map((f: GitDiffEntry) => ({ path: f.path, reason: f.status })))}\n` +
    `## Track\n\n${markdownList(report.ignore_analysis?.track ?? [])}\n` +
    `## Ignore\n\n${markdownList(report.ignore_analysis?.ignore ?? [])}\n` +
    `## Ask\n\n${markdownList(report.ignore_analysis?.ask ?? [])}\n` +
    `## Hard Stop\n\n${markdownList(report.ignore_analysis?.hard_stop ?? [])}\n` +
    `## Errors\n\n${(report.errors ?? []).map((e: string) => `- ${e}`).join('\n') || '- 无'}\n`;
  await fs.writeFile(reportPath, body, 'utf-8');
  return normalizeRelativePath(path.relative(projectRoot, reportPath));
}
export async function gitChangedFilesAudit(input: { projectRoot: string; workItemId: string; allowAskFiles?: boolean; writeReport?: boolean }) {
  const context = await readGitContext(input.projectRoot, input.workItemId);
  const headCommit = await getHeadCommit(input.projectRoot);
  const changedFiles = await diffFromBase(input.projectRoot, context.base_commit);
  const changedPaths = Array.from(new Set(changedFiles.map(entry => entry.path)));
  const ignoreAnalysis = await analyzeIgnore(input.projectRoot, changedPaths, true);
  const errors: string[] = [];
  if (ignoreAnalysis.hard_stop.length > 0) errors.push('HARD_STOP_FILES_DETECTED');
  if (ignoreAnalysis.ask.length > 0 && input.allowAskFiles !== true) errors.push('ASK_FILES_REQUIRE_USER_DECISION');
  const report: any = {
    success: errors.length === 0, audit_passed: errors.length === 0, work_item_id: input.workItemId,
    branch_name: context.branch_name, base_branch: context.base_branch, base_commit: context.base_commit,
    head_commit: headCommit, changed_files: changedFiles, ignore_analysis: ignoreAnalysis, errors,
  };
  if (input.writeReport !== false) report.git_audit_path = await writeGitAuditReport(input.projectRoot, input.workItemId, report);
  return report;
}
export async function gitPushBranch(input: { projectRoot: string; remoteName?: string; branchName?: string; setUpstream?: boolean }) {
  const branch = input.branchName || await getCurrentBranch(input.projectRoot);
  if (!branch) throw new Error('CURRENT_BRANCH_NOT_FOUND');
  const remote = input.remoteName || 'origin';
  const args = input.setUpstream === false ? ['push', remote, branch] : ['push', '-u', remote, branch];
  const result = await runGit(input.projectRoot, args, true);
  return { success: result.code === 0, remote_name: remote, branch_name: branch, stdout: result.stdout, stderr: result.stderr, code: result.code };
}
export interface GitMergeBoundaryInput {
  authoritativeState?: string | null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function worktreeStatusForWorkItemMerge(
  statusEntries: Array<{ path: string }>,
  workItemId: string,
): {
  blocking: Array<{ path: string }>;
  ignored_unrelated_work_item_files: string[];
} {
  const workItemsPrefix = `${SPEC_DIR_NAME}/work-items/`;
  const currentPrefix = `${workItemsPrefix}${workItemId}/`;
  const blocking: Array<{ path: string }> = [];
  const ignored: string[] = [];

  for (const entry of statusEntries) {
    const normalized = normalizeRelativePath(entry.path);
    if (
      normalized.startsWith(workItemsPrefix) &&
      !normalized.startsWith(currentPrefix)
    ) {
      ignored.push(normalized);
      continue;
    }
    blocking.push(entry);
  }

  return {
    blocking,
    ignored_unrelated_work_item_files: Array.from(new Set(ignored)).sort(),
  };
}

export async function gitMergePlan(input: {
  projectRoot: string;
  workItemId: string;
  defaultBranch?: string;
} & GitMergeBoundaryInput) {
  const context = await readGitContext(input.projectRoot, input.workItemId);
  const pf = await preflight(input.projectRoot, input.defaultBranch || context.base_branch || 'main');
  const changedFiles = await diffFromBase(input.projectRoot, context.base_commit);
  const blockingIssues: string[] = [];

  if (input.authoritativeState !== 'closed') {
    blockingIssues.push(
      `AUTHORITATIVE_STATE_CLOSED_REQUIRED: current=${input.authoritativeState ?? 'missing'}`,
    );
  }
  if (pf.current_branch !== context.branch_name) {
    blockingIssues.push(
      `WORK_ITEM_BRANCH_REQUIRED_BEFORE_MERGE_PLAN: current=${pf.current_branch ?? 'missing'}, expected=${context.branch_name}`,
    );
  }
  const scopedWorktree = worktreeStatusForWorkItemMerge(
    pf.status_entries,
    input.workItemId,
  );
  if (scopedWorktree.blocking.length > 0) {
    blockingIssues.push('WORKTREE_NOT_CLEAN_BEFORE_MERGE');
  }
  if (changedFiles.length === 0) blockingIssues.push('NO_WORK_ITEM_DIFF_TO_MERGE');
  try {
    await assertFormalVersionSnapshotForGitMerge(input.projectRoot, input.workItemId);
  } catch (error) {
    blockingIssues.push(error instanceof Error ? error.message : String(error));
  }

  const dedupedIssues = uniqueStrings(blockingIssues);
  return {
    success: true,
    work_item_id: input.workItemId,
    branch_name: context.branch_name,
    base_branch: context.base_branch,
    base_commit: context.base_commit,
    current_branch: pf.current_branch,
    authoritative_state: input.authoritativeState ?? null,
    worktree_clean: scopedWorktree.blocking.length === 0,
    ignored_unrelated_work_item_files:
      scopedWorktree.ignored_unrelated_work_item_files,
    changed_files: changedFiles,
    blocking_issues: dedupedIssues,
    can_merge: dedupedIssues.length === 0,
    repository_delivery_state:
      dedupedIssues.length === 0
        ? 'governance_closed_pending_user_confirmed_git_merge'
        : 'git_merge_blocked',
    required_next_step: 'explicit_user_confirmation_before_merge_to_default_branch',
  };
}

export async function gitMergeRun(input: {
  projectRoot: string;
  workItemId: string;
  confirmed: boolean;
  remoteName?: string;
  message?: string;
  pullFirst?: boolean;
} & GitMergeBoundaryInput) {
  if (input.confirmed !== true) throw new Error('MERGE_REQUIRES_USER_CONFIRMATION');
  if (input.authoritativeState !== 'closed') {
    throw new Error(
      `AUTHORITATIVE_STATE_CLOSED_REQUIRED: current=${input.authoritativeState ?? 'missing'}`,
    );
  }

  const context = await readGitContext(input.projectRoot, input.workItemId);
  const defaultBranch = context.base_branch || 'main';
  const pf = await preflight(input.projectRoot, defaultBranch);
  if (pf.current_branch !== context.branch_name) {
    throw new Error(
      `WORK_ITEM_BRANCH_REQUIRED_BEFORE_GIT_MERGE: current=${pf.current_branch ?? 'missing'}, expected=${context.branch_name}`,
    );
  }
  const scopedWorktree = worktreeStatusForWorkItemMerge(
    pf.status_entries,
    input.workItemId,
  );
  if (scopedWorktree.blocking.length > 0) {
    throw new Error('WORKTREE_NOT_CLEAN_BEFORE_MERGE');
  }

  await assertFormalVersionSnapshotForGitMerge(input.projectRoot, input.workItemId);
  const featureHead = await getHeadCommit(input.projectRoot);
  if (!featureHead) throw new Error('WORK_ITEM_BRANCH_HEAD_NOT_FOUND');

  const configuredRemoteNames = new Set(pf.remotes.map(remote => remote.name));
  const requestedRemote = input.remoteName || context.remote_name || undefined;
  const remote = requestedRemote || (configuredRemoteNames.has('origin') ? 'origin' : undefined);
  if (requestedRemote && !configuredRemoteNames.has(requestedRemote)) {
    throw new Error(`GIT_REMOTE_NOT_FOUND: ${requestedRemote}`);
  }

  await runGit(input.projectRoot, ['switch', defaultBranch]);
  let pullPerformed = false;
  if (input.pullFirst !== false && remote) {
    await runGit(input.projectRoot, ['pull', '--ff-only', remote, defaultBranch]);
    pullPerformed = true;
  }

  const message = input.message || `merge: ${input.workItemId} ${context.branch_name}`;
  const result = await runGit(
    input.projectRoot,
    ['merge', '--no-ff', context.branch_name, '-m', message],
    true,
  );
  const headCommit = await getHeadCommit(input.projectRoot);
  return {
    success: result.code === 0,
    work_item_id: input.workItemId,
    authoritative_state: input.authoritativeState,
    merged_branch: context.branch_name,
    feature_head: featureHead,
    target_branch: defaultBranch,
    target_head: headCommit,
    pull_performed: pullPerformed,
    ignored_unrelated_work_item_files:
      scopedWorktree.ignored_unrelated_work_item_files,
    remote_name: remote ?? null,
    repository_delivery_state:
      result.code === 0 ? 'git_merged_pending_post_merge_verify' : 'git_merge_failed',
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
  };
}

export async function gitPostMergeVerify(input: {
  projectRoot: string;
  workItemId: string;
  commands?: string[];
} & GitMergeBoundaryInput) {
  if (input.authoritativeState !== 'closed') {
    throw new Error(
      `AUTHORITATIVE_STATE_CLOSED_REQUIRED: current=${input.authoritativeState ?? 'missing'}`,
    );
  }
  const context = await readGitContext(input.projectRoot, input.workItemId);
  const pf = await preflight(input.projectRoot, context.base_branch || 'main');
  if (pf.current_branch !== context.base_branch) {
    throw new Error(
      `POST_MERGE_TARGET_BRANCH_REQUIRED: current=${pf.current_branch ?? 'missing'}, expected=${context.base_branch}`,
    );
  }
  const scopedWorktree = worktreeStatusForWorkItemMerge(
    pf.status_entries,
    input.workItemId,
  );
  if (scopedWorktree.blocking.length > 0) {
    throw new Error('POST_MERGE_WORKTREE_NOT_CLEAN');
  }
  const headCommit = await getHeadCommit(input.projectRoot);
  if (!headCommit) throw new Error('POST_MERGE_HEAD_NOT_FOUND');

  const ancestor = await runGit(
    input.projectRoot,
    ['merge-base', '--is-ancestor', context.branch_name, headCommit],
    true,
  );
  if (ancestor.code !== 0) {
    throw new Error('POST_MERGE_WORK_ITEM_BRANCH_NOT_ANCESTOR');
  }
  const parentResult = await runGit(
    input.projectRoot,
    ['rev-list', '--parents', '-n', '1', headCommit],
    true,
  );
  const mergeCommit = parentResult.code === 0 && parentResult.stdout.trim().split(/\s+/).length >= 3;
  if (!mergeCommit) throw new Error('POST_MERGE_NO_FAN_IN_MERGE_COMMIT');

  const formalVersion = await verifyFormalVersionSnapshotAfterGitMerge(
    input.projectRoot,
    input.workItemId,
    headCommit,
  );
  return {
    success: true,
    work_item_id: input.workItemId,
    authoritative_state: input.authoritativeState,
    target_branch: context.base_branch,
    merged_branch: context.branch_name,
    head_commit: headCommit,
    worktree_clean: true,
    ignored_unrelated_work_item_files:
      scopedWorktree.ignored_unrelated_work_item_files,
    work_item_branch_is_ancestor: true,
    merge_commit: true,
    formal_version: formalVersion,
    verification_mode: 'actual_git_merge_verification',
    commands: input.commands ?? [],
    repository_delivery_complete: true,
    repository_delivery_state: 'closed_and_git_merged',
  };
}
