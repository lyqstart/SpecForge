import { tool } from "@opencode-ai/plugin";
import { daemon, invokeVerificationConsumerTool } from "./lib/thin-client";
export default tool({
  description:
    "将 SpecForge Work Item 受控产物写入白名单路径。正式 WI 产物必须使用 canonical file_type，不得用 work_log 承载 trigger_result/tasks/candidate_manifest/merge_report/evidence_manifest 等 required artifact。" +
    " JSON 产物的 content 必须是 JSON 字符串；如果上层传入对象，daemon 会尽量序列化，但 Agent 应优先使用 JSON.stringify 后的字符串。" +
    " 新项目第一次正式功能如果尚无有效 Project Architecture / Project Data Model，sf-design 必须在同一个 Requirement WI 中使用 candidate_architecture、candidate_data_model，并为已声明或受控新增 Module 使用 candidate_module_definition 写入真实 code_paths、使用 candidate_module_contract 建立 Module Contract；不得编造架构、数据模型或代码归属。" +
    " verification_report 必须使用 template=verification_report；daemon 会在写盘前严格校验 sf-verifier Required Output 契约，不会补齐缺失字段或接受 evidence_ref 别名；校验通过后才渲染 Markdown 并保留可机读 fenced JSON。该产物和 evidence_manifest 由 sf-verifier 拥有。" +
    " D23执行结果的evidence_manifest条目直接引用verification-owner:receipt:<receipt_id>，hash_domain=canonical-json:verification-execution/v1；不要为已有执行回执另造verification_evidence副本、probe或人工证据。" +
    " evidence_manifest每个entry的基本必填字段为evidence_id、type、path、description、created_at；type是test_output/command_output等已登记载体枚举，evidence_type/artifact_type不能替代type，id/location/timestamp也不能替代对应必填字段。" +
    " verification_evidence仅用于合同要求的独立人工/其他合法观测源，由sf-verifier以唯一artifact_name写入evidence/source，返回Runtime SHA-256与真实recorded_at，清单引用该独立文件。名称以ASCII字母数字开始，主体只含字母数字._-且最多101字符，扩展名仅jsonl/txt/png/webp/jpg/jpeg；.json、.md、无扩展名和路径分隔符均拒绝。verification_gate通过后输入被冻结；修改先按恢复流程回到implementation_ready。" +
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
    artifact_name: tool.schema.string().optional().describe("仅verification_evidence：不可覆盖的文件名，如facts.txt或observation.jsonl；主体ASCII字母数字开头、只含字母数字._-、最多101字符；扩展名限jsonl/txt/png/webp/jpg/jpeg，不接受.json/.md/无扩展名/分隔符。D23执行回执直接写evidence_manifest引用，不需本参数。"),
    content_encoding: tool.schema.enum(["utf8", "base64"]).optional().describe("verification_evidence 编码；图片须 base64。"),
    run_id: tool.schema.string().optional().describe("work_log 和 agent_run_result 必填。"),
    template: tool.schema.enum(["verification_report"]).optional().describe("verification_report 必填；content 为结构化 Verification JSON。"),
    agent_content: tool.schema.string().optional().describe("work_log 可选 Agent 报告内容。"),
  },
  async execute(args, context) {
    const result = ['verification_report', 'evidence_manifest'].includes(args.file_type)
      ? await invokeVerificationConsumerTool("sf_artifact_write", args, context)
      : await daemon.invokeTool("sf_artifact_write", args, context);
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
