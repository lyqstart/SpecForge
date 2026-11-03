import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_branch_plan"

export default tool({
  description: "生成待用户确认的语义分支名。显式 detached bootstrap 模式仅在 post_merge_verified 保存哈希绑定计划，不更改 Git 引用或业务文件；执行仍需用户确认两条新分支身份。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0036"),
    title: tool.schema.string().describe("本次任务标题，用于生成分支名语义 slug"),
    work_item_type: tool.schema.string().optional().describe("任务类型，例如 feature / fix / refactor / ops / hotfix"),
    bootstrap_from_detached: tool.schema.boolean().optional().describe("显式为无本地分支的 detached 原提交生成实施前不可变计划；不是普通语义名称建议"),
    expected_head: tool.schema.string().optional().describe("detached bootstrap 原提交的完整40位身份"),
    base_branch: tool.schema.string().optional().describe("用户拟确认的新基线分支名，不声称恢复旧分支"),
    branch_name: tool.schema.string().optional().describe("用户拟确认的新 WI 工作分支名"),
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
