import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "按照 candidate_manifest.json 执行 Candidate 合并到 .specforge/project/**，" +
    "验证 user_decision 哈希一致性和 base_spec_version，生成 merge_report.md，" +
    "执行 post_merge_gate 并递增项目规格版本。" +
    "仅由 Runtime 的 MergeRunner 调用，Agent 不得直接写 .specforge/project/ 或 merge_report.md。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    dry_run: tool.schema
      .boolean()
      .optional()
      .describe("为 true 时只验证前置条件，不执行实际合并"),
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
