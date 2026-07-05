import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "结构化解除 Work Item hard_stop。可选安装项目级 Write Guard 授权，使当前 WI 内同类已授权操作不再反复 hard_stop。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    hard_stop_id: tool.schema.string().optional().describe("可选：当前 hard_stop_id，用于防止误解除"),
    resolution_type: tool.schema
      .enum(["false_positive", "scope_expanded", "user_authorized_retry", "repaired", "risk_accepted", "superseded"])
      .describe("解除类型"),
    user_response_quote: tool.schema.string().describe("用户明确同意解除/处置的原话"),
    reason: tool.schema.string().optional().describe("解除原因说明"),
    scope: tool.schema.string().optional().describe("解除作用域说明，例如 command/tool/work_item"),
    allowed_next_action: tool.schema.string().optional().describe("允许的下一步动作"),
    evidence: tool.schema.array(tool.schema.string()).optional().describe("支持解除的证据列表"),

    install_authorization: tool.schema
      .boolean()
      .optional()
      .describe("是否同时写入项目级 write_guard_authorization；用户选择授权同类继续时为 true，仅解除本次时不填或 false"),
    authorization_type: tool.schema
      .enum(["user_accepted_external_ops", "user_authorized_retry", "false_positive_pattern", "expected_negative_test"])
      .optional()
      .describe("授权类型，用于后续审计分类"),
    authorization_scope: tool.schema.string().optional().describe("授权生效范围，推荐 work_item；不要默认 project"),
    authorization_tool: tool.schema.string().optional().describe("授权适用工具，默认 sf_safe_bash"),
    authorization_intent: tool.schema.string().optional().describe("授权意图，例如 docker_volume_mount / ssh_remote_ops / relative_project_rename"),
    authorization_command_family: tool.schema.string().optional().describe("命令族，例如 docker_run / ssh_remote / any_shell_command"),
    authorization_host_path_prefix: tool.schema.string().optional().describe("授权宿主机路径前缀，例如 /mnt/1t_back/project/fj1/fj-android"),
    authorization_container_targets: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Docker 容器目标路径，例如 /build、/workspace、/ws"),
    authorization_image: tool.schema.string().optional().describe("授权 Docker image，例如 fj-builder:react-native-0.74"),
    authorization_expires_when: tool.schema.string().optional().describe("授权过期条件，默认 work_item_closed"),
    authorization_reason: tool.schema.string().optional().describe("授权原因说明"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_hard_stop_resolve", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
