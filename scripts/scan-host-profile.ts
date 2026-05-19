#!/usr/bin/env bun
/**
 * Host Profile 扫描器 CLI
 *
 * 用法：
 *   bun run scripts/scan-host-profile.ts            # 增量扫描（30 天缓存）
 *   bun run scripts/scan-host-profile.ts --force    # 强制重新扫描
 *   bun run scripts/scan-host-profile.ts --show     # 只显示当前档案，不扫描
 *   bun run scripts/scan-host-profile.ts --check    # CI 用：扫描后输出 JSON 摘要
 *
 * 输出：
 *   ~/.specforge/host-profile.json
 *
 * 详细规范见 docs/engineering-lessons/universal/host-environment-detection.md
 */

import { scanHostProfile, loadHostProfile, getHostProfilePath } from './lib/host-profile/scanner';
import type { HostProfile } from './lib/host-profile/types';

interface CliArgs {
  force: boolean;
  show: boolean;
  check: boolean;
  help: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    force: false,
    show: false,
    check: false,
    help: false,
    quiet: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '--force':
      case '-f':
        args.force = true;
        break;
      case '--show':
      case '-s':
        args.show = true;
        break;
      case '--check':
        args.check = true;
        break;
      case '--quiet':
      case '-q':
        args.quiet = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`未知参数: ${arg}`);
          console.error(`用 --help 查看用法。`);
          process.exit(2);
        }
    }
  }

  return args;
}

function showHelp(): void {
  console.log(`
Host Profile 扫描器 — 探测宿主机环境并写入 ~/.specforge/host-profile.json

用法:
  bun run scripts/scan-host-profile.ts [选项]

选项:
  --force, -f       强制重新扫描，忽略 30 天缓存
  --show, -s        显示当前档案（不扫描）
  --check           CI 模式：扫描后输出 JSON 摘要到 stdout
  --quiet, -q       静默模式（不打印进度）
  --help, -h        显示本帮助

档案位置:
  ${getHostProfilePath()}

退出码:
  0 = 成功（已扫描或使用缓存）
  1 = 扫描失败
  2 = 参数错误
`);
}

function showProfile(profile: HostProfile): void {
  const availableShells = profile.shells.filter(s => s.available);
  const availableTools = Object.entries(profile.tools).filter(([, t]) => t.available);

  console.log(``);
  console.log(`Host Profile (${profile.scanned_at})`);
  console.log(`──────────────────────────────────────────────`);
  console.log(`主机名:   ${profile.hostname}`);
  console.log(`操作系统: ${profile.os.version} (${profile.os.platform} ${profile.os.arch})`);
  console.log(`内存:     ${profile.os.totalmem_gb} GB`);
  console.log(`CPU:      ${profile.os.cpu_count} 核`);
  console.log(``);
  console.log(`Locale:`);
  console.log(`  系统语言: ${profile.locale.system_lang}`);
  console.log(`  时区:     ${profile.locale.timezone} (UTC${profile.locale.tz_offset_minutes >= 0 ? '+' : ''}${profile.locale.tz_offset_minutes / 60})`);
  if (profile.locale.console_codepage) {
    console.log(`  控制台代码页: ${profile.locale.console_codepage}`);
  }
  console.log(``);

  const preferred = profile.shells.find(s => s.preferred);
  console.log(`Shell:`);
  console.log(`  首选: ${preferred ? `${preferred.name} ${preferred.version || '(未知版本)'}` : '(无可用)'}`);
  console.log(`  探测到 ${availableShells.length}/${profile.shells.length} 个可用:`);
  for (const shell of profile.shells) {
    const mark = shell.preferred ? '★' : shell.available ? '✓' : '✗';
    const ver = shell.version || '?';
    const note = shell.note ? ` — ${shell.note}` : '';
    console.log(`    ${mark} ${shell.name.padEnd(12)} ${ver}${note}`);
  }
  console.log(``);

  console.log(`Tools (${availableTools.length}/${Object.keys(profile.tools).length} 可用):`);
  for (const [name, info] of Object.entries(profile.tools)) {
    const mark = info.available ? '✓' : '✗';
    const ver = info.version || '?';
    if (info.available) {
      console.log(`  ${mark} ${name.padEnd(12)} ${ver}`);
    }
  }
  const unavailable = Object.entries(profile.tools).filter(([, t]) => !t.available);
  if (unavailable.length > 0) {
    console.log(`  未安装: ${unavailable.map(([n]) => n).join(', ')}`);
  }
  console.log(``);

  console.log(`Shell Rules:`);
  console.log(`  preferred_shell:        ${profile.shell_rules.preferred_shell || '(无)'}`);
  console.log(`  max_command_length:     ${profile.shell_rules.max_command_length}`);
  console.log(`  path_separator:         ${profile.shell_rules.path_separator}`);
  console.log(`  ci_mode:                ${profile.shell_rules.ci_mode}`);
  if (profile.shell_rules.encoding_setup_command) {
    console.log(`  encoding_setup_command: ${profile.shell_rules.encoding_setup_command.substring(0, 80)}${profile.shell_rules.encoding_setup_command.length > 80 ? '...' : ''}`);
  }
  console.log(``);

  console.log(`SpecForge:`);
  console.log(`  install_root: ${profile.specforge.install_root}`);
  console.log(`  logs_dir:     ${profile.specforge.logs_dir}`);
  console.log(``);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // ── --show 分支：只显示，不扫描 ──
  if (args.show) {
    const profile = await loadHostProfile();
    if (!profile) {
      console.error(`没有找到档案文件：${getHostProfilePath()}`);
      console.error(`运行 'bun run scripts/scan-host-profile.ts' 创建。`);
      process.exit(1);
    }
    showProfile(profile);
    return;
  }

  // ── 扫描分支 ──
  try {
    const result = await scanHostProfile({
      force: args.force,
      verbose: !args.quiet && !args.check,
    });

    if (args.check) {
      // CI 模式：输出 JSON 摘要到 stdout
      const summary = {
        success: true,
        scanned: result.scanned,
        durationMs: result.durationMs,
        scanned_at: result.profile.scanned_at,
        hostname: result.profile.hostname,
        platform: result.profile.os.platform,
        preferred_shell: result.profile.shell_rules.preferred_shell,
        ci_mode: result.profile.shell_rules.ci_mode,
        available_shells: result.profile.shells.filter(s => s.available).length,
        available_tools: Object.values(result.profile.tools).filter(t => t.available).length,
      };
      console.log(JSON.stringify(summary, null, 2));
    } else if (!args.quiet) {
      // 普通模式：显示档案
      showProfile(result.profile);
      if (result.scanned) {
        console.error(`扫描完成，耗时 ${result.durationMs}ms`);
      } else {
        console.error(`使用缓存档案`);
      }
    }
  } catch (err) {
    console.error(`扫描失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`致命错误: ${err}`);
  process.exit(1);
});
