import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_changed_files_audit"
export default tool({
  description: "Git 变更文件审计：基于 Work Item 的 base commit 对比 HEAD，生成 git_audit.md，并结合 ignore analysis 判断是否可提交/合并。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item 编号，例如 WI-0036"),
    allow_ask_files: tool.schema.boolean().optional().describe("是否允许 ask 类文件进入审计，默认 false"),
    write_report: tool.schema.boolean().optional().describe("是否写入 git_audit.md，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
