import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_preflight"

export default tool({
  description: "Git 预检：只读检查当前分支、工作区状态、远程仓库摘要。用于开发前确认是否可进入 Work Item 分支治理。",
  args: {
    default_branch: tool.schema.string().optional().describe("默认主线分支，默认 main"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
