import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "读取 Work Item 的当前工作流状态或 Agent Run 记录。传入具体 work_item_id 查询单个，传入 'all' 查询所有 Work Item。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，或传 'all' 查询所有 Work Item"),
    query: tool.schema.enum(["state", "agent_runs"]).default("state")
      .describe("查询类型: state=工作流状态, agent_runs=Agent 执行记录"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_state_read", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
