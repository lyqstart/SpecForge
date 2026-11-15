import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

const escalationSignal = tool.schema.object({
  type: tool.schema.enum([
    "missing_spec", "conflict", "out_of_scope", "permission_denied",
    "path_violation", "unknown_change", "unsafe_operation", "other",
  ]),
  description: tool.schema.string(),
  affected_refs: tool.schema.array(tool.schema.string()).optional(),
  recommended_action: tool.schema.string().optional(),
});

const handoff = tool.schema.object({
  schema_version: tool.schema.enum(["1.0"]),
  agent: tool.schema.string(),
  work_item_id: tool.schema.string(),
  stage: tool.schema.string(),
  timestamp: tool.schema.string(),
  inputs_read: tool.schema.array(tool.schema.string()),
  outputs_written: tool.schema.array(tool.schema.string()),
  findings: tool.schema.array(tool.schema.string()),
  unknowns: tool.schema.array(tool.schema.string()),
  escalation_signals: tool.schema.array(escalationSignal),
  next_step_recommendation: tool.schema.string(),
  boundary_statement: tool.schema.string(),
  errors: tool.schema.array(tool.schema.string()).optional(),
  warnings: tool.schema.array(tool.schema.string()).optional(),
  duration_ms: tool.schema.number().optional(),
});

export default tool({
  description:
    "持久化或校验专业 Agent handoff。write 成功仅表示保存，required_verification_ready=false 时禁止成功交接；主编排消费 validate_all 完整就绪结果。required_status 返回当前 WI 代际、历史与必需项 key（不是证明）；verify_required 仅由对应候选文件原 owner 按 key 取得受控完整字节 SHA-256 证明。失败、缺失或漂移时停止依赖动作，不绕过权限或代批 Candidate。",
  args: {
    action: tool.schema.enum(["validate", "write", "validate_all", "required_status", "verify_required"]),
    work_item_id: tool.schema.string().optional(),
    handoff: handoff.optional(),
    expected_agent: tool.schema.string().optional(),
    expected_stage: tool.schema.string().optional(),
    created_after: tool.schema.string().optional(),
    requirement_key: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_handoff", args, context);
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
