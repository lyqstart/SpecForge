import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_agent_lock_acquire"
export default tool({
  description: "Git agent lock 获取：登记多 agent 并发锁，防止多个 agent 同时改同一范围。",
  args: {
    lock_name: tool.schema.string().describe("锁名称"),
    owner: tool.schema.string().describe("锁所有者/agent 名"),
    work_item_id: tool.schema.string().optional().describe("关联 Work Item ID"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("锁定路径列表"),
    ttl_minutes: tool.schema.string().optional().describe("过期分钟数，默认 120"),
    confirmed: tool.schema.boolean().describe("用户是否确认获取锁，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
