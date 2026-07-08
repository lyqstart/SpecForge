import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_stacked_branch_plan"
export default tool({
  description: "Git stacked branch 计划：规划父子分支、Child Work Item 和合并顺序。",
  args: {
    parent_branch: tool.schema.string().describe("父分支"),
    child_branch: tool.schema.string().describe("子分支"),
    work_item_id: tool.schema.string().optional().describe("父 Work Item ID"),
    child_work_item_id: tool.schema.string().optional().describe("子 Work Item ID"),
    write_plan: tool.schema.boolean().optional().describe("是否写入计划，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
