import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "执行 Work Item 关闭前的完整性检查（Close Gate）：验证状态为 verification_done、" +
    "所有 Gate 通过、user_decision 有效、merge_report 成功、规格版本递增、" +
    "evidence_manifest 存在、无 escaped_write_incident、无未处理 extension_request。" +
    "全部通过后推进状态到 closed 并冻结所有文件。" +
    "仅由 Runtime 的 CloseGate 调用，Agent 不得直接关闭 Work Item。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    not_applicable: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("标记为 not_applicable 的检查项（可跳过 evidence/verification/trace_matrix）"),
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
