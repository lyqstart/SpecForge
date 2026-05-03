/**
 * sf_design_gate - 检查 design.md 是否满足最低质量标准
 *
 * 检查项：
 * 1. design.md 是否存在
 * 2. 是否引用了 requirements.md 中的需求编号
 *
 * Requirements: 8.3, 8.5
 */

import { tool } from "@opencode-ai/plugin"
import { checkDesignGate } from "./lib/sf_design_gate_core"

export default tool({
  description: "检查 design.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await checkDesignGate(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
