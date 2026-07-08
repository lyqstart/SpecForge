import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_merge_plan"
export default tool({
  description: "Git 合并计划：读取 Work Item 的 git_context.json，输出合并前状态、变更文件和是否具备合并条件。",
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
