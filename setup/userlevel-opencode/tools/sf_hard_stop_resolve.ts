import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "结构化解除 Work Item hard_stop。必须提供用户原话、原因和解除类型；不会静默删除证据。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    hard_stop_id: tool.schema.string().optional().describe("可选：当前 hard_stop_id，用于防止误解除"),
    resolution_type: tool.schema
      .enum(["false_positive", "scope_expanded", "user_authorized_retry", "repaired", "risk_accepted", "superseded"])
      .describe("解除类型"),
    user_response_quote: tool.schema.string().describe("用户明确同意解除/处置的原话"),
    reason: tool.schema.string().optional().describe("解除原因说明"),
    scope: tool.schema.string().optional().describe("解除作用域说明，例如 command/tool/work_item"),
    allowed_next_action: tool.schema.string().optional().describe("允许的下一步动作"),
    evidence: tool.schema.array(tool.schema.string()).optional().describe("支持解除的证据列表"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_hard_stop_resolve", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
