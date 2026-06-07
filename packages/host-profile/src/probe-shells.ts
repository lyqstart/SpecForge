/**
 * Shell 探测
 *
 * 按平台优先级探测 shell：
 *   Windows: pwsh > powershell > cmd > bash (git bash if any)
 *   macOS:   zsh > bash > sh
 *   Linux:   bash > zsh > sh > dash
 *
 * 结果带 preferred 标记（每个平台只标记一个）。
 */

import type { ShellInfo, ShellName } from './types.js';
import { safeSpawn, whichCommand, extractVersion, parallelProbe } from './probe-utils.js';

/**
 * 各平台的 shell 候选列表（按优先级排序）
 */
const SHELL_CANDIDATES: Record<NodeJS.Platform, ShellName[]> = {
  win32: ['pwsh', 'powershell', 'cmd', 'bash'],
  darwin: ['zsh', 'bash', 'sh'],
  linux: ['bash', 'zsh', 'sh', 'dash'],
  freebsd: ['bash', 'sh'],
  openbsd: ['bash', 'sh'],
  sunos: ['bash', 'sh'],
  aix: ['bash', 'sh'],
  android: ['sh'],
  cygwin: ['bash'],
  haiku: ['bash'],
  netbsd: ['bash'],
};

/**
 * 各 shell 的默认编码
 *
 * - pwsh (PowerShell 7+) 默认 UTF-8（不需要修复）
 * - powershell (Windows PowerShell 5.1) 默认 UTF-16-LE，stdout 多半显示成 GBK（需要修复）
 * - cmd 默认 GBK（中文 Windows）/ CP437（英文 Windows）（需要修复）
 * - bash / zsh / sh 默认 UTF-8
 */
const SHELL_DEFAULT_ENCODING: Record<ShellName, { encoding: string; needsFix: boolean }> = {
  pwsh: { encoding: 'UTF-8', needsFix: false },
  powershell: { encoding: 'UTF-16-LE', needsFix: true },
  cmd: { encoding: 'GBK', needsFix: true },
  bash: { encoding: 'UTF-8', needsFix: false },
  zsh: { encoding: 'UTF-8', needsFix: false },
  sh: { encoding: 'UTF-8', needsFix: false },
  dash: { encoding: 'UTF-8', needsFix: false },
  fish: { encoding: 'UTF-8', needsFix: false },
};

/**
 * 各 shell 的版本探测命令
 */
function getVersionCommand(name: ShellName): { cmd: string; args: string[] } {
  switch (name) {
    case 'pwsh':
    case 'powershell':
      return { cmd: name, args: ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'] };
    case 'cmd':
      // cmd 没有 --version，用 ver 命令
      return { cmd: 'cmd', args: ['/c', 'ver'] };
    case 'bash':
    case 'zsh':
    case 'sh':
    case 'dash':
    case 'fish':
      return { cmd: name, args: ['--version'] };
    default:
      return { cmd: name, args: ['--version'] };
  }
}

/**
 * 探测单个 shell
 */
async function probeShell(name: ShellName, platform: NodeJS.Platform): Promise<ShellInfo> {
  const encInfo = SHELL_DEFAULT_ENCODING[name];

  // 第一步：找绝对路径
  const path = await whichCommand(name);
  if (!path) {
    return {
      name,
      path: null,
      version: null,
      default_encoding: encInfo.encoding,
      needs_encoding_fix: encInfo.needsFix,
      available: false,
      preferred: false,
      note: getNotAvailableNote(name, platform),
    };
  }

  // 第二步：探测版本
  const { cmd, args } = getVersionCommand(name);
  const result = await safeSpawn(cmd, args, { timeoutMs: 3000 });

  let version: string | null = null;
  if (result.spawnError) {
    return {
      name,
      path,
      version: null,
      default_encoding: encInfo.encoding,
      needs_encoding_fix: encInfo.needsFix,
      available: false,
      preferred: false,
      note: `探测版本失败: ${result.spawnError}`,
    };
  }

  if (result.timedOut) {
    return {
      name,
      path,
      version: null,
      default_encoding: encInfo.encoding,
      needs_encoding_fix: encInfo.needsFix,
      available: false,
      preferred: false,
      note: '探测版本超时',
    };
  }

  const output = result.stdout || result.stderr; // 某些 shell 把版本写 stderr
  version = extractVersion(output);

  return {
    name,
    path,
    version,
    default_encoding: encInfo.encoding,
    needs_encoding_fix: encInfo.needsFix,
    available: true,
    preferred: false, // 后续在 probeAllShells 里标记
  };
}

/**
 * 探测所有候选 shell（并行）+ 标记 preferred
 */
export async function probeAllShells(platform: NodeJS.Platform): Promise<ShellInfo[]> {
  const candidates = SHELL_CANDIDATES[platform] || ['bash', 'sh'];

  const probes = candidates.map(name => ({
    name,
    fn: () => probeShell(name, platform),
  }));

  const results = await parallelProbe(probes);

  const shells: ShellInfo[] = results.map(r => {
    if (r.ok) return r.value;
    // 不应该走到这里（probeShell 内部已经捕获错误），但兜底
    return {
      name: r.name as ShellName,
      path: null,
      version: null,
      default_encoding: SHELL_DEFAULT_ENCODING[r.name as ShellName]?.encoding || 'UTF-8',
      needs_encoding_fix: SHELL_DEFAULT_ENCODING[r.name as ShellName]?.needsFix || false,
      available: false,
      preferred: false,
      note: `探测异常: ${r.error}`,
    };
  });

  // 按候选顺序找第一个可用的，标记为 preferred
  for (const name of candidates) {
    const found = shells.find(s => s.name === name && s.available);
    if (found) {
      found.preferred = true;
      break;
    }
  }

  return shells;
}

function getNotAvailableNote(name: ShellName, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    if (name === 'pwsh') return 'PowerShell 7+ 未安装。建议从 https://aka.ms/powershell 安装以获得 UTF-8 默认编码。';
    if (name === 'bash') return 'Windows 上未安装 bash（git bash / WSL 都没装）。';
  }
  return `${name} 未在 PATH 中找到`;
}
