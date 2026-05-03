/**
 * sf_state_transition - 执行 Work Item 的状态流转
 *
 * 验证合法性并更新权威状态。支持：
 * - 现有 Work Item 的状态流转（乐观锁验证）
 * - 新 Work Item 的创建（from_state 为空字符串）
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { tool } from "@opencode-ai/plugin"
import { executeTransition } from "./lib/sf_state_transition_core"

export default tool({
  description: "执行 Work Item 的状态流转，验证合法性并更新权威状态",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    from_state: tool.schema
      .string()
      .describe("当前状态（用于乐观锁验证），空字符串表示创建新 Work Item"),
    to_state: tool.schema.string().describe("目标状态"),
    evidence: tool.schema
      .string()
      .optional()
      .describe("流转依据，如 Gate 结果"),
    workflow_type: tool.schema
      .string()
      .optional()
      .describe('工作流类型，仅创建新 Work Item 时使用，默认 "feature_spec"'),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await executeTransition(
      {
        work_item_id: args.work_item_id,
        from_state: args.from_state,
        to_state: args.to_state,
        evidence: args.evidence,
        workflow_type: args.workflow_type,
      },
      baseDir
    )
    return JSON.stringify(result, null, 2)
  },
})
