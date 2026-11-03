import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_branch_create"

export default tool({
  description: "创建已确认的语义 Work Item 分支并写标准 git_context。普通模式要求 clean；哈希绑定 detached bootstrap 模式仅允许未跟踪治理现场，原子新建已确认两分支并绑定 HEAD，保持索引与业务字节，不恢复旧分支。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0036"),
    branch_name: tool.schema.string().describe("用户确认后的语义化分支名"),
    confirmed: tool.schema.boolean().describe("必须为 true，表示用户已确认 branch_name"),
    base_branch: tool.schema.string().optional().describe("基线分支，默认 main"),
    require_clean: tool.schema.boolean().optional().describe("是否要求工作区干净，默认 true"),
    bootstrap_plan_sha256: tool.schema.string().optional().describe("detached bootstrap 的正式不可变计划 SHA-256；当前状态须为 post_merge_verified"),
    bootstrap_confirmation_quote: tool.schema.string().optional().describe("用户明确接受计划中两条新分支名的原话；不接受 Candidate 批准冒充该确认；不得手工补分支或使用伪 base_branch"),
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
