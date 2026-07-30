import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "只读审计某个 Work Item 的任务与追溯产物权威性。" +
    "优先确认 candidates/tasks.md、candidates/trace_delta.md；仅在 Candidate 缺失时接受真实撰写的顶层历史文件作为只读回退。" +
    "空文件、TODO 占位和 closure-skeleton 均失败关闭。" +
    "该兼容工具已停止修复写入：不创建或覆盖 tasks.md/trace_delta.md，不推进状态，不修改代码或 project truth source。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_work_item_repair_closure", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
