/**
 * sf_tasks_gate - 检查 tasks.md 是否满足最低质量标准
 *
 * 检查项：
 * 1. tasks.md 是否存在
 * 2. 每个 task 是否包含 verification_commands 字段
 *
 * Requirements: 8.3, 8.6
 */

import { tool } from "@opencode-ai/plugin"
import { checkTasksGate } from "./lib/sf_tasks_gate_core"

export default tool({
  description: "检查 tasks.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await checkTasksGate(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
