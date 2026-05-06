/**
 * sf_design_gate - 检查 design.md 是否满足最低质量标准
 *
 * 检查项：
 * 1. design.md 是否存在
 * 2. 是否引用了 requirements.md 中的需求编号
 *
 * Requirements: 8.3, 8.5, 11.2, 11.5
 */

import { tool } from "@opencode-ai/plugin"
import { checkDesignGate } from "./lib/sf_design_gate_core"
import type { DesignGateMode } from "./lib/sf_design_gate_core"
import { recordGateResult } from "./lib/utils"

export default tool({
  description: "检查 design.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    workflow_type: tool.schema.string().optional()
      .describe('工作流类型，默认 "feature_spec"'),
    mode: tool.schema
      .string()
      .optional()
      .describe("Gate mode 参数（V3.6）: change_request, ops_task, refactor, investigation。传入时按策略表执行对应检查"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const options = args.mode
      ? { mode: args.mode as DesignGateMode }
      : undefined
    const result = await checkDesignGate(
      args.work_item_id,
      baseDir,
      args.workflow_type,
      options
    )

    await recordGateResult(args.work_item_id, "sf_design_gate", result, baseDir)

    return JSON.stringify(result, null, 2)
  },
})
