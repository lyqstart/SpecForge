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
import type { SafeBashArgs, SafeBashResult } from "./sf_safe_bash_types"
import { applyRules } from "./sf_safe_bash_rules"
import { executeCommand, resolveCwd } from "./sf_safe_bash_executor"

// ── Host Profile 内联类型和加载逻辑 ──
// 不再 import 仓库外文件，改为运行时读取 JSON 文件

/** Host Profile 最小类型（只取 sf_safe_bash 需要的字段） */
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

/** 加载 host-profile.json（只读，不触发扫描） */
async function loadHostProfile(): Promise<HostProfile | null> {
  const profilePath = path.join(os.homedir(), ".specforge", "host-profile.json")
  try {
    const content = await fs.readFile(profilePath, "utf-8")
    const data = JSON.parse(content)
    if (data?.schema_version && data?.shells && data?.shell_rules) return data as HostProfile
    return null
  } catch {
    return null
  }
}

/** 构造一个最小的默认 profile（当 host-profile.json 不存在时） */
function buildDefaultProfile(): HostProfile {
  const platform = os.platform()
  const isWin = platform === "win32"
  return {
    schema_version: "1.0",
    hostname: os.hostname(),
    os: { platform, release: os.release(), version: `${platform} ${os.release()}`, arch: os.arch(), totalmem_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024), cpu_count: os.cpus().length },
    locale: { system_lang: "en-US", console_codepage: null, encoding: "UTF-8", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", tz_offset_minutes: -new Date().getTimezoneOffset(), datetime_now: new Date().toISOString() },
    shells: isWin
      ? [{ name: "pwsh", path: null, version: null, default_encoding: "UTF-8", needs_encoding_fix: false, available: false, preferred: true }]
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
    specforge: { install_root: path.join(os.homedir(), ".specforge"), logs_dir: path.join(os.homedir(), ".specforge", "logs") },
  }
}

/** 默认超时（60 秒） */
const DEFAULT_TIMEOUT_MS = 60_000
/** 默认输出截断（4 KB） */
const DEFAULT_OUTPUT_LIMIT = 4096
/** 最小允许的超时（避免误传 0） */
const MIN_TIMEOUT_MS = 1000
/** 最大允许的超时（10 分钟，避免 agent 设过大值） */
const MAX_TIMEOUT_MS = 10 * 60 * 1000

/**
 * 主入口
 *
 * @param args 用户输入参数
 * @param baseDir 调用方所在目录（context.directory），用作 cwd 默认和 fallback
 */
export async function safeBashExecute(
  args: SafeBashArgs,
  baseDir: string
): Promise<SafeBashResult> {
  // ── Step 1: 加载 host-profile ──
  let profile = await loadHostProfile()
  if (!profile) {
    // 没有 host-profile.json，用内置默认值（不触发扫描，避免阻塞）
    profile = buildDefaultProfile()
  }

  // ── Step 2: 规则引擎 ──
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

  // 命令可能被规则重写（如自动包装 Start-Job）
  let effectiveCommand = args.command
  let rewriteHint: string | undefined
  let rewriteRule: string | undefined
  if (ruleResult.kind === "rewrite") {
    effectiveCommand = ruleResult.rewrite.rewrittenCommand
    rewriteHint = ruleResult.rewrite.explanation
    rewriteRule = ruleResult.rewrite.rule
    // 重写规则可能调整了 timeout
    if (ruleResult.rewrite.adjustedTimeoutMs && !args.timeoutMs) {
      args = { ...args, timeoutMs: ruleResult.rewrite.adjustedTimeoutMs }
    }
  }

  // ── Step 3: 解析 cwd ──
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

  // ── Step 4: 规范超时 ──
  let timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (timeoutMs < MIN_TIMEOUT_MS) timeoutMs = MIN_TIMEOUT_MS
  if (timeoutMs > MAX_TIMEOUT_MS) timeoutMs = MAX_TIMEOUT_MS

  const outputLimit = args.outputLimit ?? DEFAULT_OUTPUT_LIMIT

  // ── Step 5: 执行 ──
  const result = await executeCommand({
    command: effectiveCommand,
    cwd: resolvedCwd,
    timeoutMs,
    env: args.env,
    stdin: args.stdin,
    outputLimit,
    profile,
  })

  // 如果命令被重写，把信息附给 agent
  if (rewriteHint) {
    result.hint = result.hint
      ? `${rewriteHint}\n\n${result.hint}`
      : rewriteHint
    result.originalCommand = args.command
    // 不覆盖 result.rule（rule 字段仅在 rejected 时有意义）
  }

  // ── Step 6: 异步写审计日志（不阻塞主流程） ──
  writeAuditLog(args, result, profile).catch(err => {
    // 日志失败仅打 warning，不影响主流程
    console.warn(`[sf_safe_bash] 审计日志写入失败：${err.message}`)
  })

  return result
}

/**
 * 异步写审计日志
 *
 * 路径：~/.specforge/logs/shell-history.jsonl
 * 每行一个 JSON 对象，append-only。
 */
async function writeAuditLog(
  args: SafeBashArgs,
  result: SafeBashResult,
  profile: HostProfile
): Promise<void> {
  const logDir = profile.specforge.logs_dir
  const logFile = path.join(logDir, "shell-history.jsonl")

  // 确保目录存在
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
  }

  await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf-8")
}
