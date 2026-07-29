/**
 * sf_safe_bash 核心入口
 *
 * 流程：
 *   1. 加载 host-profile（必要时触发首次扫描）
 *   2. 规则引擎检查命令（拒绝危险/违规命令）
 *   3. 解析 cwd
 *   4. 调用 executor 执行
 *   5. 写审计日志（异步）
 *   6. 返回结构化结果
 *
 * 详细规范见 docs/engineering-lessons/universal/shell-command-execution.md
 */
import * as os from "node:os"
import * as path from "node:path"
import * as fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { SPEC_DIR_NAME } from "@specforge/types/directory-layout"
import {
  resolveSpecForgeUserPath,
  resolveSpecForgeUserRoot,
} from '@specforge/types/user-level-paths';
import type { SafeBashArgs, SafeBashResult } from "./sf_safe_bash_types"
import { applyRules } from "./sf_safe_bash_rules"
import { executeCommand, resolveCwd } from "./sf_safe_bash_executor"
import { guardBashCommand } from "./bash-guard"
import type { WritePolicyRule } from "./write-guard-v11"

const DEFAULT_BASH_WRITE_POLICY: WritePolicyRule = {
  id: 'sf-safe-bash-default',
  description: 'Default bash write policy — allows all (enforcement is at write-guard level)',
  check: () => null,
}

interface HostProfile {
  schema_version: string
  hostname: string
  os: { platform: string; release: string; version: string; arch: string; totalmem_gb: number; cpu_count: number }
  locale: { system_lang: string; console_codepage: number | null; encoding: string; timezone: string; tz_offset_minutes: number; datetime_now: string }
  shells: Array<{ name: string; path: string | null; version: string | null; default_encoding: string; needs_encoding_fix: boolean; available: boolean; preferred: boolean; note?: string }>
  tools: Record<string, { available: boolean; version: string | null; path: string | null; note?: string }>
  shell_rules: { preferred_shell: string | null; max_command_length: number; encoding_setup_command: string; path_separator: string; path_quote_required_for_spaces: boolean; supports_glob_in_shell: boolean; ci_mode: boolean }
  user: { username: string; home_dir: string; shell_history_file: string | null }
  specforge: { install_root: string; logs_dir: string }
}
export type { HostProfile }

/** 加载当前用户级 host-profile.json（只读，不触发扫描） */
async function loadHostProfile(): Promise<HostProfile | null> {
  const profilePath = resolveSpecForgeUserPath("host-profile.json")
  try {
    const content = await fs.readFile(profilePath, "utf-8")
    const data = JSON.parse(content)
    if (data?.schema_version && data?.shells && data?.shell_rules) return data as HostProfile
    return null
  } catch {
    return null
  }
}

function buildDefaultProfile(): HostProfile {
  const platform = os.platform()
  const isWin = platform === "win32"
  return {
    schema_version: "1.0",
    hostname: os.hostname(),
    os: { platform, release: os.release(), version: `${platform} ${os.release()}`, arch: os.arch(), totalmem_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024), cpu_count: os.cpus().length },
    locale: { system_lang: "en-US", console_codepage: null, encoding: "UTF-8", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", tz_offset_minutes: -new Date().getTimezoneOffset(), datetime_now: new Date().toISOString() },
    shells: isWin
      ? [
          { name: "pwsh", path: "pwsh.exe", version: null, default_encoding: "UTF-8", needs_encoding_fix: true, available: true, preferred: true },
          { name: "powershell", path: "powershell.exe", version: null, default_encoding: "UTF-8", needs_encoding_fix: true, available: true, preferred: false },
          { name: "cmd", path: "cmd.exe", version: null, default_encoding: "UTF-8", needs_encoding_fix: true, available: true, preferred: false },
        ]
      : [{ name: "bash", path: "/bin/bash", version: null, default_encoding: "UTF-8", needs_encoding_fix: false, available: true, preferred: true }],
    tools: {},
    shell_rules: {
      preferred_shell: isWin ? "pwsh" : "bash",
      max_command_length: isWin ? 32767 : 131072,
      encoding_setup_command: isWin ? "$OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8" : "",
      path_separator: isWin ? "\\" : "/",
      path_quote_required_for_spaces: true,
      supports_glob_in_shell: !isWin,
      ci_mode: false,
    },
    user: { username: os.userInfo().username, home_dir: os.homedir(), shell_history_file: null },
    specforge: {
      install_root: resolveSpecForgeUserRoot(),
      logs_dir: resolveSpecForgeUserPath("logs"),
    },
  }
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_OUTPUT_LIMIT = 4096
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 10 * 60 * 1000

export async function safeBashExecute(
  args: SafeBashArgs,
  baseDir: string
): Promise<SafeBashResult> {
  let profile = await loadHostProfile()
  if (!profile) {
    profile = buildDefaultProfile()
  }

  const ruleResult = applyRules(args.command, profile)
  if (ruleResult.kind === "reject") {
    const r = ruleResult.rejection
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      command: args.command,
      originalCommand: args.command,
      cwd: null,
      shell: null,
      rejected: true,
      timeout: false,
      rule: r.rule,
      suggestion: r.suggestion,
      hint: r.hint,
    }
  }

  let effectiveCommand = args.command
  let rewriteHint: string | undefined
  let rewriteRule: string | undefined
  if (ruleResult.kind === "rewrite") {
    effectiveCommand = ruleResult.rewrite.rewrittenCommand
    rewriteHint = ruleResult.rewrite.explanation
    rewriteRule = ruleResult.rewrite.rule
    if (ruleResult.rewrite.adjustedTimeoutMs && !args.timeoutMs) {
      args = { ...args, timeoutMs: ruleResult.rewrite.adjustedTimeoutMs }
    }
  }

  const bashGuardResult = guardBashCommand(
    effectiveCommand,
    DEFAULT_BASH_WRITE_POLICY,
    { callerRole: args.callerRole },
  )
  if (!bashGuardResult.allowed) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      command: args.command,
      originalCommand: args.command,
      cwd: null,
      shell: null,
      rejected: true,
      timeout: false,
      rule: "bash-guard",
      suggestion: bashGuardResult.reason,
      hint: `callerRole: ${args.callerRole ?? 'agent'}`,
    }
  }

  const homeDir = profile.user.home_dir
  const { cwd: resolvedCwd, reason: cwdReason } = resolveCwd(args.cwd, baseDir, homeDir)
  if (!resolvedCwd) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      command: args.command,
      cwd: null,
      shell: null,
      rejected: true,
      timeout: false,
      rule: "invalid-cwd",
      suggestion: cwdReason || "cwd 无效",
    }
  }

  let timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (timeoutMs < MIN_TIMEOUT_MS) timeoutMs = MIN_TIMEOUT_MS
  if (timeoutMs > MAX_TIMEOUT_MS) timeoutMs = MAX_TIMEOUT_MS

  const outputLimit = args.outputLimit ?? DEFAULT_OUTPUT_LIMIT

  const result = await executeCommand({
    command: effectiveCommand,
    cwd: resolvedCwd,
    timeoutMs,
    env: args.env,
    stdin: args.stdin,
    outputLimit,
    profile,
  })

  if (rewriteHint) {
    result.hint = result.hint
      ? `${rewriteHint}\n\n${result.hint}`
      : rewriteHint
    result.originalCommand = args.command
  }

  writeAuditLog(args, result, profile, baseDir).catch(err => {
    console.warn(`[sf_safe_bash] 审计日志写入失败：${err.message}`)
  })

  return result
}

async function writeAuditLog(
  args: SafeBashArgs,
  result: SafeBashResult,
  profile: HostProfile,
  baseDir: string
): Promise<void> {
  const logFile = path.join(baseDir, SPEC_DIR_NAME, 'runtime', 'logs', 'shell-history.jsonl')
  const logDir = path.dirname(logFile)

  await fs.mkdir(logDir, { recursive: true })
  const entry = {
    schema_version: "1.0",
    ts: new Date().toISOString(),
    command: args.command,
    cwd: result.cwd,
    shell: result.shell,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    rejected: result.rejected,
    rule: result.rule || null,
    timeout: result.timeout,
    success: result.success,
    stdout_size: result.stdout.length,
    stderr_size: result.stderr.length,
    truncated_stdout: result.truncated?.stdout ?? false,
    truncated_stderr: result.truncated?.stderr ?? false,
    callerRole: args.callerRole || null,
  }
  await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf-8")
}
