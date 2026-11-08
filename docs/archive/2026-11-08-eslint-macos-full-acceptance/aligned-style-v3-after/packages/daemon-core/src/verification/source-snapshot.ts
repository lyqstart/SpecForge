import { hasAsciiControl } from '@specforge/types';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
/** Read-only Git plumbing plus physical/raw-byte inventory. Never invokes shell, filters or hooks. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  assertVerificationPath,
  canonicalVerificationJson,
  readVerificationFile,
  verificationId,
} from './owner-store';
import { verificationRejectionDiagnostic } from './rejection-diagnostic';

export interface VerificationInputFile {
  path: string;
  bytes: number;
  sha256: string;
  device: string;
  inode: string;
}
export interface VerificationSourceSnapshot {
  projectRoot: string;
  head: string;
  branch: string;
  indexSha256: string;
  configSha256: string;
  files: VerificationInputFile[];
  trackedPaths: string[];
  identity: string;
}

export function assertVerificationRelativePath(relative: string): void {
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
          hasAsciiControl(part) ||
          /[<>:"|?*]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      )
  )
    throw new Error('VERIFICATION_INPUT_PATH_INVALID');
}

function gitRead(root: string, args: string[]): Promise<string> {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'SYSTEMDRIVE']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  Object.assign(env, {
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  });
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [
        '--no-pager',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'protocol.allow=never',
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        '-c',
        'gc.auto=0',
        ...args,
      ],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 15000,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error: Error | null, stdout: string) => {
        if (error) {
          console.error(
            JSON.stringify({
              ...verificationRejectionDiagnostic(error),
              stage: 'source_git_read',
              git_operation: args[0],
            })
          );
          reject(error);
        } else resolve(stdout);
      }
    );
  });
}

export async function captureVerificationSource(
  projectRoot: string,
  inputPaths?: readonly string[]
): Promise<VerificationSourceSnapshot> {
  const root = path.resolve(projectRoot);
  await assertVerificationPath(root);
  await assertVerificationPath(path.join(root, '.git'));
  if (!(await fs.lstat(path.join(root, '.git'))).isDirectory())
    throw new Error('VERIFICATION_EXTERNAL_GIT_UNSUPPORTED');
  const top = path.resolve((await gitRead(root, ['rev-parse', '--show-toplevel'])).trim());
  const same = (a: string, b: string) =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (
    !same(top, root) ||
    !same(
      path.resolve(root, (await gitRead(root, ['rev-parse', '--git-common-dir'])).trim()),
      path.join(root, '.git')
    )
  ) {
    throw new Error('VERIFICATION_EXTERNAL_GIT_UNSUPPORTED');
  }
  const head = (await gitRead(root, ['rev-parse', '--verify', 'HEAD'])).trim();
  const branch = (await gitRead(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || !branch)
    throw new Error('VERIFICATION_GIT_IDENTITY_REQUIRED');
  const indexBefore = verificationId(await readVerificationFile(path.join(root, '.git', 'index')));
  const configBefore = verificationId(
    await readVerificationFile(path.join(root, '.git', 'config'))
  );
  for (const name of (await gitRead(root, ['ls-files', '--others', '--exclude-standard', '-z']))
    .split('\0')
    .filter(Boolean)) {
    assertVerificationRelativePath(name);
    if (!name.toLowerCase().startsWith(`${SPEC_DIR_NAME}/` as const))
      throw new Error('VERIFICATION_UNTRACKED_INPUT:' + name);
  }
  const files: VerificationInputFile[] = [],
    trackedPaths: string[] = [],
    identities = new Set<string>();
  const selected = inputPaths === undefined ? null : new Set(inputPaths);
  if (selected) for (const name of selected) assertVerificationRelativePath(name);
  let total = 0;
  for (const record of (await gitRead(root, ['ls-files', '--stage', '-z']))
    .split('\0')
    .filter(Boolean)) {
    const match = /^(100644|100755) [a-f0-9]{40} 0\t(.+)$/.exec(record);
    if (!match) throw new Error('VERIFICATION_INDEX_KIND_UNSUPPORTED');
    const relative = match[2];
    assertVerificationRelativePath(relative);
    const identity = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (identities.has(identity)) throw new Error('VERIFICATION_INPUT_PATH_ALIAS');
    identities.add(identity);
    if (relative.split('/').some(p => ['.git', 'node_modules'].includes(p.toLowerCase())))
      throw new Error('VERIFICATION_DEPENDENCY_OR_GIT_INPUT');
    if (relative.toLowerCase().startsWith(`${SPEC_DIR_NAME}/` as const)) continue;
    trackedPaths.push(relative);
    if (selected && !selected.has(relative)) continue;
    const full = path.join(root, relative),
      bytes = await readVerificationFile(full),
      stat = await fs.lstat(full, { bigint: true });
    total += bytes.length;
    if (total > 16 * 1024 * 1024 || files.length >= 2048)
      throw new Error('VERIFICATION_INPUT_BUDGET');
    files.push({
      path: relative,
      bytes: bytes.length,
      sha256: verificationId(bytes),
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  if (selected && files.length !== selected.size)
    throw new Error('VERIFICATION_SELECTED_INPUT_NOT_TRACKED');
  trackedPaths.sort();
  const snapshot = {
    projectRoot: root,
    head,
    branch,
    indexSha256: indexBefore,
    configSha256: configBefore,
    files,
    trackedPaths,
  };
  if (
    head !== (await gitRead(root, ['rev-parse', '--verify', 'HEAD'])).trim() ||
    branch !== (await gitRead(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim() ||
    indexBefore !== verificationId(await readVerificationFile(path.join(root, '.git', 'index'))) ||
    configBefore !== verificationId(await readVerificationFile(path.join(root, '.git', 'config')))
  )
    throw new Error('VERIFICATION_GIT_CHANGED_DURING_SNAPSHOT');
  return { ...snapshot, identity: verificationId(canonicalVerificationJson(snapshot)) };
}

export async function readFrozenVerificationInputs(
  snapshot: VerificationSourceSnapshot
): Promise<Map<string, Buffer>> {
  const inputs = new Map<string, Buffer>();
  for (const file of snapshot.files) {
    const full = path.join(snapshot.projectRoot, file.path),
      bytes = await readVerificationFile(full),
      stat = await fs.lstat(full, { bigint: true });
    if (
      bytes.length !== file.bytes ||
      verificationId(bytes) !== file.sha256 ||
      stat.dev.toString() !== file.device ||
      stat.ino.toString() !== file.inode
    ) {
      throw new Error('VERIFICATION_SOURCE_CHANGED:' + file.path);
    }
    inputs.set(file.path, bytes);
  }
  return inputs;
}
