import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "读取成本日志并按多维度聚合分析，返回成本报告",
  args: {
    work_item_id: tool.schema.string().optional()
      .describe("按 Work Item ID 过滤"),
    session_id: tool.schema.string().optional()
      .describe("按 Session ID 过滤（用于提取单次 Agent 执行的成本）"),
    group_by: tool.schema.enum(["work_item", "agent", "phase", "model"])
      .default("work_item")
      .describe("聚合维度：work_item（默认）、agent、phase、model"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_cost_report", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
