import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "按照 candidate_manifest.json 执行 Candidate 合并到 .specforge/project/**，验证 user_decision 和 base_spec_version，" +
    "生成 merge_report.md 并执行 post_merge_gate。用户级 tool 名称保持 sf_merge_run，daemon dispatcher 会映射到 v1.1 MergeRunner。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    dry_run: tool.schema
      .boolean()
      .optional()
      .describe("兼容字段：为 true 时只验证前置条件，不执行实际合并；v1.1 handler 可忽略未实现字段。"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_merge_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
