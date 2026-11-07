import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";
export default tool({
  description:
    "将 SpecForge Work Item 受控产物写入白名单路径。正式 WI 产物必须使用 canonical file_type，不得用 work_log 承载 trigger_result/tasks/candidate_manifest/merge_report/evidence_manifest 等 required artifact。" +
    " JSON 产物的 content 必须是 JSON 字符串；如果上层传入对象，daemon 会尽量序列化，但 Agent 应优先使用 JSON.stringify 后的字符串。" +
    " 新项目第一次正式功能如果尚无有效 Project Architecture / Project Data Model，sf-design 必须在同一个 Requirement WI 中使用 candidate_architecture、candidate_data_model，并为已声明或受控新增 Module 使用 candidate_module_definition 写入真实 code_paths、使用 candidate_module_contract 建立 Module Contract；不得编造架构、数据模型或代码归属。" +
    " verification_report 必须使用 template=verification_report；daemon 会在写盘前严格校验 sf-verifier Required Output 契约，不会补齐缺失字段或接受 evidence_ref 别名；校验通过后才渲染 Markdown 并保留可机读 fenced JSON。该产物和 evidence_manifest 由 sf-verifier 拥有。" +
    " verification_evidence 由 sf-verifier 在验证前以唯一 artifact_name 受控写入 evidence/source，返回 Runtime SHA-256 与真实 recorded_at；验证清单必须引用该独立文件。verification_gate 通过后验证输入被冻结；需要修改时必须先按恢复流程回到 implementation_ready。" +
    " 项目配置只能由 sf-orchestrator 在 intake_ready 使用 project_prod_environment 或 project_rules 写入 .specforge/config/，不得在 Write Guard 拒绝后改用原生写入。" +
    " file_type=work_item 时内容至少应包含 schema_version、work_item_id、status、workflow_type、workflow_path。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
    module_id: tool.schema.string().optional().describe("模块级 Candidate 的明确 MODULE_CODE；多模块或新增模块场景必填。"),
    file_type: tool.schema.enum([
        "work_item",
        "intake",
        "change_classification",
        "impact_analysis",
        "trigger_result",
        "investigation_plan",
        "findings_report",
        "tasks",
        "requirements",
        "requirements_delta",
        "design",
        "design_delta",
        "candidate_requirements",
        "candidate_architecture",
        "candidate_data_model",
        "candidate_design",
        "candidate_module_definition",
        "candidate_module_contract",
        "candidate_module_trace",
        "candidate_tasks",
        "trace_delta",
        "candidate_manifest",
        "merge_report",
        "verification_report",
        "evidence_manifest",
        "verification_evidence",
        "work_log",
        "review_report",
        "agent_run_result",
        "project_prod_environment",
        "project_rules",
      ]).describe("正式产物必须使用 canonical 类型；work_log 仅用于 Agent Run 过程日志。"),
    content: tool.schema.string().describe("文件内容；JSON artifact 必须传合法 JSON 字符串。验证通过条目必须引用真实 Runtime receipt 和 Task 主体。"),
    artifact_name: tool.schema.string().optional().describe("verification_evidence 不可覆盖的文件名，禁止路径分隔符。"),
    content_encoding: tool.schema.enum(["utf8", "base64"]).optional().describe("verification_evidence 编码；图片须 base64。"),
    run_id: tool.schema.string().optional().describe("work_log 和 agent_run_result 必填。"),
    template: tool.schema.enum(["verification_report"]).optional().describe("verification_report 必填；content 为结构化 Verification JSON。"),
    agent_content: tool.schema.string().optional().describe("work_log 可选 Agent 报告内容。"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_artifact_write", args, context);
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
