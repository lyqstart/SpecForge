import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_worktree_create"
export default tool({
  description: "Git worktree 创建：经用户确认后创建并登记并行工作目录。",
  args: {
    branch_name: tool.schema.string().describe("分支名"),
    base_ref: tool.schema.string().optional().describe("基线引用，默认 main"),
    worktree_path: tool.schema.string().optional().describe("worktree 目录绝对路径或相对路径"),
    create_branch: tool.schema.boolean().optional().describe("是否创建新分支，默认 true"),
    confirmed: tool.schema.boolean().describe("用户是否确认创建 worktree，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
