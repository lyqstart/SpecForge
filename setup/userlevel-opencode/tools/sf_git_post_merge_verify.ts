import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_post_merge_verify"
export default tool({
  description: "Git 合并后验证计划：记录主线合并后的验证命令清单和当前 HEAD，用于 post-merge verification。",
  args: {
    commands: tool.schema.array(tool.schema.string()).optional().describe("建议执行的验证命令清单"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
