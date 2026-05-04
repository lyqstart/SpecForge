/**
 * sf_artifact_write - 将产物文件写入白名单路径（供只读 Agent 使用）
 *
 * 为只读 Agent（sf-verifier、sf-reviewer）提供白名单路径内的文件写入能力。
 * 支持模板渲染（将验证 JSON 渲染为 Markdown 报告）和 work_log 自动生成。
 *
 * Requirements: 1.1, 1.2
 */

import { tool } from "@opencode-ai/plugin"
import { writeArtifact } from "./lib/sf_artifact_write_core"

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
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await writeArtifact(
      {
        work_item_id: args.work_item_id,
        file_type: args.file_type as any,
        content: args.content,
        run_id: args.run_id,
        template: args.template as any,
        agent_content: args.agent_content,
      },
      baseDir
    )
    return JSON.stringify(result, null, 2)
  },
})
