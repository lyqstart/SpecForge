import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "对目标文件执行批量正则验证，返回结构化结果",
  args: {
    target_file: tool.schema.string().describe("要验证的文件路径"),
    checks: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().describe("检查描述"),
          pattern: tool.schema.string().describe("正则模式"),
          should_exist: tool.schema.boolean().describe("模式是否应被找到"),
          count: tool.schema.number().optional().describe("预期最小匹配次数"),
        })
      )
      .describe("检查模式数组"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_batch_verify", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
