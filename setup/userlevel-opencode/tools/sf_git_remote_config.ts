import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_remote_config"
export default tool({
  description: "Git 远程仓库配置：检测/记录 generic Git remote，支持本地先有和远程先有两种项目接入方式。",
  args: {
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin"),
    fetch_url: tool.schema.string().optional().describe("fetch URL"),
    push_url: tool.schema.string().optional().describe("push URL，默认等于 fetch URL"),
    auth_profile: tool.schema.string().optional().describe("用户级认证 profile 名称"),
    apply_remote: tool.schema.boolean().optional().describe("是否实际执行 git remote add/set-url，默认 false"),
    confirmed: tool.schema.boolean().optional().describe("执行 remote 写操作时必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
