/**
 * sf_safe_bash 执行器
 *
 * 负责把规则审过的命令真正 spawn 出去，带 OS 级 hard timeout、
 * UTF-8 编码注入、stdout/stderr 分离、截断保护。
 *
 * 设计原则（来自 lessons-injected）：
 * - A1: Promise.race 超时 timer 必须清理
 * - C1: 内层 timeout 比外层短，必返回结构化结果
 * - X3: hard timeout 是兜底，必返回让 agent 不死等
 */

import { spawn } from "node:child_process"
import * as path from "node:path"
import { existsSync } from "node:fs"
import type { SafeBashResult } from "./sf_safe_bash_types"
import type { HostProfile } from "./sf_safe_bash_core"

/** 默认输出截断（4 KB） */
const DEFAULT_OUTPUT_LIMIT = 4096

export interface ExecuteOptions {
  command: string
  cwd: string
  timeoutMs: number
  env?: Record<string, string>
  stdin?: string
  outputLimit: number
  profile: HostProfile
}

/**
 * 真正执行命令
 *
 * 流程：
 *   1. 选择 shell（根据 host_profile.shell_rules.preferred_shell）
 *   2. 构造 shell 命令（含编码注入）
 *   3. spawn 子进程
 *   4. 双层超时（race：进程退出 vs SIGKILL）
 *   5. 截断 stdout/stderr
 *   6. 返回结构化结果
 */
export async function executeCommand(opts: ExecuteOptions): Promise<SafeBashResult> {
  const startTime = Date.now()
  const platform = opts.profile.os.platform
  const preferredShell = opts.profile.shell_rules.preferred_shell

  // ── Step 1: 选择 shell + 构造调用参数 ──
  const { shell, shellPath, shellArgs, finalCommand } = buildShellInvocation(
    opts.command,
    opts.profile,
    platform as NodeJS.Platform
  )

  if (!shellPath) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      command: opts.command,
      cwd: opts.cwd,
      shell: null,
      rejected: true,
      timeout: false,
      rule: "no-shell-available",
      suggestion: `当前机器未探测到可用 shell。请运行 'bun run scripts/scan-host-profile.ts --force' 重新扫描，或手动安装 ${platform === "win32" ? "pwsh / powershell" : "bash / zsh"}。`,
    }
  }

  // ── Step 2: 准备环境变量 ──
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
  }

  // POSIX 系统额外设置 LC_ALL / LANG（如果用户没明确传）
  if (platform !== "win32") {
    if (!env.LC_ALL && !opts.env?.LC_ALL) env.LC_ALL = "C.UTF-8"
    if (!env.LANG && !opts.env?.LANG) env.LANG = "C.UTF-8"
  }

  // ── Step 3: spawn + 超时 race ──
  return new Promise<SafeBashResult>(resolve => {
    let stdout = ""
    let stderr = ""
    let stdoutBytes = 0
    let stderrBytes = 0
    let truncatedStdout = false
    let truncatedStderr = false
    let timer: NodeJS.Timeout | null = null
    let resolved = false
    let timedOut = false

    const finalize = () => {
      if (resolved) return
      resolved = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      const exitCode = (child as any)._exitCode ?? null
      const durationMs = Date.now() - startTime
      const success = !timedOut && exitCode === 0

      const result: SafeBashResult = {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        command: finalCommand,
        cwd: opts.cwd,
        shell,
        rejected: false,
        timeout: timedOut,
      }

      if (truncatedStdout || truncatedStderr) {
        result.truncated = { stdout: truncatedStdout, stderr: truncatedStderr }
      }

      if (timedOut) {
        result.timeoutMs = opts.timeoutMs
        result.hint = `命令在 ${opts.timeoutMs}ms 内未完成已被 SIGKILL 强制终止。可能原因：(1) 异步资源泄漏导致进程不退出 (2) 死锁 (3) 网络请求挂起。建议：检查测试代码资源管理；如果是 bun test，工具应该已经自动包装 Start-Job。`
      } else if (!success) {
        result.hint = buildFailureHint(exitCode, stderr)
      }

      resolve(result)
    }

    let child: ReturnType<typeof spawn> | null = null
    try {
      child = spawn(shellPath, shellArgs, {
        cwd: opts.cwd,
        env,
        windowsHide: true,
        shell: false,
        // 显式分离 stdio，便于精细控制
        stdio: opts.stdin !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      })
    } catch (err) {
      finalize()
      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: Date.now() - startTime,
        command: finalCommand,
        cwd: opts.cwd,
        shell,
        rejected: true,
        timeout: false,
        rule: "spawn-error",
        suggestion: `spawn ${shellPath} 失败：${(err as Error).message}。这通常是 host-profile 过期，请运行 'bun run scripts/scan-host-profile.ts --force'。`,
      })
      return
    }

    // 写入 stdin（如有）
    if (opts.stdin !== undefined && child.stdin) {
      child.stdin.write(opts.stdin)
      child.stdin.end()
    }

    // 收集 stdout（按字符串字节计数 + 截断）
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString("utf-8")
      if (stdoutBytes + chunk.length <= opts.outputLimit) {
        stdout += chunk
        stdoutBytes += chunk.length
      } else if (!truncatedStdout) {
        const remaining = opts.outputLimit - stdoutBytes
        if (remaining > 0) {
          stdout += chunk.slice(0, remaining)
        }
        truncatedStdout = true
      }
    })

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString("utf-8")
      if (stderrBytes + chunk.length <= opts.outputLimit) {
        stderr += chunk
        stderrBytes += chunk.length
      } else if (!truncatedStderr) {
        const remaining = opts.outputLimit - stderrBytes
        if (remaining > 0) {
          stderr += chunk.slice(0, remaining)
        }
        truncatedStderr = true
      }
    })

    child.on("error", err => {
      // spawn 异步错误（如 ENOENT）
      ;(child as any)._exitCode = null
      stderr += `\n[spawn error] ${err.message}`
      finalize()
    })

    child.on("exit", code => {
      ;(child as any)._exitCode = code
      finalize()
    })

    // 设置 OS 级 hard timeout
    timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        // 进程可能已退出，忽略
      }
      timedOut = true
      ;(child as any)._exitCode = null
      // 给一点时间让进程真死，然后 finalize
      setTimeout(finalize, 100)
    }, opts.timeoutMs)
  })
}

/**
 * 根据 host profile 选择 shell + 构造调用参数
 */
function buildShellInvocation(
  command: string,
  profile: HostProfile,
  platform: NodeJS.Platform
): {
  shell: string | null
  shellPath: string | null
  shellArgs: string[]
  finalCommand: string
} {
  const preferredShell = profile.shell_rules.preferred_shell
  if (!preferredShell) {
    return { shell: null, shellPath: null, shellArgs: [], finalCommand: command }
  }

  const shellInfo = profile.shells.find(s => s.name === preferredShell && s.available)
  if (!shellInfo || !shellInfo.path) {
    return { shell: null, shellPath: null, shellArgs: [], finalCommand: command }
  }

  // 编码设置前缀（按需注入）
  const encodingPrefix = profile.shell_rules.encoding_setup_command
  const finalCommand = encodingPrefix
    ? `${encodingPrefix}; ${command}`
    : command

  let shellArgs: string[]
  switch (preferredShell) {
    case "pwsh":
    case "powershell":
      shellArgs = ["-NoProfile", "-NonInteractive", "-Command", finalCommand]
      break
    case "cmd":
      shellArgs = ["/c", finalCommand]
      break
    case "bash":
    case "zsh":
    case "sh":
    case "dash":
    case "fish":
      shellArgs = ["-c", finalCommand]
      break
    default:
      shellArgs = ["-c", finalCommand]
  }

  return {
    shell: preferredShell,
    shellPath: shellInfo.path,
    shellArgs,
    finalCommand,
  }
}

/**
 * 根据 exitCode 和 stderr 构造排错提示
 */
function buildFailureHint(exitCode: number | null, stderr: string): string | undefined {
  if (exitCode === null) return undefined

  switch (exitCode) {
    case 1:
      return "命令以退出码 1 失败。看 stderr 中的错误信息决定下一步。"
    case 2:
      return "退出码 2 通常代表参数误用。检查命令语法或工具的 --help。"
    case 124:
      return "退出码 124 = Linux timeout 命令触发。原命令运行时间超过限制。"
    case 126:
    case 127:
      return `退出码 ${exitCode} = 命令找不到。检查工具是否在 PATH 中（用 'bun run scripts/scan-host-profile.ts --show' 看可用工具）。`
    case 130:
      return "退出码 130 = SIGINT (Ctrl+C 中断)。"
    case 137:
      return "退出码 137 = SIGKILL (被强制终止)。可能是内存超限或外层超时触发。"
    default:
      if (stderr.toLowerCase().includes("not recognized") || stderr.toLowerCase().includes("not found")) {
        return `命令找不到。检查 host-profile 中的可用工具列表。`
      }
      if (stderr.toLowerCase().includes("permission denied")) {
        return "权限不足。检查文件权限或考虑用 --install-root 指定不同位置。"
      }
      return undefined
  }
}

/**
 * 解析 cwd
 *
 * - 绝对路径直接用
 * - 相对路径相对于 baseDir（通常是仓库根）
 * - `~` 替换为 home
 * - 目录不存在返回 null（调用方处理为 reject）
 */
export function resolveCwd(
  cwd: string | undefined,
  baseDir: string,
  homeDir: string
): { cwd: string | null; reason?: string } {
  let resolved: string

  if (!cwd) {
    resolved = baseDir
  } else if (cwd.startsWith("~")) {
    resolved = path.join(homeDir, cwd.slice(1).replace(/^[/\\]/, ""))
  } else if (path.isAbsolute(cwd)) {
    resolved = cwd
  } else {
    resolved = path.resolve(baseDir, cwd)
  }

  // 验证目录存在
  if (!existsSync(resolved)) {
    return {
      cwd: null,
      reason: `工作目录不存在：${resolved}（原始输入：${cwd ?? "(默认)"}）`,
    }
  }

  return { cwd: resolved }
}

