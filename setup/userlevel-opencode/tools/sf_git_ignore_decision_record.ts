import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_ignore_decision_record"
export default tool({
  description: "Git 忽略决策记录：把用户裁决写入 git_ignore_decisions.json，并把 ignore 决定应用到根 .gitignore 的 SpecForge 托管区块。已知可再生产物只有在决定、实际 ignore、未跟踪三项同时成立时才可从 changed-files audit 排除。",
  args: {
    decisions: tool.schema.array(tool.schema.object({
      path: tool.schema.string().describe("文件路径"),
      decision: tool.schema.string().describe("track、ignore、ask 或 hard_stop"),
      reason: tool.schema.string().optional().describe("决策原因"),
    })).describe("忽略决策列表"),
    confirmed: tool.schema.boolean().describe("用户是否确认写入忽略决策，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
