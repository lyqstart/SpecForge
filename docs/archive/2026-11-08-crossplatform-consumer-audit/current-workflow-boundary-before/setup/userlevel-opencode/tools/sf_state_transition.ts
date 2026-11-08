import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

export default tool({
  description:
    "推进已存在 Work Item 的状态，验证合法性并更新权威状态。新 Work Item 必须使用 sf_work_item_create 创建；本工具不负责创建。WI ID 固定为 WI-NNNN，例如 WI-0001。",
  args: {
    work_item_id: tool.schema
      .string()
      .optional()
      .describe("已存在的 Work Item ID，固定格式 WI-NNNN，例如 WI-0001。"),
    from_state: tool.schema
      .string()
      .describe("当前状态，用于乐观锁验证；不得用空字符串创建 Work Item"),
    to_state: tool.schema.string().describe("目标状态"),
    evidence: tool.schema
      .string()
      .optional()
      .describe("流转依据，如 Gate 结果"),
    workflow_type: tool.schema
      .string()
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
    const result = await daemon.invokeTool("sf_state_transition", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });

    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
