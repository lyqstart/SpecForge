import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

const refs = () => tool.schema.array(tool.schema.string()).optional();

const semanticClosureSchema = tool.schema.object({
  schema_version: tool.schema
    .string()
    .optional()
    .describe("契约版本，当前使用 1.0"),
  work_item_id: tool.schema
    .string()
    .optional()
    .describe("必须与外层 work_item_id 一致"),
  closure_profile: tool.schema
    .string()
    .optional()
    .describe("Investigation 使用 investigation"),
  workflow_type: tool.schema.string().optional(),
  outcomes: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        description: tool.schema.string().optional(),
        requirement_refs: refs(),
        required_evidence_refs: refs(),
      }),
    )
    .optional(),
  requirements: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        description: tool.schema.string().optional(),
        type: tool.schema
          .string()
          .optional()
          .describe("MUST/SHOULD/MAY；MUST 需要非弱完成证据"),
        requirement_type: tool.schema.string().optional(),
        outcome_refs: refs(),
        design_refs: refs(),
        task_refs: refs(),
        required_evidence_refs: refs(),
      }),
    )
    .optional(),
  design_decisions: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        description: tool.schema.string().optional(),
        requirement_refs: refs(),
        task_refs: refs(),
      }),
    )
    .optional(),
  tasks: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        description: tool.schema.string().optional(),
        requirement_refs: refs(),
        design_refs: refs(),
        evidence_refs: refs(),
      }),
    )
    .optional(),
  evidence: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        description: tool.schema.string().optional(),
        status: tool.schema
          .string()
          .describe("pass/passed/success/succeeded 才能证明完成"),
        level: tool.schema
          .string()
          .describe("L3-L5 等非弱证据等级；L0-L2 不能证明完成"),
        evidence_type: tool.schema
          .string()
          .describe("behavioral/integration/e2e 等非弱证据类型"),
        supports: refs(),
        outcome_refs: refs(),
        requirement_refs: refs(),
        design_refs: refs(),
        task_refs: refs(),
      }),
    )
    .optional(),
  investigation_questions: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        finding_refs: refs(),
        required_evidence_refs: refs(),
      }),
    )
    .optional(),
  findings: tool.schema
    .array(
      tool.schema.object({
        id: tool.schema.string(),
        question_refs: refs(),
        evidence_refs: refs(),
        root_cause_status: tool.schema.string().optional(),
      }),
    )
    .optional(),
  project_integration: tool.schema
    .object({
      required: tool.schema.boolean().optional(),
      status: tool.schema.string().describe("merged 或 not_applicable"),
      refs: refs(),
    })
    .optional(),
});

export default tool({
  description:
    "按 semantic-closure/v1 契约生成并校验 Work Item 的 .semantic_closure.json。" +
    "首选直接传 semantic_closure 结构化对象；兼容来源为 verification_report fenced JSON、" +
    "evidence_manifest 语义 sections、或 trace_delta 的 OUT→REQ→DD→TASK→EV 显式链。" +
    "正常工作流需要 outcomes、requirements、design_decisions、tasks、evidence、project_integration；" +
    "证据必须 passed、非弱，并显式引用被证明的语义目标。" +
    "该工具必须在 verification_report、evidence_manifest、changed_files_audit 完成后，verification_gate 之前调用；" +
    "它只写入当前 Work Item 下的 .semantic_closure.json 与 semantic_closure_report.md，" +
    "不推进工作流状态、不修改代码、不修改 project truth source。" +
    "若 semantic_closure_valid=false，不得调用 verification_gate 或 sf_close_gate。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    semantic_closure: semanticClosureSchema
      .optional()
      .describe(
        "Verifier 产出的完整 Semantic Closure Manifest；这是首选且可发现的输入契约",
      ),
    force: tool.schema
      .boolean()
      .optional()
      .describe(
        "强制重建；传 semantic_closure 时自动视为 true。verification_done 后输入已冻结，需先恢复状态",
      ),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_semantic_closure_run", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
