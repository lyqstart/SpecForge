/**
 * 基于探测结果生成 shell_rules
 *
 * shell_rules 是工具层（sf_safe_bash）直接拿来执行命令时用的"决策表"。
 * 这里把分散的探测结果归纳成可执行的规则。
 */

import type { ShellInfo, ShellName, ShellRules } from './types';

/**
 * 基于探测到的 shells 生成 shell_rules
 *
 * @param shells 探测结果列表
 * @param platform OS 平台
 * @param ciMode 是否在 CI 环境
 */
export function buildShellRules(
  shells: ShellInfo[],
  platform: NodeJS.Platform,
  ciMode: boolean
): ShellRules {
  const preferred = shells.find(s => s.preferred && s.available);
  const preferredShell: ShellName | null = preferred?.name ?? null;

  // 命令行最大长度（按平台 + shell）
  const maxCommandLength = getMaxCommandLength(platform, preferredShell);

  // 编码注入命令（按 preferred shell）
  const encodingSetupCommand = buildEncodingSetupCommand(preferredShell);

  // 路径分隔符
  const pathSeparator: '\\' | '/' = platform === 'win32' ? '\\' : '/';

  // shell 是否原生支持 glob 展开
  // - cmd 不支持
  // - powershell / pwsh 支持但行为略不同
  // - bash / zsh / sh 都支持
  const supportsGlobInShell = !(preferredShell === 'cmd');

  return {
    preferred_shell: preferredShell,
    max_command_length: maxCommandLength,
    encoding_setup_command: encodingSetupCommand,
    path_separator: pathSeparator,
    path_quote_required_for_spaces: true, // 跨平台一律加引号最安全
    supports_glob_in_shell: supportsGlobInShell,
    ci_mode: ciMode,
  };
}

/**
 * 获取该 shell 的命令行最大长度
 *
 * Windows:
 *   - cmd: 8191 字符
 *   - powershell.exe: 32767 字符
 *   - pwsh: 32767 字符
 * macOS / Linux:
 *   - bash / zsh / sh: ARG_MAX (典型 256KB)
 */
function getMaxCommandLength(platform: NodeJS.Platform, shell: ShellName | null): number {
  if (platform === 'win32') {
    if (shell === 'cmd') return 8191;
    return 32767; // pwsh / powershell
  }
  // POSIX 平台保守值（实际通常 256KB+）
  return 131072;
}

/**
 * 构造编码注入命令
 *
 * 这段命令会被 sf_safe_bash 在每次 spawn 时**前置**注入到子进程命令的开头，
 * 强制把输出编码改成 UTF-8。
 *
 * 注意：pwsh 在交互式终端中默认 UTF-8，但**被 Node spawn 调用时**（无控制台），
 * `$OutputEncoding` 默认是 ASCIIEncoding，必须显式设置才能正确输出非 ASCII 字符。
 * 这是 pwsh 7+ 在子进程上下文中的实际行为，已通过实测验证。
 *
 * - pwsh: 注入 $OutputEncoding + [Console]::OutputEncoding
 * - powershell: 注入相同设置 + chcp 65001
 * - cmd: chcp 65001
 * - bash / zsh: 通过 env LC_ALL/LANG 已经在 executor 层设置，这里返回空
 */
function buildEncodingSetupCommand(shell: ShellName | null): string {
  switch (shell) {
    case "pwsh":
      // pwsh 在 spawn 子进程时默认 OutputEncoding 不是 UTF-8，必须显式注入
      return [
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
      ].join("; ");

    case "powershell":
      return [
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
        'chcp 65001 > $null',
      ].join("; ");

    case "cmd":
      return "chcp 65001 > nul";

    case "bash":
    case "zsh":
    case "sh":
    case "dash":
    case "fish":
      // POSIX shell 通过 env LC_ALL/LANG 已在 executor 层设置
      return "";

    default:
      return "";
  }
}
