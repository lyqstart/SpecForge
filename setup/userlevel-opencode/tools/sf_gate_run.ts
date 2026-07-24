import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

const GATE_IDS = [
  "entry_gate",
  "workflow_selection_gate",
  "required_files_gate",
  "candidate_manifest_gate",
  "path_policy_gate",
  "schema_gate",
  "spec_consistency_gate",
  "contract_integrity_gate",
  "trace_gate",
  "workflow_specific_gate",
  "gate_summary_gate",
  "merge_ready_gate",
  "post_merge_gate",
  "verification_gate",
  "close_gate",

  // Daemon-side compatibility aliases.
  "all",
  "candidate",
  "design",
  "requirements",
  "tasks",
  "merge",
  "post_merge",
  "verification",
  "close",
];

const CANDIDATE_PHASES = ["design", "requirements", "tasks", "full"];

export default tool({
  description:
    "执行 Work Item 的 v1.1 canonical Gate 检查，生成 gates/<gate_id>.json 和 gate_summary.md。" +
    "workflow_specific_gate 委托给现有 Requirements/Design/Tasks Gate Core，不再使用 MVP 跳过实现。" +
    "候选审批可通过 candidate_phase 使用 design/requirements/tasks/full 阶段配置。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    gate_ids: tool.schema
      .array(tool.schema.enum(GATE_IDS))
      .optional()
      .describe(
        "指定 canonical Gate ID；通常省略并由 daemon 根据 workflow_path 和 candidate_phase 选择。",
      ),
    gate_type: tool.schema
      .enum(GATE_IDS)
      .optional()
      .describe(
        "兼容的单阶段入口。design/requirements 只运行对应 workflow_specific Gate，不完成 Candidate 审批；" +
          "candidate/tasks 执行阶段完整 Gate Profile。",
      ),
    workflow_type: tool.schema
      .string()
      .optional()
      .describe("显式 workflow_type；通常从 trigger_result.json 读取。"),
    candidate_phase: tool.schema
      .enum(CANDIDATE_PHASES)
      .optional()
      .describe(
        "Candidate Gate 阶段：design 只要求设计候选；requirements 要求设计+需求；tasks/full 要求完整候选包。" +
          "默认读取 candidate_manifest.json.candidate_phase。",
      ),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_gate_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });

    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
