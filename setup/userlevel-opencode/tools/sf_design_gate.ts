import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "检查 design.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    workflow_type: tool.schema.enum(["feature_spec"]).optional()
      .describe('工作流类型，默认 "feature_spec"'),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_design_gate", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
