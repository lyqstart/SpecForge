import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "检查规格文档的结构合规性",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    doc_type: tool.schema
      .enum(["requirements", "design", "tasks", "bugfix"])
      .describe("文档类型"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_doc_lint", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
