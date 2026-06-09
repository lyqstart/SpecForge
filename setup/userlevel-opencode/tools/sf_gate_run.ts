import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "执行 Work Item 的所有 Gate 检查，生成 gates/<gate_id>.json 和 gate_summary.md，" +
    "根据结果推进状态到 approval_required 或 gates_failed。" +
    "仅由 Runtime 调用，Agent 不得直接写 gates/ 或 gate_summary.md。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    gate_ids: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("指定要执行的 Gate ID 列表，为空时执行所有已注册 Gate"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_gate_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
