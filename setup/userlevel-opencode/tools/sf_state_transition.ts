import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

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
    transition_context: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("流转上下文参数，用于工作流特定守卫检查（如 investigation 的 user_accepted）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_state_transition", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
