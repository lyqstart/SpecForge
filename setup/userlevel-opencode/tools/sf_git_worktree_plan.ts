import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_worktree_plan"
export default tool({
  description: "Git worktree 计划：为并行工作目录生成创建计划。",
  args: {
    branch_name: tool.schema.string().describe("分支名"),
    base_ref: tool.schema.string().optional().describe("基线引用，默认 main"),
    worktree_path: tool.schema.string().optional().describe("worktree 目录绝对路径或相对路径"),
    create_branch: tool.schema.boolean().optional().describe("是否创建新分支，默认 true"),
    write_plan: tool.schema.boolean().optional().describe("是否写入计划，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
