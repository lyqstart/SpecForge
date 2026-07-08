import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_project_adopt"
export default tool({
  description: "Git 项目接管：为已有项目建立 adoption baseline，写入 git_policy.json、git_ignore_decisions.json 和 adoption report。",
  args: {
    confirmed: tool.schema.boolean().describe("用户是否确认让 SpecForge 接管本项目 Git 管理，必须为 true"),
    default_branch: tool.schema.string().optional().describe("默认主线分支，默认 main"),
    write_report: tool.schema.boolean().optional().describe("是否写入 git_adoption_report.md，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
