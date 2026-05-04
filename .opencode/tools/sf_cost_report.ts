/**
 * sf_cost_report - 读取成本日志并按多维度聚合分析，返回成本报告
 *
 * 支持按 work_item、agent、phase、model 四个维度聚合，
 * 支持按 work_item_id 和 session_id 过滤。
 * 所有操作为只读，不修改源文件。
 *
 * Requirements: 2.1, 2.2, 2.12
 */

import { tool } from "@opencode-ai/plugin"
import { generateCostReport } from "./lib/sf_cost_report_core"

export default tool({
  description: "读取成本日志并按多维度聚合分析，返回成本报告",
  args: {
    work_item_id: tool.schema.string().optional()
      .describe("按 Work Item ID 过滤"),
    session_id: tool.schema.string().optional()
      .describe("按 Session ID 过滤（用于提取单次 Agent 执行的成本）"),
    group_by: tool.schema.enum(["work_item", "agent", "phase", "model"])
      .default("work_item")
      .describe("聚合维度：work_item（默认）、agent、phase、model"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await generateCostReport(
      {
        work_item_id: args.work_item_id,
        session_id: args.session_id,
        group_by: args.group_by as any,
      },
      baseDir
    )
    return JSON.stringify(result, null, 2)
  },
})
