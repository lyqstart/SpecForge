/**
 * sf_safe_bash - 安全的 shell 命令执行入口
 *
 * 所有需要执行 shell 命令的场景必须使用本工具。
 *
 * 特性：
 * - 自动应用 Windows/PowerShell 兼容规则、UTF-8 编码注入
 * - 危险命令黑名单（rm -rf /、format、curl|sh 等）
 * - 工具替代建议（cat/find/grep/mkdir 拦截，引导用专用工具）
 * - OS 级 hard timeout 保护（必返回，agent 不死等）
 * - 结构化 JSON 返回（含 hint 字段引导排错）
 * - 审计日志（写到 ~/.specforge/logs/shell-history.jsonl）
 *
 * 详细规范见 docs/engineering-lessons/universal/shell-command-execution.md
 */

import { tool } from "@opencode-ai/plugin"
import { safeBashExecute } from "./lib/sf_safe_bash_core"

export default tool({
  description: `执行 shell 命令的安全入口。所有需要运行命令行的场景必须使用本工具，OpenCode 内置的 bash 工具已禁用。

工具会自动：
- 选择正确的 shell（Windows 优先 pwsh > powershell > cmd；Unix 优先 bash > zsh）
- 注入 UTF-8 编码设置（解决 Windows 中文乱码）
- 拦截危险命令（rm -rf /、sudo、curl|sh 等）
- 拒绝 cd 命令（请用 cwd 参数）
- 拒绝 cat/find/grep/mkdir（请用 read_file/file_search/grep_search/fs_write）
- 强制 OS 级 timeout（默认 60s，超时 SIGKILL 必返回）
- 截断超长输出到 4KB

返回 JSON 含字段：success / exitCode / stdout / stderr / durationMs / hint。
失败时看 hint 决定下一步；rejected=true 时按 suggestion 调整后重试。`,
  args: {
    command: tool.schema
      .string()
      .describe("要执行的 shell 命令。禁止包含 cd、cat、find、grep、mkdir、heredoc 等（工具会拦截并给出替代建议）。"),
    cwd: tool.schema
      .string()
      .optional()
      .describe("工作目录。绝对路径或相对仓库根的路径。支持 ~ 解析为 home。不传则用当前目录。"),
    timeoutMs: tool.schema
      .number()
      .optional()
      .describe("命令超时（毫秒），默认 60000，最小 1000，最大 600000。超时会 SIGKILL 子进程。"),
    env: tool.schema
      .record(tool.schema.string(), tool.schema.string())
      .optional()
      .describe("额外环境变量（合并到当前 env）。"),
    stdin: tool.schema
      .string()
      .optional()
      .describe("写入子进程 stdin 的内容。多数命令不需要。"),
    outputLimit: tool.schema
      .number()
      .optional()
      .describe("stdout/stderr 截断长度（字符），默认 4096。超出部分丢弃但 truncated 字段为 true。"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await safeBashExecute(
      {
        command: args.command,
        cwd: args.cwd,
        timeoutMs: args.timeoutMs,
        env: args.env as Record<string, string> | undefined,
        stdin: args.stdin,
        outputLimit: args.outputLimit,
      },
      baseDir
    )
    return JSON.stringify(result, null, 2)
  },
})
