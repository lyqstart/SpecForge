import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "生成并校验 Work Item 的语义闭包文件 .semantic_closure.json。" +
    "该工具必须在 verification_report 与 evidence_manifest 完成后、sf_close_gate 之前调用；" +
    "它只写入当前 Work Item 下的 .semantic_closure.json 与 semantic_closure_report.md，" +
    "不推进工作流状态、不修改代码、不修改 project truth source。" +
    "若 semantic_closure_valid=false，Agent 不得调用 sf_close_gate。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    force: tool.schema
      .boolean()
      .optional()
      .describe("是否强制重新生成 .semantic_closure.json；默认 false，已有文件时只重新校验并写报告"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_semantic_closure_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
