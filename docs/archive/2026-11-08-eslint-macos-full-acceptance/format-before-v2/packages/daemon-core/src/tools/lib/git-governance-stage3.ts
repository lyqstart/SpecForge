import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { resolveSpecForgeUserPath } from '@specforge/types/user-level-paths';
import {
  analyzeIgnore,
  classifyRegenerableArtifactPath,
  getCurrentBranch,
  getHeadCommit,
  normalizeRelativePath,
  preflight,
  validateProjectRelativePath,
} from './git-governance-core';
import {
  assertGitGovernanceWriteProvenanceCurrent,
  recordGitGovernanceProjectWrites,
} from './git-governance-write-provenance';

const execFileAsync = promisify(execFile);

async function runGit(projectRoot: string, args: string[], allowFailure = false): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code: 0 };
  } catch (err: any) {
    if (allowFailure) return { stdout: String(err?.stdout ?? ''), stderr: String(err?.stderr ?? err?.message ?? ''), code: Number(err?.code ?? 1) };
    throw new Error(`git ${args.join(' ')} failed: ${String(err?.stderr ?? err?.message ?? 'git command failed')}`);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

const GITIGNORE_MANAGED_START = '# >>> SpecForge governed ignore decisions >>>';
const GITIGNORE_MANAGED_END = '# <<< SpecForge governed ignore decisions <<<';

function gitIgnorePattern(value: string): string {
  const normalized = normalizeRelativePath(value).replace(/\/$/, '');
  const directory = path.basename(normalized).toLowerCase() === 'node_modules';
  return `/${normalized}${directory ? '/' : ''}`;
}

function renderGovernedGitIgnore(
  existing: string,
  decisions: Array<{ path: string; decision: string }>,
): { content: string; ignored_paths: string[] } {
  const start = existing.indexOf(GITIGNORE_MANAGED_START);
  const end = existing.indexOf(GITIGNORE_MANAGED_END);
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
    throw new Error('GIT_IGNORE_MANAGED_BLOCK_INVALID');
  }

  const prefix = start >= 0 ? existing.slice(0, start) : existing;
  const suffix = end >= 0 ? existing.slice(end + GITIGNORE_MANAGED_END.length) : '';
  const ignoredPaths = decisions
    .filter(item => item.decision === 'ignore')
    .map(item => normalizeRelativePath(item.path))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const block = [
    GITIGNORE_MANAGED_START,
    ...ignoredPaths.map(gitIgnorePattern),
    GITIGNORE_MANAGED_END,
  ].join('\n');
  const parts = [prefix.trimEnd(), block, suffix.trimStart()].filter(part => part.length > 0);
  return { content: `${parts.join('\n')}\n`, ignored_paths: ignoredPaths };
}

async function readJsonIfExists<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function specProjectPath(projectRoot: string, ...parts: string[]): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'project', ...parts);
}

function specRuntimePath(projectRoot: string, ...parts: string[]): string {
  return path.join(projectRoot, SPEC_DIR_NAME, 'runtime', ...parts);
}

function userGitDir(): string {
  return resolveSpecForgeUserPath('git');
}

function parseRemotes(stdout: string) {
  const remotes: Record<string, { fetch_url?: string; push_url?: string }> = {};
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, kind] = match;
    remotes[name] ||= {};
    if (kind === 'fetch') remotes[name].fetch_url = url;
    if (kind === 'push') remotes[name].push_url = url;
  }
  return remotes;
}

function inferProvider(url: string | undefined): string {
  const text = String(url ?? '').toLowerCase();
  if (text.includes('github.com')) return 'github';
  if (text.includes('gitlab.com')) return 'gitlab';
  if (text.includes('gitee.com')) return 'gitee';
  if (text.includes('bitbucket.org')) return 'bitbucket';
  if (text.startsWith('file://') || text.startsWith('/') || /^[a-z]:[\\/]/i.test(text)) return 'local_bare_or_filesystem';
  if (text.includes('http') || text.includes('@')) return 'generic_git';
  return 'unknown';
}

export async function gitProjectAdopt(input: { projectRoot: string; defaultBranch?: string; confirmed?: boolean; writeReport?: boolean }) {
  if (input.confirmed !== true) throw new Error('PROJECT_ADOPTION_REQUIRES_USER_CONFIRMATION');
  assertGitGovernanceWriteProvenanceCurrent(input.projectRoot);
  const defaultBranch = input.defaultBranch || 'main';
  const pf = await preflight(input.projectRoot, defaultBranch);
  const headCommit = await getHeadCommit(input.projectRoot).catch(() => '');
  const branch = await getCurrentBranch(input.projectRoot).catch(() => '');
  const ignoreAnalysis = await analyzeIgnore(input.projectRoot, [], true);
  const status = await runGit(input.projectRoot, ['status', '--porcelain=v1'], true);

  const policyPath = specProjectPath(input.projectRoot, 'git_policy.json');
  const existingPolicy = await readJsonIfExists<any>(policyPath, {});
  const policy = {
    schema_version: 'git_governance.v1',
    git_governance_enabled: true,
    adopted_existing_project: true,
    adopted_at: new Date().toISOString(),
    default_branch: defaultBranch,
    main_write_protection: true,
    precise_commit_only: true,
    forbidden_commands: ['git add .', 'git add -A', 'git clean -fd', 'git restore .', 'git push --mirror'],
    branch_strategy: 'semantic_branch_per_change_when_needed',
    ...existingPolicy,
  };
  await writeJson(policyPath, policy);

  const decisionsPath = specProjectPath(input.projectRoot, 'git_ignore_decisions.json');
  const existingDecisions = await readJsonIfExists<any>(decisionsPath, { schema_version: 'git_ignore_decisions.v1', decisions: [] });
  await writeJson(decisionsPath, { schema_version: 'git_ignore_decisions.v1', updated_at: new Date().toISOString(), decisions: existingDecisions.decisions ?? [] });

  const report = {
    success: true,
    adopted: true,
    default_branch: defaultBranch,
    current_branch: branch || pf.current_branch,
    head_commit: headCommit,
    worktree_clean: pf.worktree_clean,
    status_entries: status.stdout.split(/\r?\n/).filter(Boolean),
    ignore_analysis: ignoreAnalysis,
    policy_path: normalizeRelativePath(path.relative(input.projectRoot, policyPath)),
    decisions_path: normalizeRelativePath(path.relative(input.projectRoot, decisionsPath)),
  };

  let reportPath: string | undefined;
  if (input.writeReport !== false) {
    const outPath = specProjectPath(input.projectRoot, 'git_adoption_report.md');
    const body = `# Git Project Adoption Report\n\n` +
      `- success: ${report.success}\n` +
      `- default_branch: ${defaultBranch}\n` +
      `- current_branch: ${report.current_branch}\n` +
      `- head_commit: ${headCommit}\n` +
      `- worktree_clean: ${report.worktree_clean}\n\n` +
      `## Status Entries\n\n${report.status_entries.length ? report.status_entries.map((s) => `- ${s}`).join('\n') : '- 无'}\n`;
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, body, 'utf-8');
    reportPath = normalizeRelativePath(path.relative(input.projectRoot, outPath));
  }

  recordGitGovernanceProjectWrites(input.projectRoot, 'sf_git_project_adopt', [
    normalizeRelativePath(path.relative(input.projectRoot, policyPath)),
    normalizeRelativePath(path.relative(input.projectRoot, decisionsPath)),
    ...(reportPath ? [reportPath] : []),
  ]);
  return { ...report, report_path: reportPath };
}

export async function gitRemoteConfig(input: { projectRoot: string; remoteName?: string; fetchUrl?: string; pushUrl?: string; authProfile?: string; applyRemote?: boolean; confirmed?: boolean }) {
  const remoteName = input.remoteName || 'origin';
  const existing = parseRemotes((await runGit(input.projectRoot, ['remote', '-v'], true)).stdout);
  const current = existing[remoteName] ?? {};
  const fetchUrl = input.fetchUrl || current.fetch_url || '';
  const pushUrl = input.pushUrl || current.push_url || fetchUrl;
  const provider = inferProvider(fetchUrl || pushUrl);
  const config = {
    schema_version: 'git_remote.v1',
    remote_name: remoteName,
    provider_type: provider,
    fetch_url: fetchUrl,
    push_url: pushUrl,
    auth_profile: input.authProfile ?? null,
    updated_at: new Date().toISOString(),
  };
  await writeJson(specRuntimePath(input.projectRoot, 'git_remote.json'), config);

  let applied = false;
  let apply_result: any = null;
  if (input.applyRemote === true) {
    if (input.confirmed !== true) throw new Error('REMOTE_APPLY_REQUIRES_USER_CONFIRMATION');
    if (!fetchUrl) throw new Error('REMOTE_FETCH_URL_REQUIRED');
    const exists = Boolean(existing[remoteName]);
    const args = exists ? ['remote', 'set-url', remoteName, fetchUrl] : ['remote', 'add', remoteName, fetchUrl];
    apply_result = await runGit(input.projectRoot, args, true);
    if (pushUrl && pushUrl !== fetchUrl) await runGit(input.projectRoot, ['remote', 'set-url', '--push', remoteName, pushUrl], true);
    applied = apply_result.code === 0;
  }

  return {
    success: true,
    config_path: normalizeRelativePath(path.relative(input.projectRoot, specRuntimePath(input.projectRoot, 'git_remote.json'))),
    remote: config,
    existing_remotes: existing,
    applied,
    apply_result,
  };
}

export async function gitAuthProfileConfig(input: { profileName: string; provider?: string; method: 'ssh' | 'token_env' | 'none'; sshKeyPath?: string; sshHostAlias?: string; tokenEnvVar?: string; gitUserName?: string; gitUserEmail?: string; confirmed?: boolean }) {
  if (input.confirmed !== true) throw new Error('AUTH_PROFILE_WRITE_REQUIRES_USER_CONFIRMATION');
  const profileName = String(input.profileName || '').trim();
  if (!profileName) throw new Error('PROFILE_NAME_REQUIRED');
  const profilesPath = path.join(userGitDir(), 'auth_profiles.json');
  const existing = await readJsonIfExists<any>(profilesPath, { schema_version: 'git_auth_profiles.v1', profiles: {} });
  const profile = {
    provider: input.provider || 'generic_git',
    method: input.method,
    ssh_key_path: input.sshKeyPath ?? null,
    ssh_host_alias: input.sshHostAlias ?? null,
    token_env_var: input.tokenEnvVar ?? null,
    git_user_name: input.gitUserName ?? null,
    git_user_email: input.gitUserEmail ?? null,
    updated_at: new Date().toISOString(),
  };
  const next = { schema_version: 'git_auth_profiles.v1', updated_at: new Date().toISOString(), profiles: { ...(existing.profiles ?? {}), [profileName]: profile } };
  await writeJson(profilesPath, next);
  return { success: true, profile_name: profileName, profiles_path: profilesPath, profile: { ...profile, token_value_stored: false } };
}

export async function gitIgnoreDecisionRecord(input: { projectRoot: string; decisions: Array<{ path: string; decision: 'track' | 'ignore' | 'ask' | 'hard_stop'; reason?: string }>; confirmed?: boolean }) {
  if (input.confirmed !== true) throw new Error('IGNORE_DECISION_RECORD_REQUIRES_USER_CONFIRMATION');
  assertGitGovernanceWriteProvenanceCurrent(input.projectRoot);
  const decisionsPath = specProjectPath(input.projectRoot, 'git_ignore_decisions.json');
  const decisionsExisted = existsSync(decisionsPath);
  const previousDecisionsText = decisionsExisted
    ? await fs.readFile(decisionsPath, 'utf-8')
    : '';
  const existing = await readJsonIfExists<any>(decisionsPath, { schema_version: 'git_ignore_decisions.v1', decisions: [] });
  const byPath = new Map<string, any>();
  for (const item of existing.decisions ?? []) byPath.set(normalizeRelativePath(item.path), item);
  for (const item of input.decisions ?? []) {
    const validation = validateProjectRelativePath(item.path);
    if (!validation.valid || !validation.path) {
      throw new Error(`INVALID_IGNORE_DECISION_PATH: ${item.path} (${validation.reason})`);
    }
    const p = normalizeRelativePath(validation.path);
    if (p === '.gitignore' || p.startsWith(`${SPEC_DIR_NAME}/`)) {
      throw new Error(`IGNORE_DECISION_PATH_FORBIDDEN: ${p}`);
    }
    const artifactClass = classifyRegenerableArtifactPath(p);
    byPath.set(p, {
      path: p,
      decision: item.decision,
      reason: item.reason ?? 'user decision',
      ...(artifactClass ? { artifact_class: artifactClass } : {}),
      updated_at: new Date().toISOString(),
    });
  }
  const next = { schema_version: 'git_ignore_decisions.v1', updated_at: new Date().toISOString(), decisions: Array.from(byPath.values()).sort((a, b) => String(a.path).localeCompare(String(b.path))) };
  const gitIgnorePath = path.join(input.projectRoot, '.gitignore');
  const gitIgnoreExisted = existsSync(gitIgnorePath);
  const existingGitIgnore = await fs.readFile(gitIgnorePath, 'utf-8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  });
  const renderedGitIgnore = renderGovernedGitIgnore(existingGitIgnore, next.decisions);
  const decisionsRelativePath = normalizeRelativePath(path.relative(input.projectRoot, decisionsPath));
  try {
    await writeJson(decisionsPath, next);
    await fs.writeFile(gitIgnorePath, renderedGitIgnore.content, 'utf-8');
    recordGitGovernanceProjectWrites(input.projectRoot, 'sf_git_ignore_decision_record', [
      decisionsRelativePath,
      '.gitignore',
    ]);
  } catch (error) {
    if (decisionsExisted) await fs.writeFile(decisionsPath, previousDecisionsText, 'utf-8');
    else await fs.rm(decisionsPath, { force: true });
    if (gitIgnoreExisted) await fs.writeFile(gitIgnorePath, existingGitIgnore, 'utf-8');
    else await fs.rm(gitIgnorePath, { force: true });
    throw error;
  }
  return {
    success: true,
    decisions_path: decisionsRelativePath,
    gitignore_path: '.gitignore',
    applied_ignore_paths: renderedGitIgnore.ignored_paths,
    decision_count: next.decisions.length,
    decisions: next.decisions,
  };
}

export async function gitRemoteProbe(input: { projectRoot: string; remoteName?: string }) {
  const remoteName = input.remoteName || 'origin';
  const remotes = parseRemotes((await runGit(input.projectRoot, ['remote', '-v'], true)).stdout);
  const remote = remotes[remoteName];
  if (!remote) return { success: false, remote_name: remoteName, error: 'REMOTE_NOT_FOUND', remotes };
  const probe = await runGit(input.projectRoot, ['ls-remote', '--heads', remoteName], true);
  return {
    success: probe.code === 0,
    remote_name: remoteName,
    remote,
    provider_type: inferProvider(remote.fetch_url || remote.push_url),
    code: probe.code,
    stdout: probe.stdout,
    stderr: probe.stderr,
  };
}
