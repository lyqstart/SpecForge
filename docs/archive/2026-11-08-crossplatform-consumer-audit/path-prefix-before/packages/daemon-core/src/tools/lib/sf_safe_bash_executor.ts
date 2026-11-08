/** SPS §9.2 / D18: closed set of in-process read operations. Never a shell. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { SafeBashResult } from './sf_safe_bash_types';
import type { HostProfile } from './sf_safe_bash_core';

export const SHELL_EXECUTION_UNAVAILABLE = 'SHELL_EXECUTION_UNAVAILABLE';
export const READ_ONLY_COMMANDS = 'pwd/Get-Location; echo/Write-Output literal; cat/type/Get-Content file; ls/dir/Get-ChildItem directory; Test-Path path; Get-FileHash/sha256sum file; sleep seconds/Start-Sleep -Milliseconds number';
type Operation = { kind: 'pwd' | 'echo' | 'read' | 'list' | 'exists' | 'hash' | 'wait'; value: string };

// Quotes group literal arguments only. No expansion, escapes, operators or wrappers.
export function parseReadOnlyCommand(command: string): Operation | null {
  if (typeof command !== 'string' || command.length > 32768 || /[\x00-\x1f\x7f$`%;&|<>(){}]/.test(command)) return null;
  const tokens: string[] = [];
  const re = /\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"']+))/gy;
  let offset = 0;
  while (offset < command.length && command.slice(offset).trim()) {
    re.lastIndex = offset;
    const m = re.exec(command);
    if (!m || (re.lastIndex < command.length && !/\s/.test(command[re.lastIndex]!))) return null;
    tokens.push(m[1] ?? m[2] ?? m[3]!); offset = re.lastIndex;
  }
  const name = tokens.shift()?.toLowerCase();
  if (['pwd', 'get-location'].includes(name ?? '') && !tokens.length) return { kind: 'pwd', value: '' };
  if (['echo', 'write-output'].includes(name ?? '')) return { kind: 'echo', value: tokens.join(' ') };
  if (name === 'sleep' && tokens.length === 1 && /^\d+(?:\.\d+)?$/.test(tokens[0]!)) return { kind: 'wait', value: String(Number(tokens[0]) * 1000) };
  if (name === 'start-sleep' && tokens.length === 2 && tokens[0]?.toLowerCase() === '-milliseconds' && /^\d+$/.test(tokens[1]!)) return { kind: 'wait', value: tokens[1]! };
  if (['get-content', 'get-childitem', 'test-path', 'get-filehash'].includes(name ?? '') && ['-literalpath', '-path'].includes(tokens[0]?.toLowerCase() ?? '')) tokens.shift();
  if (['ls', 'dir', 'get-childitem'].includes(name ?? '') && tokens.length <= 1) return { kind: 'list', value: tokens[0] ?? '.' };
  if (tokens.length !== 1 || !tokens[0] || tokens[0].startsWith('-')) return null;
  const kinds: Record<string, Operation['kind']> = { cat: 'read', type: 'read', 'get-content': 'read', 'test-path': 'exists', 'get-filehash': 'hash', sha256sum: 'hash' };
  return name && Object.hasOwn(kinds, name) ? { kind: kinds[name]!, value: tokens[0] } : null;
}

export interface ExecuteOptions {
  command: string; cwd: string; projectRoot?: string; timeoutMs: number;
  env?: Record<string, string>; stdin?: string; outputLimit: number; profile?: HostProfile;
}

/** Fixed observer sink; never follow linked directories/files into business files. */
export function appendShellAudit(projectRoot: string, entry: Record<string, unknown>): void {
  try {
    let dir = fs.realpathSync(projectRoot);
    for (const part of ['.specforge', 'runtime', 'logs']) {
      dir = path.join(dir, part);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const st = fs.lstatSync(dir);
      if (st.isSymbolicLink() || !st.isDirectory()) return;
    }
    const file = path.join(dir, 'shell-history.jsonl');
    if (fs.existsSync(file)) {
      const st = fs.lstatSync(file);
      if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) return;
    }
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0));
    try { const st = fs.fstatSync(fd); if (st.isFile() && st.nlink === 1) fs.writeSync(fd, JSON.stringify(entry) + '\n'); }
    finally { fs.closeSync(fd); }
  } catch { /* Observer failure never turns a refused command into an allowed one. */ }
}

// Compatibility query only: no executable invocation can be obtained.
export function buildShellInvocation(command: string, _profile: HostProfile, _platform: NodeJS.Platform) {
  return { shell: null, shellPath: null, shellArgs: [] as string[], finalCommand: command };
}

function boundedPath(root: string, cwd: string, input: string, allowMissing = false): string {
  const base = fs.realpathSync(root), target = path.resolve(cwd, input), relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('READ_PATH_OUTSIDE_PROJECT');
  const parts = relative.split(path.sep);
  if (parts.some(p => ['.specforge', '.git', 'sf-user'].includes(p.toLowerCase())) || parts.some(p => p.includes(':'))) throw new Error('READ_PATH_REQUIRES_CONTROLLED_OWNER');
  let current = base;
  for (const part of parts) {
    if (!part) continue;
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('READ_LINK_FORBIDDEN'); }
    catch (e) { if (allowMissing && (e as NodeJS.ErrnoException).code === 'ENOENT') return target; throw e; }
  }
  return target;
}

export function resolveCwd(cwd: string | undefined, baseDir: string, _homeDir: string): { cwd: string | null; reason?: string } {
  try {
    const target = boundedPath(baseDir, fs.realpathSync(baseDir), cwd ?? '.');
    if (!fs.statSync(target).isDirectory()) throw new Error('READ_CWD_NOT_DIRECTORY');
    return { cwd: target };
  } catch (e) { return { cwd: null, reason: (e as Error).message }; }
}

export async function executeCommand(opts: ExecuteOptions): Promise<SafeBashResult> {
  const started = Date.now();
  const base: SafeBashResult = { success: false, exitCode: null, stdout: '', stderr: '', durationMs: 0, command: opts.command, cwd: opts.cwd, shell: null, rejected: true, timeout: false };
  const operation = parseReadOnlyCommand(opts.command);
  if (!operation || opts.env !== undefined || opts.stdin !== undefined) return { ...base, rule: SHELL_EXECUTION_UNAVAILABLE, suggestion: `No isolated external executor is available. Only internal read operations are supported: ${READ_ONLY_COMMANDS}. Scripts, builds and tests were NOT executed. Do not retry via another shell or helper.` };
  if (!Number.isSafeInteger(opts.timeoutMs) || opts.timeoutMs < 1 || opts.timeoutMs > 600000 || !Number.isSafeInteger(opts.outputLimit) || opts.outputLimit < 1 || opts.outputLimit > 1048576) return { ...base, rule: 'INVALID_READ_OPTIONS' };
  const timedOut = (): SafeBashResult => ({ ...base, rejected: false, timeout: true, timeoutMs: opts.timeoutMs, durationMs: Date.now() - started, hint: 'Internal read operation timed out; no process was started.' });
  try {
    const root = fs.realpathSync(opts.projectRoot ?? opts.cwd);
    const cwd = boundedPath(root, root, opts.cwd);
    if (!fs.statSync(cwd).isDirectory()) throw new Error('READ_CWD_NOT_DIRECTORY');
    let output = '', truncated = false;
    if (operation.kind === 'pwd') output = cwd + '\n';
    else if (operation.kind === 'echo') output = operation.value + '\n';
    else if (operation.kind === 'wait') {
      const ms = Number(operation.value);
      if (!Number.isFinite(ms) || ms > 600000) return { ...base, rule: 'INVALID_READ_WAIT' };
      await new Promise(resolve => setTimeout(resolve, Math.min(ms, opts.timeoutMs)));
      if (ms >= opts.timeoutMs) return timedOut();
    } else {
      const target = boundedPath(root, cwd, operation.value, operation.kind === 'exists');
      if (operation.kind === 'exists') output = String(fs.existsSync(target)) + '\n';
      else if (operation.kind === 'list') {
        const dir = await fs.promises.opendir(target);
        for await (const entry of dir) {
          if (Date.now() - started >= opts.timeoutMs) return timedOut();
          output += entry.name + (entry.isDirectory() ? '/' : '') + '\n';
          if (output.length > opts.outputLimit) { truncated = true; break; }
        }
      } else {
        const handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.nlink !== 1) throw new Error('READ_NON_REGULAR_OR_ALIASED_FILE');
          const digest = createHash('sha256'), decoder = new TextDecoder(), buffer = Buffer.alloc(65536);
          while (true) {
            if (Date.now() - started >= opts.timeoutMs) return timedOut();
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
            if (!bytesRead) break;
            if (operation.kind === 'hash') digest.update(buffer.subarray(0, bytesRead));
            else { output += decoder.decode(buffer.subarray(0, bytesRead), { stream: true }); if (output.length > opts.outputLimit) { truncated = true; break; } }
          }
          if (operation.kind === 'hash') output = digest.digest('hex') + '\n';
          else output += decoder.decode();
        } finally { await handle.close(); }
      }
    }
    truncated ||= output.length > opts.outputLimit;
    return { ...base, success: true, rejected: false, exitCode: 0, stdout: output.slice(0, opts.outputLimit), durationMs: Date.now() - started, hint: 'Executed internally; no shell or child process started.', ...(truncated ? { truncated: { stdout: true, stderr: false } } : {}) };
  } catch (e) { return { ...base, rejected: false, exitCode: 1, stderr: (e as Error).message, durationMs: Date.now() - started }; }
}
