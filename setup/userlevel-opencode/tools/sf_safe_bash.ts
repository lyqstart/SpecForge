import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: `受控只读操作入口（SPS §9.2 / D18）。在 Runtime 内部读取，不启动 Shell 或子进程。
支持 pwd/Get-Location、echo/Write-Output 字面文字、cat/type/Get-Content 文件、ls/dir/Get-ChildItem 目录、Test-Path、Get-FileHash/sha256sum，以及 sleep/Start-Sleep 的内部等待。
只接受单条完整的字面参数；不展开变量、管道、重定向或复合语句。读取限制在项目普通文件，治理文件请使用受控 owner。
当前脚本、解释器、构建、测试、任意外部可执行文件均不可用，env/stdin 参数也拒绝。拒绝不是测试通过，不得改用其他 Shell、辅助脚本或原生 bash 重试。
返回 success / exitCode / stdout / stderr / rejected / timeout；shell 始终为 null。`,
  args: {
    command: tool.schema
      .string()
      .describe("单条受控只读操作；脚本、构建、测试及复合命令均拒绝。"),
    cwd: tool.schema
      .string()
      .optional()
      .describe("工作目录。绝对路径或相对仓库根的路径。必须位于项目内；不支持 ~ 或外部目录。不传则用当前目录。"),
    timeoutMs: tool.schema
      .number()
      .optional()
      .describe("命令超时（毫秒），默认 60000，最小 1，最大 600000。仅限制内部只读操作，不启动子进程。"),
    env: tool.schema
      .record(tool.schema.string(), tool.schema.string())
      .optional()
      .describe("兼容字段；当前提供该字段将拒绝执行。"),
    stdin: tool.schema
      .string()
      .optional()
      .describe("兼容字段；当前提供该字段将拒绝执行。"),
    outputLimit: tool.schema
      .number()
      .optional()
      .describe("stdout/stderr 截断长度（字符），默认 4096。超出部分丢弃但 truncated 字段为 true。"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_safe_bash", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
