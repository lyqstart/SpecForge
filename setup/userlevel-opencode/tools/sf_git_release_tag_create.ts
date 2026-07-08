import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_release_tag_create"
export default tool({
  description: "Git release tag 创建：经用户确认后创建 annotated tag，不自动 push。",
  args: {
    tag_name: tool.schema.string().describe("标签名"),
    target_ref: tool.schema.string().optional().describe("目标引用，默认 HEAD"),
    message: tool.schema.string().optional().describe("标签说明"),
    confirmed: tool.schema.boolean().describe("用户是否确认创建标签，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
