import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_checkpoint_commit"

export default tool({
  description: "创建 Git 检查点提交。禁止在 main 上提交，禁止 git add .，提交前必须执行 ignore analysis。",
  args: {
    work_item_id: tool.schema.string().optional().describe("Work Item ID，用于审计说明"),
    files: tool.schema.array(tool.schema.string()).optional().describe("精确待提交文件列表；不传则从 git status 自动提取并分类"),
    message: tool.schema.string().describe("commit 提交信息"),
    default_branch: tool.schema.string().optional().describe("默认主线分支，默认 main"),
    dry_run: tool.schema.boolean().optional().describe("只预览，不提交"),
    allow_ask_files: tool.schema.boolean().optional().describe("是否允许提交 ask 类文件；默认 false，需用户决策"),
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
