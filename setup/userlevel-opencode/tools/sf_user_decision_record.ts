import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "记录用户批准决策，生成 user_decision.json（含 candidate_manifest 哈希、" +
    "gate_summary 哈希、base_spec_version）。" +
    "仅由 Runtime 的 UserDecisionRecorder 调用，Agent 不得直接写 user_decision.json。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    approved: tool.schema.boolean().describe("用户是否批准"),
    comments: tool.schema
      .string()
      .optional()
      .describe("用户批准时的备注信息"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_user_decision_record", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
