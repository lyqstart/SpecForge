import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_branch_create"

export default tool({
  description: "创建已确认的语义化 Work Item 分支，并写入 .specforge/work-items/<WI-ID>/git_context.json。会要求工作区干净。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0036"),
    branch_name: tool.schema.string().describe("用户确认后的语义化分支名"),
    confirmed: tool.schema.boolean().describe("必须为 true，表示用户已确认 branch_name"),
    base_branch: tool.schema.string().optional().describe("基线分支，默认 main"),
    require_clean: tool.schema.boolean().optional().describe("是否要求工作区干净，默认 true"),
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
