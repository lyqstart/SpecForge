import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { validateWorkItemId } from './work-item-id-validator';
import { readWorkItemMetadata } from './work-item-metadata';

type CommandReceipt = {
  args: string[];
  cwd: string;
  started_utc: string;
  finished_utc: string;
  inner_exit_code: number;
  stdout: string;
  stderr: string;
  stdin?: string;
};
type TrackedFile = { path: string; mode: string; object_id: string; sha256: string; size: number };
type Source = {
  head: string;
  head_sha256: string;
  refs: string;
  index_sha256: string;
  config_sha256: string;
  tracked: TrackedFile[];
};
interface Plan {
  schema_version: '1.0';
  project_root: string;
  work_item_id: string;
  base_branch: string;
  branch_name: string;
  expected_head: string;
  created_utc: string;
  source: Source;
  probe_commands: CommandReceipt[];
  work_item_metadata_sha256: string;
}
export interface DetachedBranchPlanInput {
  projectRoot: string;
  workItemId: string;
  baseBranch: string;
  branchName: string;
  expectedHead: string;
}
export interface DetachedBranchCreateInput {
  projectRoot: string;
  workItemId: string;
  baseBranch: string;
  branchName: string;
  planSha256: string;
  confirmationQuote: string;
}
const hash = (value: string | Buffer, algorithm = 'sha256') =>
  createHash(algorithm).update(value).digest('hex');
const document = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
function fail(code: string): never {
  throw new Error(`DETACHED_GIT_BOOTSTRAP_${code}`);
}
const exists = (file: string) =>
  fs.lstat(file).then(
    () => true,
    error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  );
const identity = (root: string) =>
  process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
async function noLinks(file: string) {
  const absolute = path.resolve(file);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!(await exists(cursor))) continue;
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)))
      fail('LINK_OR_SPECIAL_FILE');
  }
}
function safePath(relative: string) {
  if (
    !relative ||
    relative.includes('\\') ||
    path.isAbsolute(relative) ||
    relative
      .split('/')
      .some(
        part =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[<>:"|?*\x00-\x1f]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      )
  )
    fail('UNSAFE_PATH');
}
function checkId(value: string) {
  if (validateWorkItemId(value)) fail('WORK_ITEM_ID_INVALID');
}
function validPlan(value: any): value is Plan {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== '1.0')
    return false;
  const keys = [
    'schema_version',
    'project_root',
    'work_item_id',
    'base_branch',
    'branch_name',
    'expected_head',
    'created_utc',
    'source',
    'probe_commands',
    'work_item_metadata_sha256',
  ];
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value)))
    return false;
  if (
    ['project_root', 'work_item_id', 'base_branch', 'branch_name', 'created_utc'].some(
      key => typeof value[key] !== 'string' || !value[key]
    )
  )
    return false;
  const source = value.source;
  if (
    !/^[a-f0-9]{40}$/.test(value.expected_head) ||
    !/^[a-f0-9]{64}$/.test(value.work_item_metadata_sha256) ||
    !source ||
    source.head !== value.expected_head ||
    typeof source.refs !== 'string' ||
    source.refs.split('\n').some((ref: string) => ref.startsWith('refs/heads/')) ||
    ['head_sha256', 'index_sha256', 'config_sha256'].some(
      key => !/^[a-f0-9]{64}$/.test(source[key])
    ) ||
    !Array.isArray(source.tracked) ||
    source.tracked.some(
      (file: any) =>
        !file ||
        typeof file.path !== 'string' ||
        !['100644', '100755'].includes(file.mode) ||
        !/^[a-f0-9]{40}$/.test(file.object_id) ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0
    )
  )
    return false;
  return (
    Array.isArray(value.probe_commands) &&
    value.probe_commands.every(
      (receipt: any) =>
        receipt &&
        Array.isArray(receipt.args) &&
        receipt.args.every((arg: unknown) => typeof arg === 'string') &&
        typeof receipt.cwd === 'string' &&
        Number.isInteger(receipt.inner_exit_code) &&
        typeof receipt.stdout === 'string' &&
        typeof receipt.stderr === 'string' &&
        Number.isFinite(Date.parse(receipt.started_utc)) &&
        Number.isFinite(Date.parse(receipt.finished_utc))
    )
  );
}
async function durable(file: string, bytes: string) {
  await noLinks(file);
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function marker(file: string, value: unknown) {
  const raw = document(value);
  await noLinks(file);
  if (await exists(file)) {
    if ((await fs.readFile(file, 'utf8')) !== raw) fail('MARKER_DRIFT');
    return;
  }
  await durable(file, raw);
}
function paths(root: string, id: string) {
  checkId(id);
  const wi = path.join(root, `${SPEC_DIR_NAME}/work-items` as const, id);
  return {
    wi,
    owner: path.join(wi, 'git_bootstrap'),
    context: path.join(wi, 'git_context.json'),
    runtime: path.join(root, `${SPEC_DIR_NAME}/runtime` as const),
  };
}
export async function withGitBranchMutationLease<T>(
  root: string,
  id: string,
  action: () => Promise<T>
): Promise<T> {
  checkId(id);
  // Linked worktrees retain legacy behavior and are ineligible for bootstrap.
  if (
    !(await exists(path.join(root, '.git'))) ||
    !(await fs.lstat(path.join(root, '.git'))).isDirectory()
  )
    return action();
  const directory = path.join(root, '.git/specforge-branch-leases');
  await noLinks(directory);
  await fs.mkdir(directory, { recursive: true });
  const nonce = randomUUID(),
    file = path.join(directory, nonce + '.json');
  const token = document({
    schema_version: '1.0',
    pid: process.pid,
    nonce,
    created_utc: new Date().toISOString(),
  });
  await durable(file, token);
  try {
    // Per-attempt leases avoid a stale-lock rename race. Dead leases are kept
    // byte-for-byte; a live/unknown foreign lease always blocks execution.
    for (const name of await fs.readdir(directory)) {
      if (name === nonce + '.json') continue;
      const other = path.join(directory, name);
      await noLinks(other);
      let holder: { schema_version: string; pid: number; nonce: string };
      try {
        holder = JSON.parse(await fs.readFile(other, 'utf8'));
      } catch (error: any) {
        if (error.code === 'ENOENT') continue;
        fail('LOCK_UNKNOWN');
      }
      if (
        holder.schema_version !== '1.0' ||
        !Number.isSafeInteger(holder.pid) ||
        holder.pid < 1 ||
        !holder.nonce
      )
        fail('LOCK_UNKNOWN');
      let dead = false;
      try {
        process.kill(holder.pid, 0);
      } catch (error: any) {
        if (error.code === 'ESRCH') dead = true;
      }
      if (!dead) fail('BUSY');
    }
    return await action();
  } finally {
    if ((await fs.readFile(file, 'utf8')) !== token) fail('LOCK_DRIFT');
    await fs.unlink(file);
  }
}

async function git(
  root: string,
  args: string[],
  receipts: CommandReceipt[],
  audit?: string,
  stdin?: string
) {
  const started = new Date().toISOString();
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))
  );
  Object.assign(environment, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
  });
  const argv = [
    '--no-pager',
    '-c',
    'protocol.allow=never',
    '-c',
    `core.hooksPath=${nullDevice}`,
    '-c',
    'user.name=SpecForge Git Owner',
    '-c',
    'user.email=specforge@localhost.invalid',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'gc.auto=0',
    ...args,
  ];
  if (audit)
    await fs.appendFile(
      audit,
      JSON.stringify({
        event: 'command_started',
        args: argv,
        cwd: root,
        started_utc: started,
        stdin,
        expected_writes:
          args[0] === 'update-ref' || (args[0] === 'symbolic-ref' && args.length > 2)
            ? 'Git refs/HEAD only'
            : 'Read-only; optional index refresh disabled',
      }) + '\n'
    );
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
    const child = spawn('git', argv, {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      settled = false;
    const finish = (code: number) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    };
    const timer = setTimeout(() => {
      stderr += '\nGIT_TIMEOUT';
      child.kill();
    }, 30000);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 16 * 1024 * 1024) {
        stderr += '\nOUTPUT_LIMIT';
        child.kill();
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      stderr += String(error);
      finish(1);
    });
    child.on('close', code => finish(Number.isInteger(code) ? code! : 1));
    child.stdin.on('error', () => {
      /* Exit receipt carries process failure. */
    });
    child.stdin.end(stdin);
  });
  const receipt = {
    args: argv,
    cwd: root,
    started_utc: started,
    finished_utc: new Date().toISOString(),
    inner_exit_code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(stdin === undefined ? {} : { stdin }),
  };
  receipts.push(receipt);
  if (audit)
    await fs.appendFile(audit, JSON.stringify({ event: 'command_finished', ...receipt }) + '\n');
  return result;
}
async function requireGit(
  root: string,
  args: string[],
  receipts: CommandReceipt[],
  audit?: string,
  stdin?: string
) {
  const result = await git(root, args, receipts, audit, stdin);
  if (result.code !== 0) fail(`GIT_FAILED:${args[0]}:${result.stderr.trim()}`);
  return result.stdout;
}
async function branches(root: string, base: string, branch: string, receipts: CommandReceipt[]) {
  if (
    !base ||
    !branch ||
    base.toLowerCase() === branch.toLowerCase() ||
    base.toLowerCase().startsWith(branch.toLowerCase() + '/') ||
    branch.toLowerCase().startsWith(base.toLowerCase() + '/') ||
    [base, branch].some(
      name => name === 'HEAD' || name.startsWith('-') || /[\x00-\x20\x7f"\\]/.test(name)
    )
  )
    fail('BRANCH_NAME_INVALID');
  for (const name of [base, branch])
    await requireGit(root, ['check-ref-format', '--branch', name], receipts);
}
async function snapshot(
  root: string,
  expected: string,
  receipts: CommandReceipt[],
  audit?: string
): Promise<Source> {
  await noLinks(root);
  await noLinks(path.join(root, '.git/index'));
  await noLinks(path.join(root, '.git/config'));
  if (!(await fs.lstat(path.join(root, '.git'))).isDirectory()) fail('EXTERNAL_GIT_DIRECTORY');
  const inspectGit = async (directory: string): Promise<void> => {
    for (const name of await fs.readdir(directory)) {
      const full = path.join(directory, name);
      await noLinks(full);
      if ((await fs.lstat(full)).isDirectory()) await inspectGit(full);
    }
  };
  await inspectGit(path.join(root, '.git'));
  if (await exists(path.join(root, '.git/objects/info/alternates'))) fail('EXTERNAL_GIT_DIRECTORY');
  const top = (await requireGit(root, ['rev-parse', '--show-toplevel'], receipts, audit)).trim();
  const common = (
    await requireGit(root, ['rev-parse', '--git-common-dir'], receipts, audit)
  ).trim();
  if (
    identity(top) !== identity(root) ||
    identity(path.resolve(root, common)) !== identity(path.join(root, '.git'))
  )
    fail('EXTERNAL_GIT_DIRECTORY');
  const head = (await requireGit(root, ['rev-parse', 'HEAD'], receipts, audit)).trim();
  if (head !== expected) fail('HEAD_DRIFT');
  await requireGit(root, ['fsck', '--full', '--no-reflogs'], receipts, audit);
  // status/diff may run clean/textconv programs from repository config. Use
  // plumbing only, include ignored files, and compare raw tracked blobs below.
  const untracked = await requireGit(root, ['ls-files', '--others', '-z'], receipts, audit);
  for (const entry of untracked.split('\0').filter(Boolean)) {
    if (!entry.startsWith(`${SPEC_DIR_NAME}/` as const)) fail('BUSINESS_OR_STAGED_DRIFT');
    safePath(entry);
    await noLinks(path.join(root, entry));
  }
  const tree = await requireGit(root, ['ls-tree', '-rz', '--full-tree', expected], receipts, audit);
  const index = await requireGit(root, ['ls-files', '--stage', '-z'], receipts, audit);
  const tracked: TrackedFile[] = [],
    expectedIndex: string[] = [];
  const identities = new Set<string>();
  for (const entry of tree.split('\0').filter(Boolean)) {
    const match = entry.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s);
    if (!match) fail('TRACKED_KIND_UNSUPPORTED');
    const [, mode, oid, relative] = match;
    safePath(relative);
    const full = path.join(root, relative);
    await noLinks(full);
    if (identities.has(identity(full))) fail('TRACKED_PATH_ALIAS');
    identities.add(identity(full));
    const raw = await fs.readFile(full);
    if (hash(Buffer.concat([Buffer.from(`blob ${raw.length}\0`), raw]), 'sha1') !== oid)
      fail('TRACKED_CONTENT_DRIFT');
    tracked.push({ path: relative, mode, object_id: oid, sha256: hash(raw), size: raw.length });
    expectedIndex.push(`${mode} ${oid} 0\t${relative}`);
  }
  if (index.split('\0').filter(Boolean).sort().join('\0') !== expectedIndex.sort().join('\0'))
    fail('INDEX_DRIFT');
  return {
    head,
    head_sha256: hash(await fs.readFile(path.join(root, '.git/HEAD'))),
    refs: await requireGit(
      root,
      ['for-each-ref', '--format=%(refname) %(objectname)'],
      receipts,
      audit
    ),
    index_sha256: hash(await fs.readFile(path.join(root, '.git/index'))),
    config_sha256: hash(await fs.readFile(path.join(root, '.git/config'))),
    tracked,
  };
}
async function assertMetadata(root: string, id: string) {
  const p = paths(root, id);
  await noLinks(p.context);
  await noLinks(p.owner);
  await noLinks(path.join(p.wi, 'work_item.json'));
  const metadata = await readWorkItemMetadata(p.wi, id);
  if (
    metadata.work_item_id !== id ||
    metadata.code_change_allowed === true ||
    (await exists(path.join(p.wi, 'governance_scope.json')))
  )
    fail('IMPLEMENTATION_ALREADY_STARTED');
  return p;
}
export async function planDetachedGitBootstrap(input: DetachedBranchPlanInput) {
  checkId(input.workItemId);
  const root = path.resolve(input.projectRoot),
    receipts: CommandReceipt[] = [];
  if (!/^[a-f0-9]{40}$/.test(input.expectedHead)) fail('FULL_COMMIT_REQUIRED');
  await branches(root, input.baseBranch, input.branchName, receipts);
  return withGitBranchMutationLease(root, input.workItemId, async () => {
    const p = await assertMetadata(root, input.workItemId);
    if (await exists(p.context)) fail('CONTEXT_ALREADY_EXISTS');
    const source = await snapshot(root, input.expectedHead, receipts);
    const symbolic = await git(root, ['symbolic-ref', '-q', 'HEAD'], receipts);
    if (
      symbolic.code !== 1 ||
      symbolic.stdout ||
      source.refs.split('\n').some(ref => ref.startsWith('refs/heads/'))
    )
      fail('BRANCHLESS_DETACHED_REQUIRED');
    // Abort a transaction probe; older Git implementations must reject before
    // a plan can authorize any mutations.
    await requireGit(root, ['update-ref', '--stdin'], receipts, undefined, 'start\nabort\n');
    const plan: Plan = {
      schema_version: '1.0',
      project_root: identity(root),
      work_item_id: input.workItemId,
      base_branch: input.baseBranch,
      branch_name: input.branchName,
      expected_head: input.expectedHead,
      created_utc: new Date().toISOString(),
      source,
      probe_commands: receipts,
      work_item_metadata_sha256: hash(await fs.readFile(path.join(p.wi, 'work_item.json'))),
    };
    const raw = document(plan),
      planHash = hash(raw);
    await fs.mkdir(path.join(p.owner, 'plans'), { recursive: true });
    await marker(path.join(p.owner, 'plans', planHash + '.json'), plan);
    return {
      success: true,
      work_item_id: input.workItemId,
      bootstrap_plan_sha256: planHash,
      plan,
      confirmation_required: true,
      effect:
        'Create two new refs at the verified commit, bind HEAD and standard WI Git context; preserve index/business bytes; no old branch restoration',
    };
  });
}
export async function executeDetachedGitBootstrap(
  input: DetachedBranchCreateInput,
  options?: { onCheckpoint?: (stage: string) => Promise<void> }
) {
  checkId(input.workItemId);
  if (!/^[a-f0-9]{64}$/.test(input.planSha256)) fail('PLAN_HASH_INVALID');
  const root = path.resolve(input.projectRoot),
    receipts: CommandReceipt[] = [];
  await branches(root, input.baseBranch, input.branchName, receipts);
  const quote = input.confirmationQuote.trim();
  const names = [input.baseBranch, input.branchName].every(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(^|[\\s+，,;；:：()（）和与、])${escaped}(?=$|[\\s+，,;；:：()（）和与、])`
    ).test(quote);
  });
  if (
    !names ||
    !/^(?:(?:我|I)\s*)?(采用|同意|批准|确认|accept\b|approve\b|confirm\b|use\b)/i.test(quote) ||
    /(不采用|不同意|不批准|不确认|不要|暂不|拒绝|reject|do not|don't|not\s+(?:accept|approve|confirm|use))/i.test(
      quote
    )
  )
    fail('EXPLICIT_BRANCH_CONFIRMATION_REQUIRED');
  return withGitBranchMutationLease(root, input.workItemId, async () => {
    const p = await assertMetadata(root, input.workItemId),
      planFile = path.join(p.owner, 'plans', input.planSha256 + '.json');
    await noLinks(planFile);
    const raw = await fs.readFile(planFile);
    if (hash(raw) !== input.planSha256) fail('PLAN_DRIFT');
    const parsed: unknown = JSON.parse(raw.toString());
    if (!validPlan(parsed)) fail('PLAN_SCHEMA_INVALID');
    const plan = parsed;
    if (
      plan.project_root !== identity(root) ||
      plan.work_item_id !== input.workItemId ||
      plan.base_branch !== input.baseBranch ||
      plan.branch_name !== input.branchName
    )
      fail('PLAN_IDENTITY_MISMATCH');
    if (
      hash(await fs.readFile(path.join(p.wi, 'work_item.json'))) !== plan.work_item_metadata_sha256
    )
      fail('WORK_ITEM_METADATA_DRIFT');
    const attempt = path.join(p.owner, input.planSha256);
    await noLinks(attempt);
    await fs.mkdir(attempt, { recursive: true });
    const audit = path.join(attempt, 'commands.jsonl');
    await noLinks(audit);
    const refs = [
      `refs/heads/${plan.base_branch} ${plan.expected_head}`,
      `refs/heads/${plan.branch_name} ${plan.expected_head}`,
    ];
    const finalRefs = plan.source.refs
      .trim()
      .split('\n')
      .filter(Boolean)
      .concat(refs)
      .sort()
      .join('\n');
    const context = {
      schema_version: '1.0',
      work_item_id: input.workItemId,
      git_enabled: true,
      branch_name: plan.branch_name,
      base_branch: plan.base_branch,
      base_commit: plan.expected_head,
      branch_relationship: 'primary',
      remote_name: null,
      push_policy: 'not_configured',
      merge_policy: 'requires_user_confirmation',
      created_at: plan.created_utc,
    };
    async function scene() {
      const source = await snapshot(root, plan.expected_head, receipts, audit);
      if (
        source.index_sha256 !== plan.source.index_sha256 ||
        source.config_sha256 !== plan.source.config_sha256 ||
        document(source.tracked) !== document(plan.source.tracked)
      )
        fail('SOURCE_DRIFT');
      const actualRefs = source.refs.trim().split('\n').filter(Boolean).sort().join('\n');
      const originalRefs = plan.source.refs.trim().split('\n').filter(Boolean).sort().join('\n');
      if (actualRefs !== originalRefs && actualRefs !== finalRefs) fail('REF_DRIFT');
      const symbolic = await git(root, ['symbolic-ref', '-q', 'HEAD'], receipts, audit);
      const detached = symbolic.code === 1 && !symbolic.stdout;
      const bound =
        symbolic.code === 0 && symbolic.stdout.trim() === `refs/heads/${plan.branch_name}`;
      if ((!detached && !bound) || (bound && actualRefs !== finalRefs)) fail('HEAD_BINDING_DRIFT');
      if (
        source.head_sha256 !==
        (bound ? hash(`ref: refs/heads/${plan.branch_name}\n`) : plan.source.head_sha256)
      )
        fail('HEAD_BINDING_DRIFT');
      if (
        (await exists(p.context)) &&
        ((await fs.readFile(p.context, 'utf8')) !== document(context) ||
          !bound ||
          actualRefs !== finalRefs)
      )
        fail('CONTEXT_DRIFT');
      return { refsDone: actualRefs === finalRefs, bound };
    }
    let current = await scene();
    const intent = path.join(attempt, 'intent.json');
    if (!(await exists(intent)) && (current.refsDone || current.bound || (await exists(p.context))))
      fail('UNOWNED_INTERMEDIATE_STATE');
    if (!(await exists(intent)))
      await durable(
        intent,
        document({
          schema_version: '1.0',
          plan_sha256: input.planSha256,
          user_response_quote: quote,
          head_lease_nonce: randomUUID(),
          created_utc: new Date().toISOString(),
        })
      );
    else {
      await noLinks(intent);
      const prior = JSON.parse(await fs.readFile(intent, 'utf8'));
      if (
        prior.schema_version !== '1.0' ||
        prior.plan_sha256 !== input.planSha256 ||
        prior.user_response_quote !== quote
      )
        fail('INTENT_DRIFT');
    }
    const leaseNonce = JSON.parse(await fs.readFile(intent, 'utf8')).head_lease_nonce;
    if (typeof leaseNonce !== 'string' || !leaseNonce) fail('INTENT_DRIFT');
    await options?.onCheckpoint?.('before_refs_transaction');
    // Git's old-OID compare does not distinguish detached HEAD from a different
    // symbolic branch at the same commit. Hold the real Git HEAD.lock, compare
    // raw HEAD while locked, and publish HEAD atomically without a checkout.
    const headLock = path.join(root, '.git/HEAD.lock');
    await noLinks(headLock);
    let headToken = document({
      schema_version: '1.0',
      owner: 'specforge_git_bootstrap',
      pid: process.pid,
      nonce: leaseNonce,
      plan_sha256: input.planSha256,
    });
    try {
      await durable(headLock, headToken);
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      headToken = await fs.readFile(headLock, 'utf8');
      let held: any;
      try {
        held = JSON.parse(headToken);
      } catch {
        fail('HEAD_LEASE_UNKNOWN');
      }
      if (
        held.schema_version !== '1.0' ||
        held.owner !== 'specforge_git_bootstrap' ||
        held.nonce !== leaseNonce ||
        held.plan_sha256 !== input.planSha256 ||
        !Number.isSafeInteger(held.pid) ||
        held.pid < 1
      )
        fail('HEAD_LEASE_UNKNOWN');
      let dead = false;
      try {
        process.kill(held.pid, 0);
      } catch (error: any) {
        if (error.code === 'ESRCH') dead = true;
      }
      if (!dead) fail('HEAD_LEASE_BUSY');
      await fs.appendFile(
        audit,
        JSON.stringify({
          event: 'owned_head_lease_reclaimed',
          utc: new Date().toISOString(),
          previous: held,
          raw_sha256: hash(headToken),
        }) + '\n'
      );
    }
    try {
      current = await scene();
      await options?.onCheckpoint?.('head_lease_acquired');
      current = await scene();
      if (!current.refsDone) {
        await requireGit(
          root,
          ['update-ref', '--stdin'],
          receipts,
          audit,
          `start\ncreate refs/heads/${plan.base_branch} ${plan.expected_head}\ncreate refs/heads/${plan.branch_name} ${plan.expected_head}\nprepare\ncommit\n`
        );
        await options?.onCheckpoint?.('refs_created');
        current = await scene();
      }
      if (!current.bound) {
        const readyHead = path.join(attempt, 'HEAD.ready'),
          newHead = `ref: refs/heads/${plan.branch_name}\n`;
        if (await exists(readyHead)) {
          await noLinks(readyHead);
          if ((await fs.readFile(readyHead, 'utf8')) !== newHead) fail('HEAD_STAGE_DRIFT');
        } else await durable(readyHead, newHead);
        await scene();
        await fs.rename(readyHead, path.join(root, '.git/HEAD'));
        await fs.appendFile(
          audit,
          JSON.stringify({
            event: 'head_published',
            utc: new Date().toISOString(),
            expected_old_sha256: plan.source.head_sha256,
            new_sha256: hash(newHead),
            method: 'atomic rename while owning Git HEAD.lock',
          }) + '\n'
        );
        await options?.onCheckpoint?.('refs_and_head_bound');
      }
      await scene();
    } finally {
      if ((await fs.readFile(headLock, 'utf8')) !== headToken) fail('HEAD_LEASE_DRIFT');
      await fs.unlink(headLock);
    }
    if (!(await exists(p.context))) {
      await scene();
      const stage = path.join(attempt, 'git-context.ready.json');
      await marker(stage, context);
      if (await exists(p.context)) fail('CONTEXT_DRIFT');
      await fs.rename(stage, p.context);
      await options?.onCheckpoint?.('context_bound');
    }
    await scene();
    const result = {
      schema_version: '1.0',
      success: true,
      work_item_id: input.workItemId,
      bootstrap_mode: 'verified_detached_commit',
      bootstrap_plan_sha256: input.planSha256,
      branch_name: plan.branch_name,
      base_branch: plan.base_branch,
      base_commit: plan.expected_head,
      git_context_path: path.relative(root, p.context).replaceAll('\\', '/'),
      index_unchanged: true,
      tracked_bytes_unchanged: true,
      new_commit_created: false,
      old_branch_restoration_claimed: false,
    };
    await marker(path.join(attempt, 'completed.json'), result);
    return result;
  });
}
