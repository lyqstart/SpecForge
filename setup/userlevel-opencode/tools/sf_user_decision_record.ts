import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

type Payload = Record<string, unknown>

/**
 * 记录用户决策，生成 user_decision.json。
 *
 * Final Governance Alignment 规则：
 * - user_approved 必须由调用方显式传 user_response_quote；
 * - auto_approved 必须由调用方显式传 auto_approval_policy_id；
 * - comments / reason 只是备注，不得伪装结构化字段；
 * - wrapper 只暴露和透传字段，最终强校验由 daemon handler 执行。
 */
export default tool({
  description:
    "记录用户决策，生成 user_decision.json。user_approved 必须显式传 user_response_quote；" +
    "auto_approved 必须显式传 auto_approval_policy_id；comments/reason 不会被当作结构化审批字段。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["record", "invalidate"])
      .optional()
      .describe("操作：record=记录决策，invalidate=使已有决策失效"),
    approved: tool.schema
      .boolean()
      .optional()
      .describe("Legacy 兼容字段：true→approved/user_approved，false→rejected/rejected；不自动生成 user_response_quote。"),
    decision_status: tool.schema
      .enum(["approved", "waived", "rejected", "invalidated"])
      .optional()
      .describe("v1.1 决策状态"),
    decision_type: tool.schema
      .enum(["auto_approved", "user_approved", "waived", "rejected"])
      .optional()
      .describe("v1.1 决策类型"),
    workflow_path: tool.schema.string().optional().describe("workflow_path，用于记录决策范围"),
    base_spec_version: tool.schema.string().optional().describe("base spec version，用于决策哈希校验"),
    decision_scope: tool.schema.string().optional().describe("决策范围，默认 full"),
    user_response_quote: tool.schema
      .string()
      .optional()
      .describe("用户审批原话；decision_type=user_approved 且 decision_status=approved 时必传。"),
    auto_approval_policy_id: tool.schema
      .string()
      .optional()
      .describe("自动审批策略 ID；decision_type=auto_approved 且 decision_status=approved 时必传。"),
    comments: tool.schema
      .string()
      .optional()
      .describe("备注字段。不得写入 user_response_quote 或 auto_approval_policy_id 的伪结构化内容。"),
    reason: tool.schema.string().optional().describe("invalidate / rejected 时的原因或普通说明"),
  },
  async execute(args, context) {
    const payload: Payload = { ...args }

    if (!payload.action) payload.action = "record"

    if (payload.action === "record" && !payload.decision_status && typeof payload.approved === "boolean") {
      payload.decision_status = payload.approved ? "approved" : "rejected"
      payload.decision_type = payload.approved ? "user_approved" : "rejected"
    }

    if (payload.action === "record" && !payload.decision_type && payload.decision_status === "waived") {
      payload.decision_type = "waived"
    }

    // 明确禁止 wrapper 从 comments/reason 中解析结构化审批证据。
    // 缺 user_response_quote / auto_approval_policy_id 时必须让 daemon fail-closed。
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
