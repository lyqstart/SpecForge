import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

const GATE_IDS = [
  "entry_gate",
  "workflow_selection_gate",
  "required_files_gate",
  "candidate_manifest_gate",
  "path_policy_gate",
  "schema_gate",
  "spec_consistency_gate",
  "trace_gate",
  "workflow_specific_gate",
  "gate_summary_gate",
  "merge_ready_gate",
  "post_merge_gate",
  "verification_gate",
  "close_gate",
  "extension_gate",

  // Legacy aliases accepted only for daemon-side normalization.
  // New prompts/skills must use canonical Gate IDs above.
  "all",
  "tasks",
  "verification",
  "close",
]

export default tool({
  description:
    "执行 Work Item 的 v1.1 canonical Gate 检查，生成 gates/<gate_id>.json 和 gate_summary.md。" +
    "必须优先使用 canonical Gate ID，例如 verification_gate、close_gate；legacy 短名仅用于兼容并会由 daemon 规范化。" +
    "未知 Gate ID 必须 fail-closed，不得被解释为 skipped。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    gate_ids: tool.schema
      .array(tool.schema.enum(GATE_IDS))
      .optional()
      .describe(
        "指定要执行的 Gate ID。为空时 daemon 按 workflow_path 执行 required gates。" +
          "禁止在新流程中使用 tasks/verification/close/all 等短名。",
      ),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_gate_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
