import { SPEC_DIR_NAME } from "@specforge/types/directory-layout";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IPathResolver } from '../daemon/path-resolver';
import { StateManager } from '../state/StateManager';

export interface ProjectArchiveRestoreInput {
  project_path: string;
  archive_path: string;
  archive_sha256: string;
  original_commit: string;
  confirmation_quote: string;
}
type Entry = { path: string; size: number; sha256: string; bytes_base64: string };
type Inventory = { path: string; kind: 'file' | 'directory'; sha256?: string }[];
type Plan = { schema_version: '1.0'; input: ProjectArchiveRestoreInput; created_utc: string;
  before: Inventory; objects: Entry[]; stage: string; residue: string };
const exec = promisify(execFile);
const digest = (bytes: Buffer | string, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export const projectPathIdentity = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function fail(reason: string): never { throw new Error(`ARCHIVE_RECOVERY_${reason}`); }
const exists = async (file: string) => fs.lstat(file).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

/** Fail closed on platform aliases, alternate streams and file/directory collisions. */
function safeRelative(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\\') ||
      value.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) ||
        /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('UNSAFE_PATH');
}

async function noLinks(absolute: string): Promise<void> {
  const resolved = path.resolve(absolute);
  let cursor = path.parse(resolved).root;
  for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!await exists(cursor)) continue;
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) fail('LINK_OR_SPECIAL_FILE');
  }
}

async function inventory(root: string): Promise<Inventory> {
  await noLinks(root);
  const result: Inventory = [];
  const walk = async (dir: string, prefix: string) => {
    for (const name of (await fs.readdir(dir)).sort()) {
      const relative = prefix + name;
      safeRelative(relative);
      const file = path.join(dir, name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) fail('LINK_OR_SPECIAL_FILE');
      if (stat.isDirectory()) {
        result.push({ path: relative, kind: 'directory' });
        await walk(file, relative + '/');
      } else if (stat.isFile() && stat.nlink === 1) {
        result.push({ path: relative, kind: 'file', sha256: digest(await fs.readFile(file)) });
      } else fail('LINK_OR_SPECIAL_FILE');
      if (result.length > 50000) fail('INVENTORY_LIMIT');
    }
  };
  await walk(root, '');
  return result;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function durable(file: string, data: string | Buffer): Promise<void> {
  const handle = await fs.open(file, 'wx');
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
}
async function atomicDocument(file: string, data: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.partial`;
  await durable(temporary, data);
  // The owner lock serializes publication; partial temporary files are retained after a crash.
  if (await exists(file)) fail('DOCUMENT_COLLISION');
  await fs.rename(temporary, file);
}
async function marker(file: string, data: unknown): Promise<void> {
  await noLinks(file);
  if (await exists(file)) {
    if (!equal(JSON.parse(await fs.readFile(file, 'utf8')), data)) fail('JOURNAL_DRIFT');
  } else await atomicDocument(file, JSON.stringify(data, null, 2) + '\n');
}

async function auditEvent(audit: string, event: Record<string, unknown>): Promise<void> {
  const file = path.join(audit, 'operations.jsonl');
  await noLinks(file);
  const handle = await fs.open(file, 'a');
  try { await handle.writeFile(JSON.stringify({ utc: new Date().toISOString(), ...event }) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}

function decodeEntry(entry: Entry): Buffer {
  safeRelative(entry.path);
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 32 * 1024 * 1024 ||
      typeof entry.bytes_base64 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('INVALID_ENTRY');
  const bytes = Buffer.from(entry.bytes_base64, 'base64');
  if (bytes.toString('base64') !== entry.bytes_base64 || bytes.length !== entry.size || digest(bytes) !== entry.sha256) fail('ENTRY_HASH_MISMATCH');
  return bytes;
}

async function readArchive(input: ProjectArchiveRestoreInput): Promise<Entry[]> {
  await noLinks(input.archive_path);
  if ((await fs.stat(input.archive_path)).size > 128 * 1024 * 1024) fail('ARCHIVE_LIMIT');
  const raw = await fs.readFile(input.archive_path);
  if (digest(raw) !== input.archive_sha256) fail('ARCHIVE_HASH_MISMATCH');
  const archive = JSON.parse(raw.toString('utf8'));
  if (typeof archive.project !== 'string' || projectPathIdentity(archive.project) !== projectPathIdentity(input.project_path)) fail('PROJECT_IDENTITY_MISMATCH');
  if (!Array.isArray(archive.entries) || !archive.entries.length || archive.entries.length > 20000) fail('INVALID_ENTRIES');
  const names = new Set<string>();
  const components = new Map<string, string>();
  let total = 0;
  for (const entry of archive.entries as Entry[]) {
    const bytes = decodeEntry(entry);
    total += bytes.length;
    if (total > 96 * 1024 * 1024) fail('ARCHIVE_LIMIT');
    const key = entry.path.toLowerCase();
    if (key.split('/').some(part => part === '.git') || names.has(key)) fail('PATH_COLLISION');
    names.add(key);
    const parts = entry.path.split('/');
    for (let count = 1; count <= parts.length; count++) {
      const original = parts.slice(0, count).join('/'), folded = original.toLowerCase();
      if (components.has(folded) && components.get(folded) !== original) fail('PATH_COLLISION');
      components.set(folded, original);
    }
  }
  for (const name of names) {
    const parts = name.split('/');
    while (parts.length > 1) { parts.pop(); if (names.has(parts.join('/'))) fail('PATH_COLLISION'); }
  }
  return archive.entries;
}

function verifyObjects(objects: Entry[], commit: string, entries: Entry[]): void {
  const graph = new Map<string, { type: string; body: Buffer }>();
  for (const object of objects) {
    const id = object.path.replace('.git/objects/', '').replace('/', '');
    if (!/^[a-f0-9]{40}$/.test(id)) fail('GIT_RESIDUE_UNSUPPORTED');
    const raw = inflateSync(decodeEntry(object), { maxOutputLength: 64 * 1024 * 1024 });
    if (digest(raw, 'sha1') !== id) fail('GIT_OBJECT_HASH_MISMATCH');
    const separator = raw.indexOf(0);
    const header = raw.subarray(0, separator).toString('ascii');
    const match = /^(blob|tree|commit|tag) ([0-9]+)$/.exec(header);
    const body = raw.subarray(separator + 1);
    if (!match || Number(match[2]) !== body.length) fail('GIT_OBJECT_INVALID');
    graph.set(id, { type: match[1]!, body });
  }
  const current = graph.get(commit);
  if (current?.type !== 'commit') fail('ORIGINAL_COMMIT_MISSING');
  const root = /^tree ([a-f0-9]{40})\n/.exec(current.body.toString('utf8'))?.[1];
  if (!root) fail('GIT_COMMIT_INVALID');
  const files = new Map(entries.map(entry => [entry.path, entry]));
  const visit = (id: string, prefix: string, ancestors: Set<string>) => {
    const tree = graph.get(id);
    if (tree?.type !== 'tree' || ancestors.has(id) || ancestors.size > 128) fail('GIT_TREE_INVALID');
    const next = new Set(ancestors).add(id);
    let offset = 0;
    while (offset < tree.body.length) {
      const space = tree.body.indexOf(32, offset), nul = tree.body.indexOf(0, space + 1);
      if (space < offset || nul < space || nul + 21 > tree.body.length) fail('GIT_TREE_INVALID');
      const mode = tree.body.subarray(offset, space).toString('ascii');
      const name = tree.body.subarray(space + 1, nul).toString('utf8');
      safeRelative(name);
      if (name.includes('/')) fail('GIT_TREE_INVALID');
      const key = prefix + name, child = tree.body.subarray(nul + 1, nul + 21).toString('hex');
      if (mode === '40000') visit(child, key + '/', next);
      else {
        if (!['100644', '100755'].includes(mode)) fail('GIT_FILE_MODE_UNSUPPORTED');
        const blob = graph.get(child), file = files.get(key);
        if (blob?.type !== 'blob' || !file || !decodeEntry(file).equals(blob.body)) fail('GIT_ARCHIVE_LINKAGE_MISMATCH');
      }
      offset = nul + 21;
    }
  };
  visit(root, '', new Set());
}

async function git(root: string, args: string[], emptyTemplate: string): Promise<string> {
  // Do not inherit arbitrary Git configuration, worktree redirects, templates or hooks.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  const audit = path.dirname(emptyTemplate);
  await auditEvent(audit, { event: 'git_started', cwd: root, args });
  try {
    const result = await exec('git', ['-c', `core.hooksPath=${emptyTemplate}`, '-c', 'core.autocrlf=false', ...args],
      { cwd: root, env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    await auditEvent(audit, { event: 'git_finished', args, inner_exit_code: 0, stdout: result.stdout, stderr: result.stderr });
    return result.stdout.trim();
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    await auditEvent(audit, { event: 'git_finished', args, inner_exit_code: typeof failed.code === 'number' ? failed.code : 1, stdout: failed.stdout, stderr: failed.stderr });
    throw error;
  }
}

/** Recovery owner only: never called by Project Init or an Agent artifact writer. */
export async function restoreProjectArchive(resolver: IPathResolver, input: ProjectArchiveRestoreInput) {
  if (!input || typeof input.project_path !== 'string' || !path.isAbsolute(input.project_path) ||
      typeof input.archive_path !== 'string' || !path.isAbsolute(input.archive_path) ||
      !/^[a-f0-9]{64}$/.test(input.archive_sha256) || !/^[a-f0-9]{40}$/.test(input.original_commit) ||
      typeof input.confirmation_quote !== 'string' || !input.confirmation_quote.trim() || input.confirmation_quote.length > 4000) fail('INPUT_REQUIRED');
  const target = path.resolve(input.project_path), parent = path.dirname(target);
  if ([path.parse(target).root, os.homedir(), os.tmpdir(), process.cwd()].some(value => projectPathIdentity(value) === projectPathIdentity(target)) ||
      path.relative(target, input.archive_path) === '' || !path.relative(target, input.archive_path).startsWith('..' + path.sep) && !path.isAbsolute(path.relative(target, input.archive_path))) fail('UNSAFE_TARGET');
  if (projectPathIdentity(resolver.resolveProjectRuntimeDir(target)) !== projectPathIdentity(path.join(target, (`${SPEC_DIR_NAME}/runtime` as const)))) fail('EXTERNAL_RUNTIME_UNSUPPORTED');
  await noLinks(target);
  const entries = await readArchive(input);
  const key = digest(projectPathIdentity(target)).slice(0, 24);
  const audit = path.join(resolver.resolveDaemonRuntimeDir(), 'project-archive-recovery', key);
  if (path.relative(target, audit) === '' || !path.relative(target, audit).startsWith('..' + path.sep) && !path.isAbsolute(path.relative(target, audit))) fail('UNSAFE_AUDIT_ROOT');
  await noLinks(audit);
  await fs.mkdir(audit, { recursive: true });
  const lock = path.join(audit, 'lock.json');
  if (await exists(lock)) {
    await noLinks(lock);
    const prior = JSON.parse(await fs.readFile(lock, 'utf8'));
    if (prior.archive_sha256 !== input.archive_sha256 || !Number.isSafeInteger(prior.pid) || prior.pid <= 0) fail('LOCK_INVALID');
    try { process.kill(prior.pid, 0); fail('LOCKED'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    await fs.rename(lock, path.join(audit, `dead-lock-${randomUUID()}.json`));
  }
  await durable(lock, JSON.stringify({ pid: process.pid, archive_sha256: input.archive_sha256 }));
  try {
    const planFile = path.join(audit, 'plan.json');
    let plan: Plan;
    if (await exists(planFile)) {
      await noLinks(planFile);
      plan = JSON.parse(await fs.readFile(planFile, 'utf8'));
      if (plan.schema_version !== '1.0' || !equal(plan.input, input)) fail('PLAN_IDENTITY_MISMATCH');
    } else {
      if (!await exists(target) || !(await fs.stat(target)).isDirectory()) fail('TARGET_MISSING');
      const before = await inventory(target);
      const byPath = new Map(entries.map(entry => [entry.path, entry]));
      const objects: Entry[] = [];
      for (const item of before) {
        // Empty directory structure carries no file content or Git identity.
        // Retain it in the original residue; only verified archive/object files may be published.
        if (item.kind === 'directory') continue;
        if (item.path.startsWith('.git/')) {
          if (!/^\.git\/objects\/[a-f0-9]{2}\/[a-f0-9]{38}$/.test(item.path)) fail('GIT_RESIDUE_UNSUPPORTED');
          const bytes = await fs.readFile(path.join(target, item.path));
          objects.push({ path: item.path, size: bytes.length, sha256: digest(bytes), bytes_base64: bytes.toString('base64') });
        } else if (byPath.get(item.path)?.sha256 !== item.sha256) fail('TARGET_CONFLICT');
      }
      verifyObjects(objects, input.original_commit, entries);
      plan = { schema_version: '1.0', input, created_utc: new Date().toISOString(), before, objects,
        stage: path.join(parent, `.sf-archive-stage-${key}`), residue: path.join(parent, `.sf-archive-residue-${key}`) };
      if (await exists(plan.stage) || await exists(plan.residue)) fail('STAGING_COLLISION');
      await atomicDocument(planFile, JSON.stringify(plan, null, 2) + '\n');
      await auditEvent(audit, { event: 'plan_created', archive_sha256: input.archive_sha256 });
    }
    // Revalidate plan-owned paths and object bytes on every retry before any rename.
    if (plan.stage !== path.join(parent, `.sf-archive-stage-${key}`) || plan.residue !== path.join(parent, `.sf-archive-residue-${key}`)) fail('PLAN_PATH_DRIFT');
    verifyObjects(plan.objects, input.original_commit, entries);
    for (const value of [plan.stage, plan.residue, audit]) await noLinks(value);
    const readyFile = path.join(audit, 'stage-ready.json'), doneFile = path.join(audit, 'completed.json');
    if (!await exists(readyFile)) {
      if (!await exists(target) || !equal(await inventory(target), plan.before) || await exists(plan.residue)) fail('TARGET_DRIFT');
      if (await exists(plan.stage)) {
        // An uncommitted stage is never published; preserve it and build afresh.
        await inventory(plan.stage);
        await fs.rename(plan.stage, `${plan.stage}.incomplete-${randomUUID()}`);
      }
      await fs.mkdir(plan.stage);
      const emptyTemplate = path.join(audit, 'empty-template');
      await fs.mkdir(emptyTemplate, { recursive: true });
      if ((await fs.readdir(emptyTemplate)).length) fail('TEMPLATE_DRIFT');
      for (const entry of [...entries, ...plan.objects]) {
        const file = path.join(plan.stage, entry.path);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await durable(file, decodeEntry(entry));
        await auditEvent(audit, { event: 'staged_file', path: entry.path, sha256: entry.sha256 });
      }
      // Verify the original event history with the real StateManager without persisting a projection.
      if (!entries.some(entry => entry.path === (`${SPEC_DIR_NAME}/runtime/events.jsonl` as const))) fail('EVENT_HISTORY_REQUIRED');
      const state = await new StateManager(resolver, plan.stage).rebuildState();
      if (!state.lastEventId) fail('EMPTY_EVENT_HISTORY');
      const projection = entries.find(entry => entry.path === (`${SPEC_DIR_NAME}/runtime/state.json` as const));
      if (projection) {
        const value = JSON.parse(decodeEntry(projection).toString('utf8'));
        if (projectPathIdentity(value.projectPath) !== projectPathIdentity(target) || value.lastEventId !== state.lastEventId || value.lastEventTs !== state.lastEventTs ||
            !equal(value.workItems, state.workItems)) fail('PROJECTION_WITNESS_MISMATCH');
      }
      await git(plan.stage, ['init', '--quiet', `--template=${emptyTemplate}`], emptyTemplate);
      await git(plan.stage, ['config', '--local', 'core.autocrlf', 'false'], emptyTemplate);
      await git(plan.stage, ['fsck', '--full', '--strict', '--no-reflogs'], emptyTemplate);
      await git(plan.stage, ['update-ref', '--no-deref', 'HEAD', input.original_commit], emptyTemplate);
      await git(plan.stage, ['read-tree', input.original_commit], emptyTemplate);
      if (await git(plan.stage, ['rev-parse', 'HEAD'], emptyTemplate) !== input.original_commit ||
          (await fs.readFile(path.join(plan.stage, '.git/HEAD'), 'utf8')).trim() !== input.original_commit) fail('HEAD_MISMATCH');
      for (const entry of entries) if (digest(await fs.readFile(path.join(plan.stage, entry.path))) !== entry.sha256) fail('STAGE_DRIFT');
      await marker(readyFile, { inventory: await inventory(plan.stage), state });
      await auditEvent(audit, { event: 'stage_verified', file_count: entries.length, lastEventId: state.lastEventId, lastEventTs: state.lastEventTs });
    }
    await noLinks(readyFile);
    const ready = JSON.parse(await fs.readFile(readyFile, 'utf8'));
    const targetExists = await exists(target), stageExists = await exists(plan.stage), residueExists = await exists(plan.residue);
    if (stageExists) {
      if (await exists(doneFile) || !equal(await inventory(plan.stage), ready.inventory)) fail('STAGE_DRIFT');
      for (const entry of entries) if (digest(await fs.readFile(path.join(plan.stage, entry.path))) !== entry.sha256) fail('STAGE_DRIFT');
      if (targetExists) {
        if (residueExists || !equal(await inventory(target), plan.before)) fail('TARGET_DRIFT');
        await marker(path.join(audit, 'publish-intent.json'), { archive_sha256: input.archive_sha256 });
        await auditEvent(audit, { event: 'residue_rename_started' });
        await fs.rename(target, plan.residue);
      } else if (!residueExists) fail('RESIDUE_MISSING');
      if (!equal(await inventory(plan.residue), plan.before)) fail('RESIDUE_DRIFT');
      await auditEvent(audit, { event: 'publish_rename_started' });
      await fs.rename(plan.stage, target);
    } else if (!targetExists || !residueExists) fail('PUBLICATION_INCOMPLETE');
    if (!equal(await inventory(target), ready.inventory) || !equal(await inventory(plan.residue), plan.before)) fail('PUBLISHED_DRIFT');
    for (const entry of entries) if (digest(await fs.readFile(path.join(target, entry.path))) !== entry.sha256) fail('PUBLISHED_DRIFT');
    await marker(doneFile, { archive_sha256: input.archive_sha256, original_commit: input.original_commit, file_count: entries.length });
    await auditEvent(audit, { event: 'completed', file_count: entries.length, archive_sha256: input.archive_sha256 });
    return { success: true, project_path: target, archive_sha256: input.archive_sha256, original_commit: input.original_commit,
      detached_head: true, restored_files: entries.length, audit_path: audit, residue_path: plan.residue,
      state: { ...ready.state, projectPath: target }, old_git_metadata_restored: false };
  } finally { await fs.unlink(lock); }
}
