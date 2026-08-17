import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

const execFileAsync = promisify(execFile);

export type GitFileDecision = 'track' | 'ignore' | 'ask' | 'hard_stop';
export type GitStatusKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown';

export interface GitStatusEntry {
  path: string;
  raw: string;
  index: string;
  worktree: string;
  kind: GitStatusKind;
}

export interface GitIgnoreFinding {
  path: string;
  decision: GitFileDecision;
  reason: string;
  status?: GitStatusKind;
}

export interface GitIgnoreAnalysisResult {
  success: boolean;
  project_root: string;
  generated_at: string;
  track: GitIgnoreFinding[];
  ignore: GitIgnoreFinding[];
  ask: GitIgnoreFinding[];
  hard_stop: GitIgnoreFinding[];
  status_entries: GitStatusEntry[];
  assessment_path?: string;
}

export interface GitPreflightResult {
  success: boolean;
  project_root: string;
  inside_work_tree: boolean;
  current_branch: string | null;
  head_commit: string | null;
  default_branch: string;
  on_default_branch: boolean;
  worktree_clean: boolean;
  status_entries: GitStatusEntry[];
  remotes: Array<{ name: string; url: string; kind: 'fetch' | 'push' }>;
  warnings: string[];
  errors: string[];
}

export interface BranchPlanResult {
  success: boolean;
  work_item_id: string;
  work_item_type: string;
  title: string;
  candidates: string[];
  recommended: string;
}

export interface BranchCreateResult {
  success: boolean;
  work_item_id: string;
  branch_name: string;
  base_branch: string;
  base_commit: string;
  git_context_path: string;
  message: string;
  bootstrap_mode?: 'unborn_default_branch_empty_commit';
  bootstrap_commit_created?: boolean;
  bootstrap_commit?: string;
}

export interface CheckpointCommitResult {
  success: boolean;
  committed: boolean;
  branch: string | null;
  commit: string | null;
  message: string;
  staged_files: string[];
  ignored_files: GitIgnoreFinding[];
  ask_files: GitIgnoreFinding[];
  hard_stop_files: GitIgnoreFinding[];
  dry_run: boolean;
}

export function normalizeSlashes(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function normalizeRelativePath(value: string): string {
  return normalizeSlashes(value).replace(/^\.\//, '').trim();
}

export function isForbiddenExactGitAdd(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '.' || trimmed === '-A' || trimmed === '--all';
}

export function validateProjectRelativePath(input: string): { valid: boolean; reason?: string; path?: string } {
  const rel = normalizeRelativePath(input).replace(/^['"]|['"]$/g, '');
  if (!rel) return { valid: false, reason: 'empty_path' };
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return { valid: false, reason: 'absolute_path_not_allowed' };
  if (rel.includes('..')) return { valid: false, reason: 'parent_traversal_not_allowed' };
  if (rel.includes('~')) return { valid: false, reason: 'home_shorthand_not_allowed' };
  if (isForbiddenExactGitAdd(rel)) return { valid: false, reason: 'git_add_dot_or_all_forbidden' };
  return { valid: true, path: rel };
}

async function runGit(projectRoot: string, args: string[], allowFailure = false): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code: 0 };
  } catch (err: any) {
    if (allowFailure) {
      return {
        stdout: String(err?.stdout ?? ''),
        stderr: String(err?.stderr ?? err?.message ?? ''),
        code: Number(err?.code ?? 1),
      };
    }
    const message = String(err?.stderr ?? err?.message ?? 'git command failed');
    throw new Error(`git ${args.join(' ')} failed: ${message}`);
  }
}

export async function isGitWorkTree(projectRoot: string): Promise<boolean> {
  const result = await runGit(projectRoot, ['rev-parse', '--is-inside-work-tree'], true);
  return result.code === 0 && result.stdout.trim() === 'true';
}

export async function getCurrentBranch(projectRoot: string): Promise<string | null> {
  const result = await runGit(projectRoot, ['branch', '--show-current'], true);
  const branch = result.stdout.trim();
  return branch || null;
}

export async function getHeadCommit(projectRoot: string): Promise<string | null> {
  const result = await runGit(projectRoot, ['rev-parse', 'HEAD'], true);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export async function getRemotes(projectRoot: string): Promise<Array<{ name: string; url: string; kind: 'fetch' | 'push' }>> {
  const result = await runGit(projectRoot, ['remote', '-v'], true);
  if (result.code !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) return null;
      return { name: match[1], url: match[2], kind: match[3] as 'fetch' | 'push' };
    })
    .filter((entry): entry is { name: string; url: string; kind: 'fetch' | 'push' } => entry !== null);
}

function statusKind(index: string, worktree: string): GitStatusKind {
  if (index === '?' && worktree === '?') return 'untracked';
  if (index === 'R' || worktree === 'R') return 'renamed';
  if (index === 'C' || worktree === 'C') return 'copied';
  if (index === 'D' || worktree === 'D') return 'deleted';
  if (index === 'A' || worktree === 'A') return 'added';
  if (index === 'M' || worktree === 'M') return 'modified';
  return 'unknown';
}

export function parseGitStatusShort(stdout: string): GitStatusEntry[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map((line) => {
      const index = line[0] ?? ' ';
      const worktree = line[1] ?? ' ';
      let filePath = line.slice(3).trim();
      if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop()!.trim();
      return {
        path: normalizeRelativePath(filePath),
        raw: line,
        index,
        worktree,
        kind: statusKind(index, worktree),
      };
    });
}

export async function getStatusEntries(projectRoot: string): Promise<GitStatusEntry[]> {
  const result = await runGit(projectRoot, ['status', '--short', '--untracked-files=all'], true);
  return result.code === 0 ? parseGitStatusShort(result.stdout) : [];
}

function hasSegment(filePath: string, segment: string): boolean {
  return normalizeSlashes(filePath).split('/').includes(segment);
}

function ext(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function base(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

function classifyGitPath(filePath: string): { decision: GitFileDecision; reason: string } {
  const p = normalizeRelativePath(filePath);
  const lower = p.toLowerCase();
  const b = base(lower);
  const e = ext(lower);

  if (lower.startsWith(`${SPEC_DIR_NAME}/runtime/`) || lower.startsWith(`${SPEC_DIR_NAME}/logs/`)) {
    return { decision: 'ignore', reason: '.specforge runtime/logs are gitignored runtime data' };
  }
  if (lower.startsWith(`${SPEC_DIR_NAME}/project/`) || lower.startsWith(`${SPEC_DIR_NAME}/work-items/`)) {
    return { decision: 'track', reason: 'SpecForge committed governance artifact' };
  }
  if (lower === `${SPEC_DIR_NAME}/.gitignore`) return { decision: 'track', reason: 'SpecForge local ignore rule file' };

  if (b === '.env' || b.startsWith('.env.') || ['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore'].includes(e)) {
    return { decision: 'hard_stop', reason: 'sensitive credential or signing key candidate' };
  }
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(b)) {
    return { decision: e === '.pub' ? 'ask' : 'hard_stop', reason: 'SSH identity file candidate' };
  }
  if (lower.endsWith('/local.properties') || lower === 'local.properties') {
    return { decision: 'ignore', reason: 'local machine Android SDK path file' };
  }
  if (hasSegment(lower, 'node_modules')) return { decision: 'ignore', reason: 'dependency cache directory' };
  if (hasSegment(lower, 'target')) return { decision: 'ignore', reason: 'Maven build output directory' };
  if (hasSegment(lower, '.gradle')) return { decision: 'ignore', reason: 'Gradle cache/runtime directory' };
  if (hasSegment(lower, 'dist') || hasSegment(lower, 'coverage') || hasSegment(lower, '.next') || hasSegment(lower, '.nuxt')) {
    return { decision: 'ignore', reason: 'generated build/test output directory' };
  }
  if (hasSegment(lower, 'build') && b !== 'build.gradle' && b !== 'build.gradle.kts') {
    return { decision: 'ignore', reason: 'generated build output directory' };
  }
  if (['.class', '.log', '.tmp', '.cache', '.apk', '.aab', '.ipa'].includes(e)) {
    return { decision: 'ignore', reason: 'generated binary/log/cache artifact' };
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(e)) {
    return { decision: 'ask', reason: 'archive may be delivery artifact or temporary build output' };
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.java', '.kt', '.kts', '.py', '.go', '.rs', '.sql', '.md', '.json', '.yml', '.yaml', '.xml', '.gradle', '.properties', '.toml', '.sh', '.ps1', '.bat', '.css', '.scss', '.html'].includes(e)) {
    return { decision: 'track', reason: 'source/config/documentation file' };
  }
  if (['.doc', '.docx', '.xls', '.xlsx', '.pdf'].includes(e)) {
    return { decision: 'ask', reason: 'office/pdf file may be project document or generated artifact' };
  }
  return { decision: 'ask', reason: 'unclassified file type requires user decision' };
}

export async function analyzeIgnore(projectRoot: string, paths?: string[], writeAssessment = true): Promise<GitIgnoreAnalysisResult> {
  const statusEntries = await getStatusEntries(projectRoot);
  const entryByPath = new Map(statusEntries.map((entry) => [entry.path, entry]));
  const candidatePaths = paths && paths.length > 0 ? paths.map(normalizeRelativePath) : statusEntries.map((entry) => entry.path);
  const uniquePaths = Array.from(new Set(candidatePaths)).filter(Boolean);
  const findings = uniquePaths.map((filePath) => {
    const classification = classifyGitPath(filePath);
    return {
      path: filePath,
      decision: classification.decision,
      reason: classification.reason,
      status: entryByPath.get(filePath)?.kind,
    } satisfies GitIgnoreFinding;
  });
  const result: GitIgnoreAnalysisResult = {
    success: true,
    project_root: projectRoot,
    generated_at: new Date().toISOString(),
    track: findings.filter((f) => f.decision === 'track'),
    ignore: findings.filter((f) => f.decision === 'ignore'),
    ask: findings.filter((f) => f.decision === 'ask'),
    hard_stop: findings.filter((f) => f.decision === 'hard_stop'),
    status_entries: statusEntries,
  };
  if (writeAssessment) {
    const assessmentPath = path.join(projectRoot, SPEC_DIR_NAME, 'runtime', 'git_ignore_assessment.json');
    await fs.mkdir(path.dirname(assessmentPath), { recursive: true });
    await fs.writeFile(assessmentPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
    result.assessment_path = normalizeRelativePath(path.relative(projectRoot, assessmentPath));
  }
  return result;
}

export async function preflight(projectRoot: string, defaultBranch = 'main'): Promise<GitPreflightResult> {
  const inside = await isGitWorkTree(projectRoot);
  if (!inside) {
    return {
      success: false,
      project_root: projectRoot,
      inside_work_tree: false,
      current_branch: null,
      head_commit: null,
      default_branch: defaultBranch,
      on_default_branch: false,
      worktree_clean: false,
      status_entries: [],
      remotes: [],
      warnings: [],
      errors: ['NOT_A_GIT_WORK_TREE'],
    };
  }
  const currentBranch = await getCurrentBranch(projectRoot);
  const statusEntries = await getStatusEntries(projectRoot);
  const remotes = await getRemotes(projectRoot);
  const headCommit = await getHeadCommit(projectRoot);
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!currentBranch) warnings.push('DETACHED_HEAD_OR_UNKNOWN_BRANCH');
  if (statusEntries.length > 0) warnings.push('WORKTREE_NOT_CLEAN');
  return {
    success: errors.length === 0,
    project_root: projectRoot,
    inside_work_tree: true,
    current_branch: currentBranch,
    head_commit: headCommit,
    default_branch: defaultBranch,
    on_default_branch: currentBranch === defaultBranch,
    worktree_clean: statusEntries.length === 0,
    status_entries: statusEntries,
    remotes,
    warnings,
    errors,
  };
}

function slugify(input: string): string {
  const ascii = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return ascii || 'work-item';
}

function normalizeWorkItemType(type: string): string {
  const t = slugify(type || 'feature');
  if (['bug', 'bugfix', 'fix'].includes(t)) return 'fix';
  if (['ops', 'environment', 'env'].includes(t)) return 'ops';
  if (['refactor'].includes(t)) return 'refactor';
  if (['hotfix'].includes(t)) return 'hotfix';
  if (['investigation', 'review', 'audit'].includes(t)) return 'investigation';
  return 'feature';
}

export function branchPlan(input: { workItemId: string; title: string; workItemType?: string }): BranchPlanResult {
  const workItemId = input.workItemId.trim();
  const type = normalizeWorkItemType(input.workItemType ?? 'feature');
  const slug = slugify(input.title).slice(0, 60).replace(/-+$/g, '') || 'work-item';
  const wiSuffix = workItemId.toLowerCase().replace(/^wi-?/, 'wi-');
  const candidates = Array.from(new Set([
    `${type}/${slug}-${wiSuffix}`,
    `${type}/${slug.split('-').slice(0, 4).join('-')}-${wiSuffix}`,
    `${type}/specforge-${slug.split('-').slice(0, 3).join('-')}-${wiSuffix}`,
  ]));
  return { success: true, work_item_id: workItemId, work_item_type: type, title: input.title, candidates, recommended: candidates[0] };
}

export async function branchExists(projectRoot: string, branchName: string): Promise<boolean> {
  const result = await runGit(projectRoot, ['rev-parse', '--verify', branchName], true);
  return result.code === 0;
}

export async function createBranch(input: { projectRoot: string; workItemId: string; branchName: string; baseBranch?: string; requireClean?: boolean }): Promise<BranchCreateResult> {
  const projectRoot = input.projectRoot;
  const baseBranch = input.baseBranch || 'main';
  const requireClean = input.requireClean !== false;
  const pf = await preflight(projectRoot, baseBranch);
  if (!pf.inside_work_tree) throw new Error('NOT_A_GIT_WORK_TREE');

  const unbornDefaultBranch =
    pf.current_branch === baseBranch && pf.head_commit === null;

  if (unbornDefaultBranch) {
    const invalidBootstrapEntries = pf.status_entries.filter(
      (entry) =>
        entry.kind !== 'untracked' ||
        !normalizeRelativePath(entry.path).startsWith(`${SPEC_DIR_NAME}/`),
    );
    if (invalidBootstrapEntries.length > 0) {
      throw new Error(
        `UNBORN_DEFAULT_BRANCH_BOOTSTRAP_SCOPE_VIOLATION: ${invalidBootstrapEntries
          .map((entry) => entry.path)
          .sort()
          .join(',')}`,
      );
    }
  } else if (requireClean && !pf.worktree_clean) {
    throw new Error('WORKTREE_NOT_CLEAN_BEFORE_BRANCH_CREATE');
  }

  if (await branchExists(projectRoot, input.branchName)) {
    throw new Error(`BRANCH_ALREADY_EXISTS: ${input.branchName}`);
  }

  if (pf.current_branch !== baseBranch) {
    await runGit(projectRoot, ['switch', baseBranch]);
  }

  let baseCommit = await getHeadCommit(projectRoot);
  let bootstrapCommitCreated = false;
  if (!baseCommit) {
    if (!unbornDefaultBranch) throw new Error('BASE_COMMIT_NOT_FOUND');

    const bootstrapResult = await runGit(
      projectRoot,
      ['commit', '--allow-empty', '-m', 'chore: initialize SpecForge git baseline'],
      true,
    );
    if (bootstrapResult.code !== 0) {
      throw new Error(
        `UNBORN_DEFAULT_BRANCH_BOOTSTRAP_COMMIT_FAILED: ${
          bootstrapResult.stderr || bootstrapResult.stdout || 'git commit failed'
        }`,
      );
    }
    baseCommit = await getHeadCommit(projectRoot);
    if (!baseCommit) {
      throw new Error('UNBORN_DEFAULT_BRANCH_BOOTSTRAP_COMMIT_NOT_FOUND');
    }
    bootstrapCommitCreated = true;
  }

  await runGit(projectRoot, ['switch', '-c', input.branchName]);
  const wiDir = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', input.workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  const contextPath = path.join(wiDir, 'git_context.json');
  const context = {
    schema_version: '1.0',
    work_item_id: input.workItemId,
    git_enabled: true,
    branch_name: input.branchName,
    base_branch: baseBranch,
    base_commit: baseCommit,
    branch_relationship: 'primary',
    remote_name: null,
    push_policy: 'not_configured',
    merge_policy: 'requires_user_confirmation',
    created_at: new Date().toISOString(),
  };
  await fs.writeFile(contextPath, JSON.stringify(context, null, 2) + '\n', 'utf-8');
  return {
    success: true,
    work_item_id: input.workItemId,
    branch_name: input.branchName,
    base_branch: baseBranch,
    base_commit: baseCommit,
    git_context_path: normalizeRelativePath(path.relative(projectRoot, contextPath)),
    message: 'branch_created_and_git_context_written',
    ...(bootstrapCommitCreated
      ? {
          bootstrap_mode: 'unborn_default_branch_empty_commit' as const,
          bootstrap_commit_created: true,
          bootstrap_commit: baseCommit,
        }
      : {}),
  };
}

export async function checkpointCommit(input: { projectRoot: string; workItemId?: string; files?: string[]; message: string; defaultBranch?: string; dryRun?: boolean; allowAskFiles?: boolean }): Promise<CheckpointCommitResult> {
  const projectRoot = input.projectRoot;
  const defaultBranch = input.defaultBranch || 'main';
  const branch = await getCurrentBranch(projectRoot);
  if (branch === defaultBranch) throw new Error('MAIN_WRITE_GUARD_BLOCKED: checkpoint commit on default branch is forbidden');
  if (!input.message || input.message.trim().length < 8) throw new Error('COMMIT_MESSAGE_REQUIRED');
  const rawFiles = input.files && input.files.length > 0 ? input.files : (await getStatusEntries(projectRoot)).map((entry) => entry.path);
  const normalizedFiles = Array.from(new Set(rawFiles.map((file) => {
    const valid = validateProjectRelativePath(file);
    if (!valid.valid || !valid.path) throw new Error(`INVALID_COMMIT_FILE_PATH: ${file} (${valid.reason})`);
    return valid.path;
  })));
  const analysis = await analyzeIgnore(projectRoot, normalizedFiles, true);
  if (analysis.hard_stop.length > 0) {
    return {
      success: false,
      committed: false,
      branch,
      commit: null,
      message: 'hard_stop_files_detected',
      staged_files: [],
      ignored_files: analysis.ignore,
      ask_files: analysis.ask,
      hard_stop_files: analysis.hard_stop,
      dry_run: input.dryRun === true,
    };
  }
  if (analysis.ask.length > 0 && input.allowAskFiles !== true) {
    return {
      success: false,
      committed: false,
      branch,
      commit: null,
      message: 'ask_files_require_user_decision',
      staged_files: [],
      ignored_files: analysis.ignore,
      ask_files: analysis.ask,
      hard_stop_files: [],
      dry_run: input.dryRun === true,
    };
  }
  const staged = [...analysis.track.map((f) => f.path), ...(input.allowAskFiles ? analysis.ask.map((f) => f.path) : [])];
  if (staged.length === 0) {
    return {
      success: true,
      committed: false,
      branch,
      commit: null,
      message: 'nothing_to_commit_after_ignore_analysis',
      staged_files: [],
      ignored_files: analysis.ignore,
      ask_files: analysis.ask,
      hard_stop_files: [],
      dry_run: input.dryRun === true,
    };
  }
  if (input.dryRun === true) {
    return {
      success: true,
      committed: false,
      branch,
      commit: null,
      message: 'dry_run_only',
      staged_files: staged,
      ignored_files: analysis.ignore,
      ask_files: analysis.ask,
      hard_stop_files: [],
      dry_run: true,
    };
  }
  await runGit(projectRoot, ['add', '--', ...staged]);
  const commitResult = await runGit(projectRoot, ['commit', '-m', input.message], true);
  if (commitResult.code !== 0) {
    return {
      success: false,
      committed: false,
      branch,
      commit: null,
      message: commitResult.stderr || commitResult.stdout || 'git commit failed',
      staged_files: staged,
      ignored_files: analysis.ignore,
      ask_files: analysis.ask,
      hard_stop_files: [],
      dry_run: false,
    };
  }
  const commit = await getHeadCommit(projectRoot);
  return {
    success: true,
    committed: true,
    branch,
    commit,
    message: 'checkpoint_commit_created',
    staged_files: staged,
    ignored_files: analysis.ignore,
    ask_files: analysis.ask,
    hard_stop_files: [],
    dry_run: false,
  };
}
