import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_merge_plan"
export default tool({
  description: "正式 Git 合并计划：校验 closed 权威状态、Formal Version 快照、WI 分支、工作树和变更集合，并在用户确认前输出阻塞项。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item 编号，例如 WI-0036"),
    default_branch: tool.schema.string().optional().describe("默认主线分支，默认使用 git_context 中的 base_branch 或 main"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
