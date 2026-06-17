import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "记录用户决策，生成 user_decision.json。v1.1 推荐传 decision_status + decision_type；approved 为 legacy 兼容字段，" +
    "wrapper 会转换为 v1.1 decision_status/decision_type。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["record", "invalidate"])
      .optional()
      .describe("操作：record=记录决策，invalidate=使已有决策失效"),
    approved: tool.schema
      .boolean()
      .optional()
      .describe("Legacy 兼容字段：true→approved/user_approved，false→rejected/rejected"),
    decision_status: tool.schema
      .enum(["approved", "waived", "rejected", "invalidated"])
      .optional()
      .describe("v1.1 决策状态"),
    decision_type: tool.schema
      .enum(["auto_approved", "user_approved", "waived", "rejected"])
      .optional()
      .describe("v1.1 决策类型"),
    workflow_path: tool.schema
      .string()
      .optional()
      .describe("workflow_path，用于记录决策范围"),
    base_spec_version: tool.schema
      .string()
      .optional()
      .describe("base spec version，用于决策哈希校验"),
    decision_scope: tool.schema
      .string()
      .optional()
      .describe("决策范围，默认 full"),
    comments: tool.schema
      .string()
      .optional()
      .describe("用户备注（兼容字段）"),
    reason: tool.schema
      .string()
      .optional()
      .describe("invalidate 时的原因"),
  },
  async execute(args, context) {
    const payload: Record<string, unknown> = { ...args }

    if (!payload.action) payload.action = "record"

    if (payload.action === "record" && !payload.decision_status && typeof payload.approved === "boolean") {
      payload.decision_status = payload.approved ? "approved" : "rejected"
      payload.decision_type = payload.approved ? "user_approved" : "rejected"
    }

    if (payload.action === "record" && !payload.decision_type && payload.decision_status === "waived") {
      payload.decision_type = "waived"
    }

    const result = await daemon.invokeTool("sf_user_decision_record", payload, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
