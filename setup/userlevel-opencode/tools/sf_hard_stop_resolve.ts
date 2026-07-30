import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

export default tool({
  description:
    "结构化恢复 Work Item HardStop。Runtime 会按 work_item_id 定位唯一权威活跃 HardStop，hard_stop_id 仅用于可选的一致性保护；安全类阻断可由 Orchestrator 在不扩大权限的前提下自动改走合法路径；扩大权限、风险接受或用户授权重试仍必须引用真实用户原话。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    hard_stop_id: tool.schema
      .string()
      .optional()
      .describe(
        "可选：当前权威 hard_stop_id，用于防止误解除；省略时由 Runtime 按 work_item_id 定位活跃 HardStop",
      ),
    resolution_type: tool.schema
      .enum([
        "operator_error",
        "false_positive",
        "policy_corrected",
        "repaired",
        "prohibited_action_replaced",
        "scope_expanded",
        "user_authorized_retry",
        "risk_accepted",
        "superseded",
      ])
      .describe("解除类型"),
    user_response_quote: tool.schema
      .string()
      .optional()
      .describe(
        "仅在扩大权限、用户授权重试、风险接受或安装授权时必填；必须逐字引用当前真实用户原话",
      ),
    reason: tool.schema.string().optional().describe("解除原因说明"),
    scope: tool.schema
      .string()
      .optional()
      .describe("解除作用域说明，例如 command/tool/work_item"),
    allowed_next_action: tool.schema
      .string()
      .optional()
      .describe("允许的下一步动作"),
    evidence: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("支持解除、分类与恢复方案的证据列表"),
    blocked_action_disposition: tool.schema
      .enum([
        "abandon",
        "retry_after_repair",
        "retry_after_authorization",
        "supersede",
      ])
      .optional()
      .describe(
        "被阻断动作的处置。operator_error / prohibited_action_replaced 必须为 abandon",
      ),
    last_successful_step: tool.schema
      .string()
      .optional()
      .describe("HardStop 前最后一个成功步骤"),
    resume_from_step: tool.schema
      .string()
      .optional()
      .describe("解除后从哪个步骤继续，不得从头重复已完成步骤"),
    retry_original_action: tool.schema
      .boolean()
      .optional()
      .describe("是否重试原动作；操作错误必须为 false"),
    safe_alternative_tool: tool.schema
      .string()
      .optional()
      .describe("替代原动作的合法 Tool 或只读方式"),

    install_authorization: tool.schema
      .boolean()
      .optional()
      .describe(
        "是否同时写入项目级 write_guard_authorization；用户选择授权同类继续时为 true，仅解除本次时不填或 false",
      ),
    authorization_type: tool.schema
      .enum([
        "user_accepted_external_ops",
        "user_authorized_retry",
        "false_positive_pattern",
        "expected_negative_test",
      ])
      .optional()
      .describe("授权类型，用于后续审计分类"),
    authorization_scope: tool.schema
      .string()
      .optional()
      .describe("授权生效范围，推荐 work_item；不要默认 project"),
    authorization_tool: tool.schema
      .string()
      .optional()
      .describe("授权适用工具，默认 sf_safe_bash"),
    authorization_intent: tool.schema
      .string()
      .optional()
      .describe(
        "授权意图，例如 docker_volume_mount / ssh_remote_ops / relative_project_rename",
      ),
    authorization_command_family: tool.schema
      .string()
      .optional()
      .describe("命令族，例如 docker_run / ssh_remote / any_shell_command"),
    authorization_host_path_prefix: tool.schema
      .string()
      .optional()
      .describe("授权宿主机路径前缀，例如 /mnt/1t_back/project/fj1/fj-android"),
    authorization_container_targets: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Docker 容器目标路径，例如 /build、/workspace、/ws"),
    authorization_image: tool.schema
      .string()
      .optional()
      .describe("授权 Docker image，例如 fj-builder:react-native-0.74"),
    authorization_expires_when: tool.schema
      .string()
      .optional()
      .describe("授权过期条件，默认 work_item_closed"),
    authorization_reason: tool.schema
      .string()
      .optional()
      .describe("授权原因说明"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_hard_stop_resolve", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
