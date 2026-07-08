import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_agent_lock_release"
export default tool({
  description: "Git agent lock 释放：释放多 agent 并发锁。",
  args: {
    lock_name: tool.schema.string().describe("锁名称"),
    owner: tool.schema.string().optional().describe("锁所有者/agent 名"),
    force: tool.schema.boolean().optional().describe("是否强制释放"),
    confirmed: tool.schema.boolean().describe("用户是否确认释放锁，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
