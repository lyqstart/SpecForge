/**
 * sf_requirements_gate - 检查 requirements.md 是否满足最低质量标准
 *
 * 检查项：
 * 1. requirements.md 是否存在
 * 2. 是否包含用户故事
 * 3. 是否包含验收标准
 * 4. 是否包含术语表
 *
 * Requirements: 8.3, 8.4
 */

import { tool } from "@opencode-ai/plugin"
import { checkRequirementsGate } from "./lib/sf_requirements_gate_core"

export default tool({
  description: "检查 requirements.md 是否满足最低质量标准",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await checkRequirementsGate(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
