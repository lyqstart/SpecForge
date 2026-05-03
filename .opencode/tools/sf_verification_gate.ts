/**
 * sf_verification_gate - 检查验证阶段是否满足最低质量标准
 *
 * 检查项：
 * 1. 是否存在测试执行结果
 * 2. 测试是否全部通过
 *
 * Requirements: 8.3, 8.7
 */

import { tool } from "@opencode-ai/plugin"
import { checkVerificationGate } from "./lib/sf_verification_gate_core"

export default tool({
  description: "检查验证阶段是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await checkVerificationGate(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
