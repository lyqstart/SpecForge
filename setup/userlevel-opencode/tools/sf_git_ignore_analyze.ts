import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const TOOL_NAME = "sf_git_ignore_analyze"

export default tool({
  description: "持续忽略规则分析：判断新增/未跟踪/待提交文件应 track、ignore、ask 还是 hard_stop。会写 runtime 评估报告，默认不提交。",
  args: {
    paths: tool.schema.array(tool.schema.string()).optional().describe("可选：只分析指定路径；不传则分析 git status 中的所有变更"),
    write_assessment: tool.schema.boolean().optional().describe("是否写入 .specforge/runtime/git_ignore_assessment.json，默认 true"),
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
