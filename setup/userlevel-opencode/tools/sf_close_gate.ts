import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "执行 Work Item 关闭前的 v1.1 Close Gate 完整性检查。Close Gate 必须根据 workflow_path 判定 required/not_applicable，" +
    "验证 evidence、verification、merge、audit、permission 以及历史未决 extension_request 的恢复闭环，全部通过后才能 closed；" +
    "并提供两类互不替代的显式终态补偿恢复。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["close", "recover_invalid_closure", "recover_invalid_merged_spec_closure"])
      .optional()
      .describe(
        "默认 close。实现或 Formal Version 证据无效使用 recover_invalid_closure 回到 implementation_ready；" +
        "已合并的正式 Project Spec 本身无效使用 recover_invalid_merged_spec_closure 归档旧代并回到 candidate_preparing。",
      ),
    recovery_reason: tool.schema
      .string()
      .optional()
      .describe("恢复无效关闭的具体原因；任一 recover action 均必填。"),
    confirm_invalid_closure_recovery: tool.schema
      .boolean()
      .optional()
      .describe("明确确认补偿恢复；action=recover_invalid_closure 时必须为 true。"),
    confirm_invalid_merged_spec_recovery: tool.schema
      .boolean()
      .optional()
      .describe(
        "明确确认已合并无效 Project Spec 的补偿恢复；action=recover_invalid_merged_spec_closure 时必须为 true。",
      ),
    not_applicable: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("兼容字段：标记为 not_applicable 的检查项。最终判定必须以 daemon close_gate workflow_path 规则为准。"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_close_gate", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
