import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "检查 requirements.md 或 bugfix.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    mode: tool.schema
      .enum(["standard", "bugfix"])
      .default("standard")
      .describe("检查模式: standard 检查 requirements.md, bugfix 检查 bugfix.md"),
    gate_mode: tool.schema
      .string()
      .optional()
      .describe("Gate mode 参数（V3.6）: change_request, refactor, investigation。传入时按策略表执行对应检查"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_requirements_gate", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
