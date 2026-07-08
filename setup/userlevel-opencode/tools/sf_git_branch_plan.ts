import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_branch_plan"

export default tool({
  description: "生成语义化 Git 分支名候选。分支名必须有业务含义，并带 Work Item 编号，等待用户确认后才能创建。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0036"),
    title: tool.schema.string().describe("本次任务标题，用于生成分支名语义 slug"),
    work_item_type: tool.schema.string().optional().describe("任务类型，例如 feature / fix / refactor / ops / hotfix"),
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
