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
    classification: tool.schema.object({
      requirement_changed: tool.schema.boolean().describe("是否改变产品需求。新增产品功能必须为 true。"),
      acceptance_criteria_changed: tool.schema.boolean().describe("是否新增或改变验收标准。"),
      business_rule_changed: tool.schema.boolean().describe("是否新增或改变业务规则。"),
      user_visible_behavior_changed: tool.schema.boolean().describe("用户可见行为是否变化。"),
      data_semantics_changed: tool.schema.boolean().describe("数据含义是否变化。"),
      design_changed: tool.schema.boolean().describe("设计是否变化。"),
      module_boundary_changed: tool.schema.boolean().describe("模块边界是否变化。"),
      api_contract_changed: tool.schema.boolean().describe("API 契约是否变化。"),
      architecture_changed: tool.schema.boolean().describe("架构是否变化。"),
      data_model_changed: tool.schema.boolean().describe("数据模型是否变化；从缺失或占位状态建立首份正式数据模型也必须为 true。"),
      module_contract_changed: tool.schema.boolean().describe("模块契约是否变化；从缺失或占位状态建立首份正式模块契约也必须为 true。"),
      contract_registry_only: tool.schema.boolean().optional().describe("是否仅修改契约注册表。"),
      unknowns: tool.schema.array(tool.schema.string()).describe("尚未确认、必须继续取证的事实；没有时传空数组。"),
    }).describe(
      "变更事实分类。11 个布尔事实字段必须全部填写；创建首份正式架构、数据模型、设计或模块契约也属于对应 changed=true。不得传 workflow_path、workflow_type、intent 或 change_type 来覆盖路由。",
    ),
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
