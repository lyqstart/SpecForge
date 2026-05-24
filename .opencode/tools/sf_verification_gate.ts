import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "检查验证阶段是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    mode: tool.schema
      .string()
      .optional()
      .describe("Gate mode 参数（V3.6）: refactor, ops_task, change_request。传入时按策略表执行对应检查"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_verification_gate", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
