import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "检查当前 feature_spec 的 Requirements Candidate；不启用历史 bugfix 或其他工作流检查模式。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    mode: tool.schema
      .enum(["standard"])
      .default("standard")
      .describe("当前固定 standard；旧 gate_mode 不可用"),
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
