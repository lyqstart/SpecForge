import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_release_tag_plan"
export default tool({
  description: "Git release tag 计划：生成版本标签计划，不直接创建标签。",
  args: {
    tag_name: tool.schema.string().describe("标签名，如 v1.3.4"),
    target_ref: tool.schema.string().optional().describe("目标引用，默认 HEAD"),
    message: tool.schema.string().optional().describe("标签说明"),
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin"),
    write_plan: tool.schema.boolean().optional().describe("是否写入计划，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
