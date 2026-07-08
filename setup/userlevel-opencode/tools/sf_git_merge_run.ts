import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_merge_run"
export default tool({
  description: "Git 合并执行：在用户确认后，将 Work Item 分支合并到主线分支。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item 编号，例如 WI-0036"),
    confirmed: tool.schema.boolean().describe("用户是否已确认合并，必须为 true"),
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin 或 git_context.remote_name"),
    message: tool.schema.string().optional().describe("合并提交说明"),
    pull_first: tool.schema.boolean().optional().describe("合并前是否 pull --ff-only，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
