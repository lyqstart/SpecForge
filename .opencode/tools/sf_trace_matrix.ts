/**
 * sf_trace_matrix - 检查需求→设计→任务的追溯关系完整性
 *
 * 解析 requirements.md、design.md、tasks.md，验证：
 * 1. 每个需求编号在 design.md 中至少被引用一次
 * 2. 每个设计章节在 tasks.md 中至少被引用一次
 *
 * Requirements: 13.1, 13.6
 */

import { tool } from "@opencode-ai/plugin"
import { checkTraceMatrix } from "./lib/sf_trace_matrix_core"

export default tool({
  description: "检查需求→设计→任务的追溯关系完整性",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await checkTraceMatrix(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
