/**
 * 通用探测工具：spawn + 超时 + 错误吞掉
 *
 * 设计原则（来自 lessons-injected）：
 * - A1: Promise.race 超时时 finally 中清理败者 timer
 * - C1: 命令本身用 spawn，超时用 SIGKILL 强制终止
 * - 探测失败不抛错，标记为不可用
 */

import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);

/** 默认探测超时（5 秒） */
export const PROBE_TIMEOUT_MS = 5000;

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  spawnError?: string;
}

/**
 * 安全 spawn：带超时、不抛错、必返回。
 *
 * - 超时：SIGKILL 强杀子进程，timedOut=true
 * - spawn 错误（ENOENT 等）：返回 exitCode=null + spawnError
 * - 正常退出：返回 stdout/stderr/exitCode
 *
 * Windows 特殊处理：执行 `.cmd` / `.bat` 文件时自动用 `cmd.exe /c` 包裹，
 * 因为 Node spawn 不能直接执行这些（它们是 cmd 脚本，不是 PE 可执行文件）。
 */
export async function safeSpawn(
  command: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<SpawnResult> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;

  // Windows 上 .cmd / .bat 需要通过 cmd.exe 执行
  const isWin = process.platform === 'win32';
  let actualCommand = command;
  let actualArgs = args;
  if (isWin) {
    const lower = command.toLowerCase();
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
      actualCommand = 'cmd.exe';
      actualArgs = ['/c', command, ...args];
    }
  }

  return new Promise<SpawnResult>(resolve => {
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    let resolved = false;

    const finalize = (result: SpawnResult) => {
      if (resolved) return;
      resolved = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(result);
    };

    let child;
    try {
      child = spawn(actualCommand, actualArgs, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      finalize({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: false,
        spawnError: (err as Error).message,
      });
      return;
    }

    child.on('error', err => {
      finalize({
        stdout,
        stderr,
        exitCode: null,
        timedOut: false,
        spawnError: (err as Error).message,
      });
    });

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    child.on('exit', code => {
      finalize({ stdout, stderr, exitCode: code, timedOut: false });
    });

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // 进程可能已经退出，忽略
      }
      finalize({ stdout, stderr, exitCode: null, timedOut: true });
    }, timeoutMs);
  });
}

/**
 * 找命令的绝对路径（跨平台 which/where）
 *
 * Windows: 用 where 命令（可能返回多行，包括无扩展名文件）
 * macOS / Linux: 用 which 命令
 *
 * 返回找到的**第一个真实存在 + 可执行**的绝对路径，未找到返回 null。
 *
 * 注意：Windows 上 npm 安装的工具会有多个候选（如 bun / bun.cmd / bun.ps1），
 * `where` 会列出所有，包括无扩展名的 stub 文件（实际不可直接 spawn 执行）。
 * 这里只取 .exe / .cmd / .bat 扩展名的，因为这些才是 Node spawn 能直接调用的。
 */
export async function whichCommand(name: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where' : 'which';
  const args = isWin ? [name] : [name];

  const result = await safeSpawn(cmd, args, { timeoutMs: 3000 });

  if (result.spawnError || result.exitCode !== 0) {
    return null;
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (isWin) {
    // Windows: 优先返回 .exe / .cmd / .bat，跳过 .ps1 和无扩展名 stub
    const executableExts = ['.exe', '.cmd', '.bat', '.com'];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (executableExts.some(ext => lower.endsWith(ext)) && existsSync(line)) {
        return line;
      }
    }
    return null;
  }

  // POSIX: 取第一个真实存在的（通常 which 只返回一行）
  for (const line of lines) {
    if (existsSync(line)) {
      return line;
    }
  }
  return null;
}

/**
 * 从命令输出中提取 SemVer 风格的版本号
 *
 * 示例匹配：
 *   "git version 2.45.0" → "2.45.0"
 *   "1.3.11" → "1.3.11"
 *   "v22.5.1" → "22.5.1"
 *   "PowerShell 7.5.0" → "7.5.0"
 */
export function extractVersion(output: string): string | null {
  if (!output) return null;
  // 匹配 X.Y.Z 或 X.Y.Z.W 形式
  const match = output.match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? match[0] : null;
}

/**
 * 检测 CI 环境
 *
 * 任一环境变量存在即认为是 CI 环境。
 */
export function detectCI(): boolean {
  const indicators = [
    'CI',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'JENKINS_HOME',
    'BUILDKITE',
    'TEAMCITY_VERSION',
    'TF_BUILD', // Azure DevOps
  ];
  return indicators.some(key => process.env[key]);
}

/**
 * 让 promises 并行运行，失败的不影响其他。
 *
 * 等价于 Promise.allSettled，但更明确地把每个结果归类成 ok/err。
 */
export async function parallelProbe<T>(
  probes: Array<{ name: string; fn: () => Promise<T> }>
): Promise<Array<{ name: string; ok: true; value: T } | { name: string; ok: false; error: string }>> {
  const results = await Promise.allSettled(probes.map(p => p.fn()));
  return results.map((r, i) => {
    const name = probes[i].name;
    if (r.status === 'fulfilled') {
      return { name, ok: true as const, value: r.value };
    }
    return {
      name,
      ok: false as const,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}

/**
 * 原子写入 JSON 文件
 *
 * 1. 写入临时文件
 * 2. fsync 保证数据落盘
 * 3. rename 到目标路径
 *
 * 避免扫描中途崩溃留下残缺文件。
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // 用随机后缀避免并发冲突
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(data, null, 2) + '\n';

  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    // 失败时尝试清理临时文件
    try {
      await fs.unlink(tmpPath);
    } catch {
      // 临时文件可能不存在，忽略
    }
    throw err;
  }
}

/**
 * 安全读取 JSON 文件
 *
 * 失败（文件不存在 / 解析失败）返回 null。
 */
export async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
