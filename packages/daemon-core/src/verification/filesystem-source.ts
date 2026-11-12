/** D25 strict source owner. Never writes project/governance files or infers a missing filesystem mode. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { SPEC_DIR_NAME, workItemRoot } from '@specforge/types/directory-layout';
import {
  assertVerificationPath,
  readVerificationFile,
  canonicalVerificationJson as json,
  verificationId as hash,
} from './owner-store';
import { assertVerificationRelativePath, type VerificationInputFile } from './source-snapshot';
import type { VerificationAssets, VerificationAuthoritySnapshot } from './verification-plan';

export const FILESYSTEM_SOURCE_CONTRACT = 'verification-filesystem-source/v1' as const;
export interface PhysicalSourceEntry {
  path: string;
  type: 'file' | 'directory';
  volume: string;
  fileId: string;
}
export interface FilesystemVerificationSource {
  contract: typeof FILESYSTEM_SOURCE_CONTRACT;
  projectRoot: string;
  workItemId: string;
  scopeSha256: string;
  baselineSha256: string;
  inventory: PhysicalSourceEntry[];
  availablePaths: string[];
  files: VerificationInputFile[];
  identity: string;
}
function requireFact(value: unknown, code: string): asserts value {
  if (!value) throw Error('VERIFICATION_FILESYSTEM_' + code);
}
function object(value: unknown, keys?: string[]): Record<string, unknown> {
  requireFact(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    'OBJECT'
  );
  if (keys)
    requireFact(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'FIELDS');
  return value as Record<string, unknown>;
}
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v);
const instant = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
function relative(v: unknown): asserts v is string {
  requireFact(
    typeof v === 'string' && v.length <= 1024 && v.split('/').length <= 64,
    'PATH_BUDGET'
  );
  assertVerificationRelativePath(v);
}
function applicationPath(v: string): void {
  relative(v);
  requireFact(
    !v.split('/').some(p => ['.git', SPEC_DIR_NAME, 'node_modules'].includes(p.toLowerCase())),
    'PROTECTED_INPUT'
  );
}
function selectedPath(v: string): void {
  applicationPath(v);
  const parts = v.toLowerCase().split('/');
  requireFact(
    !parts.some(p => ['.aws', '.ssh', '.config', '.opencode'].includes(p)) &&
      !/^(?:\.env(?:\..*)?|auth\.json|credentials\.json|host-profile\.json|opencode\.jsonc?)$/.test(
        parts[parts.length - 1]
      ),
    'CREDENTIAL_INPUT'
  );
}
function strictInventory(value: unknown): asserts value is PhysicalSourceEntry[] {
  requireFact(Array.isArray(value) && value.length > 0 && value.length <= 4096, 'INVENTORY_BUDGET');
  const paths = new Map<string, string>(),
    physical = new Set<string>();
  let previous: string | undefined;
  for (const raw of value) {
    const row = object(raw, ['path', 'type', 'volume', 'fileId']);
    requireFact(
      typeof row.path === 'string' &&
        ['file', 'directory'].includes(String(row.type)) &&
        decimal(row.volume) &&
        decimal(row.fileId),
      'INVENTORY_FIELDS'
    );
    const name = row.path;
    if (name !== '') {
      relative(name);
      if (name !== SPEC_DIR_NAME) applicationPath(name);
    }
    requireFact(
      previous === undefined ? name === '' && row.type === 'directory' : previous < name,
      'INVENTORY_ORDER'
    );
    const key = name.toLowerCase(),
      identity = row.volume + ':' + row.fileId;
    requireFact(!paths.has(key) && !physical.has(identity), 'INVENTORY_ALIAS');
    if (name !== '')
      requireFact(
        paths.get(name.includes('/') ? name.slice(0, name.lastIndexOf('/')).toLowerCase() : '') ===
          'directory',
        'INVENTORY_PARENT'
      );
    if (name === SPEC_DIR_NAME) requireFact(row.type === 'directory', 'GOVERNANCE_DIRECTORY');
    paths.set(key, String(row.type));
    physical.add(identity);
    previous = name;
  }
  requireFact(paths.get(SPEC_DIR_NAME) === 'directory', 'GOVERNANCE_DIRECTORY_MISSING');
}
export function validateFilesystemSource(
  value: unknown
): asserts value is FilesystemVerificationSource {
  const s = object(value, [
    'contract',
    'projectRoot',
    'workItemId',
    'scopeSha256',
    'baselineSha256',
    'inventory',
    'availablePaths',
    'files',
    'identity',
  ]);
  requireFact(
    s.contract === FILESYSTEM_SOURCE_CONTRACT &&
      typeof s.projectRoot === 'string' &&
      path.isAbsolute(s.projectRoot) &&
      typeof s.workItemId === 'string' &&
      /^WI-[0-9]{4,}$/.test(s.workItemId),
    'SUBJECT'
  );
  requireFact(digest(s.scopeSha256) && digest(s.baselineSha256) && digest(s.identity), 'HASH');
  strictInventory(s.inventory);
  const available = s.inventory.filter(e => e.type === 'file').map(e => e.path);
  requireFact(json(s.availablePaths) === json(available), 'AVAILABLE_PATHS');
  requireFact(Array.isArray(s.files) && s.files.length <= 2048, 'FILES');
  let bytes = 0;
  const seen = new Set<string>();
  for (const raw of s.files) {
    const f = object(raw, ['path', 'bytes', 'sha256', 'device', 'inode']);
    relative(f.path);
    selectedPath(f.path);
    requireFact(
      available.includes(f.path) &&
        !seen.has(f.path.toLowerCase()) &&
        Number.isSafeInteger(f.bytes) &&
        Number(f.bytes) >= 0 &&
        digest(f.sha256) &&
        decimal(f.device) &&
        decimal(f.inode),
      'INPUT'
    );
    requireFact(
      s.inventory.find(entry => entry.path === f.path)?.fileId === f.inode,
      'INPUT_PHYSICAL_IDENTITY'
    );
    seen.add(f.path.toLowerCase());
    bytes += Number(f.bytes);
  }
  requireFact(bytes <= 16777216, 'INPUT_BUDGET');
  const { identity: _identity, ...body } = s;
  requireFact(hash(json(body)) === s.identity, 'IDENTITY');
}

export async function verificationSourceMode(
  root: string,
  authority: VerificationAuthoritySnapshot
): Promise<'git' | 'filesystem'> {
  const file = path.join(workItemRoot(root, authority.workItemId), 'governance_scope.json'),
    raw = await readVerificationFile(file);
  requireFact(
    hash(raw) === authority.files[path.relative(root, file).replace(/\\/g, '/')],
    'SCOPE_DRIFT'
  );
  const scope = object(JSON.parse(raw.toString('utf8')));
  const mode = scope.version_control_mode;
  requireFact(mode === undefined || mode === 'git' || mode === 'filesystem', 'MODE_UNKNOWN');
  return mode === 'filesystem' ? 'filesystem' : 'git';
}

async function filesystemAuthority(
  root: string,
  authority: VerificationAuthoritySnapshot
): Promise<{ scopeSha256: string; baselineSha256: string }> {
  requireFact((await verificationSourceMode(root, authority)) === 'filesystem', 'MODE_REQUIRED');
  const wi = workItemRoot(root, authority.workItemId),
    scopeRaw = await readVerificationFile(path.join(wi, 'governance_scope.json')),
    scope = object(JSON.parse(scopeRaw.toString('utf8')));
  requireFact(
    scope.schema_version === '1.0' &&
      scope.work_item_id === authority.workItemId &&
      scope.project_spec_version === authority.psv &&
      instant(scope.frozen_at) &&
      !Object.hasOwn(scope, 'git_head_at_freeze') &&
      !Object.hasOwn(scope, 'git_branch_at_freeze'),
    'SCOPE_IDENTITY'
  );
  try {
    await fs.lstat(path.join(wi, 'git_context.json'));
    throw Error('VERIFICATION_FILESYSTEM_GIT_CONTEXT');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const raw = await readVerificationFile(path.join(wi, 'filesystem_baseline.json')),
    baseline = object(JSON.parse(raw.toString('utf8')), [
      'schema_version',
      'content_hash_algorithm',
      'timestamp',
      'root',
      'files',
    ]);
  requireFact(
    hash(raw) ===
      authority.files[
        path.relative(root, path.join(wi, 'filesystem_baseline.json')).replace(/\\/g, '/')
      ],
    'BASELINE_DRIFT'
  );
  requireFact(
    baseline.schema_version === '2.0' &&
      baseline.content_hash_algorithm === 'sha256' &&
      instant(baseline.timestamp) &&
      typeof baseline.root === 'string' &&
      path.resolve(baseline.root).toLowerCase() === path.resolve(root).toLowerCase() &&
      Array.isArray(baseline.files) &&
      baseline.files.length <= 4096,
    'BASELINE_SCHEMA'
  );
  const names = new Set<string>();
  for (const rawFile of baseline.files) {
    const f = object(rawFile, ['path', 'size', 'mtimeMs', 'sha256']);
    relative(f.path);
    requireFact(
      !names.has(f.path.toLowerCase()) &&
        Number.isSafeInteger(f.size) &&
        Number(f.size) >= 0 &&
        typeof f.mtimeMs === 'number' &&
        Number.isFinite(f.mtimeMs) &&
        digest(f.sha256),
      'BASELINE_FILE'
    );
    names.add(f.path.toLowerCase());
  }
  return { scopeSha256: hash(scopeRaw), baselineSha256: hash(raw) };
}

async function inspect(
  root: string,
  selectedPaths: readonly string[],
  owner: string,
  assets: VerificationAssets
): Promise<{
  inventory: PhysicalSourceEntry[];
  selectedFiles: Array<{
    path: string;
    bytes: number;
    sha256: string;
    volume: string;
    fileId: string;
    bytesBase64: string;
  }>;
}> {
  requireFact(process.platform === 'win32' && process.arch === 'x64', 'PLATFORM_UNSUPPORTED');
  for (const name of selectedPaths) selectedPath(name);
  const bytes = Buffer.from(
    json({ contract: 'verification-source-inspection/v1', projectRoot: root, selectedPaths }) + '\n'
  );
  requireFact(bytes.length <= 262144, 'REQUEST_BUDGET');
  requireFact(
    hash(await readVerificationFile(assets.launcherPath, 268435456)) === assets.launcherSha256,
    'LAUNCHER_DRIFT'
  );
  const request = path.join(owner, 'source-requests', randomUUID().replace(/-/g, '') + '.json');
  await assertVerificationPath(request, true);
  await fs.mkdir(path.dirname(request), { recursive: true, mode: 0o700 });
  await assertVerificationPath(path.dirname(request));
  await fs.writeFile(request, bytes, { flag: 'wx', mode: 0o600 });
  const env: NodeJS.ProcessEnv = { OPENCODE_CONFIG_DIR: path.resolve(owner, '../../..') };
  for (const k of ['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'SYSTEMDRIVE'])
    if (process.env[k] !== undefined) env[k] = process.env[k];
  const result = await new Promise<{
    stdout: Buffer;
    stderr: Buffer;
    code: number | null;
    failed: boolean;
  }>(resolve => {
    const child = spawn(
      assets.launcherPath,
      ['--verification-source-inspect', request, hash(bytes)],
      { cwd: owner, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const out: Buffer[] = [],
      err: Buffer[] = [];
    let outSize = 0,
      errSize = 0,
      failed = false;
    const stop = () => {
      failed = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(stop, 30000);
    child.stdout.on('data', (chunk: Buffer) => {
      outSize += chunk.length;
      if (outSize > 25165824) stop();
      else out.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errSize += chunk.length;
      if (errSize > 65536) stop();
      else err.push(Buffer.from(chunk));
    });
    child.once('error', () => {
      failed = true;
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err),
        code,
        failed: failed || code !== 0 || signal !== null,
      });
    });
  });
  await fs.writeFile(request + '.stdout', result.stdout, { flag: 'wx', mode: 0o600 });
  await fs.writeFile(request + '.stderr', result.stderr, { flag: 'wx', mode: 0o600 });
  await fs.writeFile(
    request + '.result.json',
    json({
      utc: new Date().toISOString(),
      code: result.code,
      failed: result.failed,
      requestSha256: hash(bytes),
      stdoutSha256: hash(result.stdout),
      stderrSha256: hash(result.stderr),
    }) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
  requireFact(
    !result.failed &&
      result.code === 0 &&
      result.stderr.length <= 65536 &&
      result.stdout.length <= 25165824,
    'NATIVE_INSPECTION_REJECTED'
  );
  const value = object(JSON.parse(result.stdout.toString('utf8')), [
    'contract',
    'projectRoot',
    'inventory',
    'selectedFiles',
  ]);
  requireFact(
    value.contract === 'verification-source-inspection/v1' && value.projectRoot === root,
    'INSPECTION_SUBJECT'
  );
  strictInventory(value.inventory);
  requireFact(
    Array.isArray(value.selectedFiles) && value.selectedFiles.length === selectedPaths.length,
    'INSPECTION_FILES'
  );
  const seen = new Set<string>();
  let total = 0;
  for (const raw of value.selectedFiles) {
    const f = object(raw, ['path', 'bytes', 'sha256', 'volume', 'fileId', 'bytesBase64']);
    relative(f.path);
    requireFact(
      selectedPaths.includes(f.path) &&
        !seen.has(f.path) &&
        digest(f.sha256) &&
        decimal(f.volume) &&
        decimal(f.fileId) &&
        Number.isSafeInteger(f.bytes) &&
        Number(f.bytes) >= 0 &&
        typeof f.bytesBase64 === 'string',
      'INSPECTION_FILE'
    );
    const entry = value.inventory.find(e => e.path === f.path);
    requireFact(
      entry?.type === 'file' && entry.volume === f.volume && entry.fileId === f.fileId,
      'INSPECTION_IDENTITY'
    );
    const rawBytes = Buffer.from(f.bytesBase64, 'base64');
    total += rawBytes.length;
    requireFact(
      rawBytes.toString('base64') === f.bytesBase64 &&
        rawBytes.length === f.bytes &&
        hash(rawBytes) === f.sha256 &&
        total <= 16777216,
      'INSPECTION_BYTES'
    );
    seen.add(f.path);
  }
  return value as unknown as Awaited<ReturnType<typeof inspect>>;
}

export async function captureFilesystemSource(
  root: string,
  authority: VerificationAuthoritySnapshot,
  selected: readonly string[],
  owner: string,
  assets: VerificationAssets
): Promise<FilesystemVerificationSource> {
  const binding = await filesystemAuthority(root, authority),
    before = await inspect(root, selected, owner, assets),
    files: VerificationInputFile[] = [];
  for (const native of before.selectedFiles) {
    const file = path.join(root, native.path),
      bytes = Buffer.from(native.bytesBase64, 'base64'),
      stat = await fs.lstat(file, { bigint: true });
    requireFact(
      bytes.length === native.bytes &&
        hash(bytes) === native.sha256 &&
        stat.ino.toString() === native.fileId,
      'SELECTED_DRIFT'
    );
    files.push({
      path: native.path,
      bytes: bytes.length,
      sha256: native.sha256,
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
    });
  }
  const after = await inspect(root, selected, owner, assets);
  requireFact(
    json(before) === json(after) &&
      json(binding) === json(await filesystemAuthority(root, authority)),
    'SCAN_DRIFT'
  );
  files.sort((a, b) => a.path.localeCompare(b.path));
  const body = {
    contract: FILESYSTEM_SOURCE_CONTRACT,
    projectRoot: root,
    workItemId: authority.workItemId,
    ...binding,
    inventory: before.inventory,
    availablePaths: before.inventory.filter(e => e.type === 'file').map(e => e.path),
    files,
  };
  const result = { ...body, identity: hash(json(body)) };
  validateFilesystemSource(result);
  return result;
}

/** The discovery parser receives only bytes read through the fixed native no-follow controller. */
export function filesystemSourceReader(
  root: string,
  owner: string,
  assets: VerificationAssets
): (file: string, limit?: number) => Promise<Buffer> {
  return async (file, limit = 16777216) => {
    const name = path.relative(root, file).replace(/\\/g, '/');
    applicationPath(name);
    const result = await inspect(root, [name], owner, assets),
      bytes = Buffer.from(result.selectedFiles[0].bytesBase64, 'base64');
    requireFact(bytes.length <= limit, 'READ_BUDGET');
    return bytes;
  };
}

export async function readFilesystemInputs(
  source: FilesystemVerificationSource,
  owner: string,
  assets: VerificationAssets
): Promise<Map<string, Buffer>> {
  const result = await inspect(
    source.projectRoot,
    source.files.map(f => f.path),
    owner,
    assets
  );
  requireFact(json(result.inventory) === json(source.inventory), 'INPUT_INVENTORY_DRIFT');
  const inputs = new Map<string, Buffer>();
  for (const file of source.files) {
    const entry = result.selectedFiles.find(f => f.path === file.path);
    requireFact(
      entry &&
        entry.sha256 === file.sha256 &&
        entry.bytes === file.bytes &&
        entry.fileId === file.inode,
      'FROZEN_INPUT_DRIFT'
    );
    inputs.set(file.path, Buffer.from(entry.bytesBase64, 'base64'));
  }
  return inputs;
}
