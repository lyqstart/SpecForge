import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

export default tool({
  description:
    "使用原始用户请求创建新的 SpecForge Work Item。新 Work Item 只能由此工具创建；sf_state_transition 仅推进已存在的 Work Item。",
  args: {
    work_item_id: tool.schema
      .string()
      .optional()
      .describe("可选的 Work Item ID，格式为 WI-NNNN；省略时由 daemon 自动分配。"),
    user_request: tool.schema
      .string()
      .describe("未经改写的原始用户请求，作为 Work Item 的需求来源。"),
    classification: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("可选的工作分类；可包含 workflow_type、intent、change_type 等路由信息。"),
  },

  async execute(args, context) {
    const result = await daemon.invokeTool("sf_work_item_create", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });

    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
