import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "修复某个 Work Item 缺失的根目录闭包骨架文件（tasks.md / trace_delta.md）。" +
    "适用于历史上经旧 sf_state_transition 创建路径生成、从未落地根目录闭包骨架的 Work Item——" +
    "此时 close_gate 因根目录缺 tasks.md / trace_delta.md 而无法关闭，而权威内容其实在 candidates/ 下。" +
    "该工具 fail-closed：只有当对应的权威候选产物（candidates/tasks.md、candidates/trace_delta.md）" +
    "存在且非空时，才在根目录补一个骨架标记；候选缺失或为空则拒绝补齐并报告缺口，绝不伪造闭包。" +
    "它绝不覆盖已存在的根文件（幂等），不推进工作流状态，不修改代码，不修改 project truth source。",
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
