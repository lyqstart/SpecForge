import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_pr_plan"
export default tool({
  description: "Git PR/MR 计划：生成 provider-agnostic 合并请求计划，不直接调用外部平台 API。",
  args: {
    source_branch: tool.schema.string().optional().describe("源分支，默认当前分支"),
    target_branch: tool.schema.string().optional().describe("目标分支，默认 main"),
    remote_name: tool.schema.string().optional().describe("远程名，默认 origin"),
    provider: tool.schema.string().optional().describe("provider 提示：github/gitlab/gitee/generic_git"),
    title: tool.schema.string().optional().describe("PR/MR 标题"),
    body: tool.schema.string().optional().describe("PR/MR 描述"),
    write_plan: tool.schema.boolean().optional().describe("是否写入 .specforge/runtime/git_pr_plan.json，默认 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
