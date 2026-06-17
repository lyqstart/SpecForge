import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "将 SpecForge Work Item 受控产物写入白名单路径。正式 WI 产物必须使用 canonical file_type，不得用 work_log 承载 trigger_result/tasks/candidate_manifest/merge_report/evidence_manifest 等 required artifact。" +
    " JSON 产物的 content 必须是 JSON 字符串；如果上层传入对象，daemon 会尽量序列化，但 Agent 应优先使用 JSON.stringify 后的字符串。" +
    " file_type=work_item 时内容至少应包含 schema_version、work_item_id、status、workflow_type、workflow_path。",
  args: {
    work_item_id: {
      description: "Work Item ID，例如 WI-20260614-0001",
      type: "string",
    },
    file_type: {
      description:
        "文件类型。正式 WI 产物使用 canonical 类型，例如 trigger_result、tasks、candidate_manifest、merge_report、evidence_manifest；work_log 仅用于 Agent Run 过程日志。",
      type: "string",
      enum: [
        "work_item",
        "intake",
        "change_classification",
        "impact_analysis",
        "trigger_result",
        "tasks", "requirements", "design", "candidate_requirements", "candidate_design", "candidate_tasks",
        "trace_delta",
        "candidate_manifest",
        "merge_report",
        "verification_report",
        "evidence_manifest",
        "work_log",
        "review_report",
        "agent_run_result",
      ],
    },
    content: {
      description:
        "文件内容。JSON artifact 必须传合法 JSON 字符串；不要传 JavaScript 对象字面量。work_item JSON 至少包含 schema_version、work_item_id、status、workflow_type、workflow_path。",
      type: "string",
    },
    run_id: {
      description: "Run ID（work_log 和 agent_run_result 时必填）",
      type: "string",
    },
    template: {
      description: "Legacy 模板类型；新 v1.1 required artifact 应直接传 canonical file_type + content",
      type: "string",
      enum: ["verification_report"],
    },
    agent_content: {
      description: "Agent 报告内容（work_log 时可选，用于自动合并 trace 统计）",
      type: "string",
    },
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_artifact_write", args, context)
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
