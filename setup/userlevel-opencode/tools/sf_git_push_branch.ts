import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_push_branch"
export default tool({
  description: "Git 分支推送：把当前或指定 Work Item 分支推送到远程仓库。",
  args: {
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin"),
    branch_name: tool.schema.string().optional().describe("分支名，默认当前分支"),
    set_upstream: tool.schema.boolean().optional().describe("是否设置 upstream，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
