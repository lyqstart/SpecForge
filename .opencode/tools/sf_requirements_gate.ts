/**
 * sf_requirements_gate - 检查 requirements.md 或 bugfix.md 是否满足最低质量标准
 *
 * 检查项（standard 模式）：
 * 1. requirements.md 是否存在
 * 2. 是否包含用户故事
 * 3. 是否包含验收标准
 * 4. 是否包含术语表
 *
 * 检查项（bugfix 模式）：
 * 1. bugfix.md 是否存在
 * 2. 是否包含当前行为 / Current Behavior
 * 3. 是否包含预期行为 / Expected Behavior
 * 4. 是否包含不变行为 / Unchanged Behavior
 * 5. 是否包含根因分析 / Root Cause Analysis
 *
 * Requirements: 1.5, 8.3, 8.4, 20.1, 20.2, 20.4
 */

import { tool } from "@opencode-ai/plugin"
import { checkRequirementsGate, checkBugfixGate } from "./lib/sf_requirements_gate_core"

export default tool({
  description: "检查 requirements.md 或 bugfix.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    mode: tool.schema
      .enum(["standard", "bugfix"])
      .default("standard")
      .describe("检查模式: standard 检查 requirements.md, bugfix 检查 bugfix.md"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = args.mode === "bugfix"
      ? await checkBugfixGate(args.work_item_id, baseDir)
      : await checkRequirementsGate(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
