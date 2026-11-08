import { SPEC_DIR_NAME } from "@specforge/types/directory-layout";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectInitOwnedFiles } from './sf_project_init_core';

const exec = promisify(execFile);
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const running = new Set<string>();
interface Entry { file: string; sha256: string; bytes_base64: string; baseline_sha256: string | null; baseline_bytes_base64: string | null; }
export interface ReconstructionInput {
  snapshot_path: string;
  snapshot_sha256: string;
  baseline_commit: string;
  confirmation_quote: string;
}

async function git(root: string, args: string[]): Promise<Buffer> {
  const result = await exec('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  return result.stdout;
}

async function guardedPath(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(v => v === '..' || v === '.' || !v)) throw Error('RECOVERY_PATH_INVALID');
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink !== 1)) throw Error('RECOVERY_LINK_REJECTED');
  }
  return current;
}

/** Project Init owner: explicit, audited reconstruction; never a layout migration. */
export async function reconstructInitialization(rootInput: string, input: ReconstructionInput) {
  const root = await fs.realpath(rootInput);
  if (running.has(root)) throw Error('RECOVERY_CONCURRENT');
  if (!input.confirmation_quote?.trim() || !/^[0-9a-f]{40}$/.test(input.baseline_commit) || !/^[0-9a-f]{64}$/.test(input.snapshot_sha256)) throw Error('RECOVERY_CONFIRMATION_OR_IDENTITY_REQUIRED');
  running.add(root);
  let lock: fs.FileHandle | undefined;
  let lockPath: string | undefined;
  try {
    await fs.access(await guardedPath(root, (`${SPEC_DIR_NAME}/manifest.json` as const)));
    const gitRoot = (await git(root, ['rev-parse', '--show-toplevel'])).toString().trim();
    if (await fs.realpath(gitRoot) !== root) throw Error('RECOVERY_GIT_ROOT_MISMATCH');
    await git(root, ['merge-base', '--is-ancestor', input.baseline_commit, 'HEAD']);
    const evidencePath = await guardedPath(root, input.snapshot_path);
    const bytes = await fs.readFile(evidencePath);
    if (hash(bytes) !== input.snapshot_sha256) throw Error('RECOVERY_SNAPSHOT_HASH_MISMATCH');
    const snapshot = JSON.parse(bytes.toString('utf8')) as { head: string; entries: Entry[] };
    if (snapshot.head !== input.baseline_commit || !Array.isArray(snapshot.entries) || snapshot.entries.length === 0) throw Error('RECOVERY_BASELINE_MISMATCH');
    const owned = new Set(projectInitOwnedFiles());
    const seen = new Set<string>();
    const operations = [];
    for (const entry of snapshot.entries) {
      if (!owned.has(entry.file) || seen.has(entry.file)) throw Error('RECOVERY_SCOPE_INVALID');
      seen.add(entry.file);
      await guardedPath(root, entry.file);
      const original = Buffer.from(entry.bytes_base64, 'base64');
      if (hash(original) !== entry.sha256) throw Error('RECOVERY_ORIGINAL_HASH_MISMATCH');
      const listed = (await git(root, ['ls-tree', '--name-only', input.baseline_commit, '--', entry.file])).toString().trim();
      let target: Buffer | null = null;
      if (listed) {
        target = await git(root, ['show', `${input.baseline_commit}:${entry.file}`]);
        if (hash(target) !== entry.baseline_sha256 || target.toString('base64') !== entry.baseline_bytes_base64) throw Error('RECOVERY_GIT_CONTENT_MISMATCH');
      } else {
        if ((await git(root, ['ls-files', '--', entry.file])).length) throw Error('RECOVERY_NEW_TRACKED_FILE');
        const text = original.toString('utf8');
        const placeholder = text === '> TODO: 由首次 intake 阶段填充\n';
        const coreDefinition = entry.file === (`${SPEC_DIR_NAME}/project/modules/CORE/module.json` as const) &&
          text === JSON.stringify({ schema_version: '1.0', module_code: 'CORE', status: 'active' }, null, 2) + '\n';
        if (!placeholder && !coreDefinition) throw Error('RECOVERY_NEW_FILE_NOT_INIT_TEMPLATE');
      }
      operations.push({ file: entry.file, before_sha256: entry.sha256, before_base64: entry.bytes_base64,
        after_sha256: target ? hash(target) : null, after_base64: target ? target.toString('base64') : null });
    }
    const archiveRelative = `${SPEC_DIR_NAME}/runtime/init-recovery/${input.snapshot_sha256}`;
    const archive = await guardedPath(root, archiveRelative);
    await fs.mkdir(archive, { recursive: true });
    lockPath = await guardedPath(root, (`${SPEC_DIR_NAME}/runtime/init-recovery/owner.lock` as const));
    lock = await fs.open(lockPath, 'wx');
    const planPath = path.join(archive, 'plan.json');
    const plan = { schema_version: '1.0', owner: 'ProjectInit', snapshot_sha256: input.snapshot_sha256,
      baseline_commit: input.baseline_commit, confirmation_quote: input.confirmation_quote, operations };
    let resuming = false;
    try { const handle = await fs.open(planPath, 'wx'); try { await handle.writeFile(JSON.stringify(plan, null, 2)); await handle.sync(); } finally { await handle.close(); } }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      resuming = true;
      if (JSON.stringify(JSON.parse(await fs.readFile(planPath, 'utf8'))) !== JSON.stringify(plan)) throw Error('RECOVERY_PLAN_MISMATCH');
    }
    // Preflight the whole scope before modifying the first live file.
    for (const op of operations) {
      const value = await fs.readFile(await guardedPath(root, op.file)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      const actual = value ? hash(value) : null;
      if (actual !== op.before_sha256 && !(resuming && actual === op.after_sha256)) throw Error('RECOVERY_LIVE_HASH_DRIFT');
    }
    for (const [index, op] of operations.entries()) {
      const destination = await guardedPath(root, op.file);
      const value = await fs.readFile(destination).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      const actual = value ? hash(value) : null;
      if (resuming && actual === op.after_sha256) continue;
      if (actual !== op.before_sha256) throw Error('RECOVERY_LIVE_HASH_DRIFT');
      if (op.after_base64 === null) {
        await fs.rename(destination, path.join(archive, `quarantine-${index}`));
      } else {
        const temporary = path.join(path.dirname(destination), `.init-reconstruction-${input.snapshot_sha256}-${index}.tmp`);
        const handle = await fs.open(temporary, 'wx');
        try { await handle.writeFile(Buffer.from(op.after_base64, 'base64')); await handle.sync(); } finally { await handle.close(); }
        if (hash(await fs.readFile(destination)) !== op.before_sha256) throw Error('RECOVERY_LIVE_HASH_DRIFT');
        await fs.rename(temporary, destination);
      }
      await fs.appendFile(path.join(archive, 'events.jsonl'), JSON.stringify({ utc: new Date().toISOString(), file: op.file, after_sha256: op.after_sha256 }) + '\n');
    }
    for (const op of operations) {
      const value = await fs.readFile(await guardedPath(root, op.file)).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if ((value ? hash(value) : null) !== op.after_sha256) throw Error('RECOVERY_POSTCONDITION_FAILED');
    }
    return { success: true, reconstruction: 'git_content_baseline', archive: archiveRelative, files: operations.length };
  } finally {
    if (lock) { await lock.close(); await fs.unlink(lockPath!); }
    running.delete(root);
  }
}
