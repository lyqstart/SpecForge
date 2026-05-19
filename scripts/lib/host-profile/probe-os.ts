/**
 * OS 信息探测
 *
 * 不需要 spawn，纯 node:os API + 系统命令获取额外信息。
 */

import * as os from 'node:os';
import { existsSync } from 'node:fs';
import type { OsInfo, LocaleInfo } from './types';
import { safeSpawn, detectCI, whichCommand } from './probe-utils';

/**
 * 探测 OS 基础信息
 */
export async function probeOs(): Promise<OsInfo> {
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();

  const totalmem_gb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpu_count = os.cpus().length;

  // 拿人类可读的版本号（Windows 11 Pro 24H2 / macOS 14.5 Sonoma 等）
  const version = await getHumanReadableOsVersion(platform, release);

  return {
    platform,
    release,
    version,
    arch,
    totalmem_gb,
    cpu_count,
  };
}

/**
 * 在 Windows 上跑 PowerShell 命令并强制 UTF-8 输出
 *
 * 核心：在命令前注入编码设置，强制 stdout 编码为 UTF-8。
 *
 * 注意：pwsh 在交互式终端中默认 UTF-8，但被 Node spawn 调用时（无控制台），
 * `$OutputEncoding` 默认是 `[System.Text.ASCIIEncoding]`，**必须**显式设置才能正确输出非 ASCII 字符。
 *
 * 优先用 pwsh.exe，找不到才用 powershell.exe。
 */
async function runWindowsPowerShell(
  scriptCommand: string,
  timeoutMs = 3000
): Promise<string | null> {
  // 编码设置前缀（pwsh 和 powershell 通用）
  const encodingPrefix = [
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
  ].join('; ');

  const wrapped = `${encodingPrefix}; ${scriptCommand}`;

  // 优先 pwsh
  const pwshPath = await whichCommand('pwsh');
  if (pwshPath) {
    const result = await safeSpawn(
      pwshPath,
      ['-NoProfile', '-NonInteractive', '-Command', wrapped],
      { timeoutMs }
    );
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  // 降级到 powershell.exe（同样注入编码）
  const result = await safeSpawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', wrapped],
    { timeoutMs }
  );
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  return null;
}

/**
 * 获取人类可读的 OS 版本字符串
 */
async function getHumanReadableOsVersion(platform: NodeJS.Platform, release: string): Promise<string> {
  if (platform === 'win32') {
    // Windows: 用 PowerShell 拿 ProductName，自动处理编码
    const caption = await runWindowsPowerShell(
      '(Get-CimInstance Win32_OperatingSystem).Caption'
    );
    if (caption) return caption;
    return `Windows ${release}`;
  }

  if (platform === 'darwin') {
    // macOS: sw_vers
    const result = await safeSpawn('sw_vers', ['-productName'], { timeoutMs: 2000 });
    const ver = await safeSpawn('sw_vers', ['-productVersion'], { timeoutMs: 2000 });
    if (result.exitCode === 0 && ver.exitCode === 0) {
      return `${result.stdout.trim()} ${ver.stdout.trim()}`;
    }
    return `macOS ${release}`;
  }

  if (platform === 'linux') {
    // Linux: 优先 /etc/os-release
    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile('/etc/os-release', 'utf-8');
      const prettyName = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
      if (prettyName) return prettyName;
    } catch {
      // 文件不存在，降级
    }
    return `Linux ${release}`;
  }

  return `${platform} ${release}`;
}

/**
 * 探测 Locale 信息
 */
export async function probeLocale(platform: NodeJS.Platform): Promise<LocaleInfo> {
  // 时区（Node 内置 Intl 拿就行，无需 spawn）
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // getTimezoneOffset 返回的符号和 IANA 偏移相反（中国 UTC+8 → -480）
  const tz_offset_minutes = -new Date().getTimezoneOffset();

  // 系统语言
  const system_lang = await getSystemLanguage(platform);

  // Windows 控制台代码页
  let console_codepage: number | null = null;
  if (platform === 'win32') {
    console_codepage = await getWindowsCodepage();
  }

  return {
    system_lang,
    console_codepage,
    encoding: 'UTF-8',
    timezone,
    tz_offset_minutes,
    datetime_now: new Date().toISOString(),
  };
}

/**
 * 获取系统语言
 *
 * Windows: PowerShell `(Get-Culture).Name`
 * macOS / Linux: 环境变量 LANG / LC_ALL
 */
async function getSystemLanguage(platform: NodeJS.Platform): Promise<string> {
  if (platform === 'win32') {
    const lang = await runWindowsPowerShell('(Get-Culture).Name');
    if (lang) return lang;
    // 降级：Node 的 process.env.LANG
    return process.env.LANG || process.env.LC_ALL || 'en-US';
  }

  // POSIX
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES;
  if (lang) {
    // "en_US.UTF-8" → "en-US"
    return lang.split('.')[0]?.replace('_', '-') || 'en-US';
  }
  return 'en-US';
}

/**
 * 获取 Windows 控制台代码页
 *
 * 跑 `chcp` 解析输出："活动代码页：936" 或 "Active code page: 936"
 */
async function getWindowsCodepage(): Promise<number | null> {
  const result = await safeSpawn('cmd.exe', ['/c', 'chcp'], { timeoutMs: 2000 });
  if (result.exitCode !== 0) return null;
  const match = result.stdout.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 探测是否在 CI 环境（导出供其他模块使用）
 */
export { detectCI };
