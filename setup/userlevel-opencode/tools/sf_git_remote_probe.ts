import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_remote_probe"
export default tool({
  description: "Git 远程仓库探测：只读执行 git ls-remote，验证远程仓库连通性和 provider 类型。",
  args: {
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
