import { tool } from "@opencode-ai/plugin";
import { daemon, DaemonClient } from "./lib/thin-client";

export default tool({
  description:
    "推进已存在 Work Item 的状态，验证合法性并更新权威状态。blocked→verification_running 仅由真实 sf-orchestrator 在 Runtime 证明原验证阻塞事件、当前批准/合并/实施审计有效且无 HardStop、代码仍撤权时恢复；不重做已成功步骤，不传入自制恢复证明。新 Work Item 必须使用 sf_work_item_create 创建；本工具不负责创建。WI ID 固定为 WI-NNNN，例如 WI-0001。",
  args: {
    work_item_id: tool.schema
      .string()
      .optional()
      .describe("已存在的 Work Item ID，固定格式 WI-NNNN，例如 WI-0001。"),
    from_state: tool.schema
      .string()
      .describe("当前状态，用于乐观锁验证；不得用空字符串创建 Work Item"),
    to_state: tool.schema.string().describe("目标状态"),
    preimplementation_recovery: tool.schema.enum(["inspect", "recover"]).optional()
      .describe("D32：仅 blocked→candidate_preparing 的已合并未实施规格修复。inspect 返回无副作用证明和精确授权行；recover 必须取得用户对该行的明确确认，归档旧代、使旧审批失效并保留冻结 Task。"),
    user_authorization_text: tool.schema.string().optional()
      .describe("D32 recover 的真实用户消息完整原文；Runtime 从宿主核验来源，不能用 Agent 转述或方案批准代替本次具体恢复确认。"),
    evidence: tool.schema
      .string()
      .optional()
      .describe("流转依据，如 Gate 结果"),
    workflow_type: tool.schema
      .enum(["feature_spec"])
      .optional()
      .describe("工作流类型；状态推进通常不需要提供"),
    workflow_path: tool.schema
      .string()
      .optional()
      .describe("v1.1 workflow_path，例如 code_only_fast_path"),
    transition_context: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("流转上下文参数，用于工作流特定守卫检查"),
  },

  async execute(args, context) {
    const recovery =
      (args.from_state === "blocked" && args.to_state === "verification_running") || args.preimplementation_recovery !== undefined;
    const client = recovery ? new DaemonClient(180000) : daemon;
    const result = await client.invokeTool(
      "sf_state_transition",
      args,
      { callID: Reflect.get(context, "callID"),
        sessionID: context.sessionID,
        messageID: context.messageID,
        agent: context.agent,
        directory: context.directory,
        worktree: context.worktree,
      },
      recovery ? { signal: context.abort, retry: false } : undefined,
    );

    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
