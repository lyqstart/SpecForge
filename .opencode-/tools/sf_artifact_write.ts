import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "将产物文件写入白名单路径（供只读 Agent 使用）",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    file_type: tool.schema
      .enum(["verification_report", "work_log", "review_report", "intake", "agent_run_result"])
      .describe("文件类型"),
    content: tool.schema.string().describe("文件内容"),
    run_id: tool.schema.string().optional()
      .describe("Run ID（work_log 和 agent_run_result 时必填）"),
    template: tool.schema.enum(["verification_report"]).optional()
      .describe("模板类型，指定时将 content 作为 JSON 用模板渲染"),
    agent_content: tool.schema.string().optional()
      .describe("Agent 报告内容（work_log 时可选，用于自动合并 trace 统计）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_artifact_write", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
