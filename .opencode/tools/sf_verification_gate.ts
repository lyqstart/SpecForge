/**
 * sf_verification_gate - 检查验证阶段是否满足最低质量标准
 *
 * 检查项：
 * 1. 是否存在测试执行结果
 * 2. 测试是否全部通过
 *
 * Requirements: 8.3, 8.7, 11.4, 11.5
 */

import { tool } from "@opencode-ai/plugin"
import { checkVerificationGate } from "./lib/sf_verification_gate_core"
import type { VerificationGateMode } from "./lib/sf_verification_gate_core"
import { recordGateResult } from "./lib/utils"

export default tool({
  description: "检查验证阶段是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    mode: tool.schema
      .string()
      .optional()
      .describe("Gate mode 参数（V3.6）: refactor, ops_task, change_request。传入时按策略表执行对应检查"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const options = args.mode
      ? { mode: args.mode as VerificationGateMode }
      : undefined
    const result = await checkVerificationGate(args.work_item_id, baseDir, options)

    await recordGateResult(args.work_item_id, "sf_verification_gate", result, baseDir)

    return JSON.stringify(result, null, 2)
  },
})
