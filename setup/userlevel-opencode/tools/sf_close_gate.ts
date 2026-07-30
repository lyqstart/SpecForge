import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "执行 Work Item 关闭前的 v1.1 Close Gate 完整性检查。Close Gate 必须根据 workflow_path 判定 required/not_applicable，" +
    "验证 evidence、verification、merge、audit、permission 以及历史未决 extension_request 的恢复闭环，全部通过后才能 closed。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["close", "recover_invalid_closure"])
      .optional()
      .describe("默认 close。仅当客观证据证明既有 closed 无效时，使用 recover_invalid_closure 受控恢复到 implementation_ready。"),
    recovery_reason: tool.schema
      .string()
      .optional()
      .describe("恢复无效关闭的具体原因；action=recover_invalid_closure 时必填。"),
    confirm_invalid_closure_recovery: tool.schema
      .boolean()
      .optional()
      .describe("明确确认补偿恢复；action=recover_invalid_closure 时必须为 true。"),
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
