import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "基于 Runtime 事实源对账实际文件变更与 allowed_write_files_snapshot。Agent 传入的 expected_write_files / actual_changed_files 仅作为调试提示，" +
    "不得作为最终审计事实源。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    command: tool.schema
      .string()
      .optional()
      .describe("已执行的命令描述（可选，仅用于审计报告展示）"),
    expected_write_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Deprecated：预期写入文件列表。最终审计以 Runtime allowed_write_files_snapshot 为准。"),
    actual_changed_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Deprecated/debug hint：实际变更文件提示。最终审计优先使用 Write Guard log / filesystem diff。"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_changed_files_audit", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
