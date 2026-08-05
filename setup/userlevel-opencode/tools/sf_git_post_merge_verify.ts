import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_post_merge_verify"
export default tool({
  description: "正式 Git 合并后验证：校验主线分支、工作树、WI 分支祖先关系、merge commit、Formal Version 实现指纹，并输出 repository_delivery_complete。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item 编号，例如 WI-0036"),
    commands: tool.schema.array(tool.schema.string()).optional().describe("建议执行的验证命令清单"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
