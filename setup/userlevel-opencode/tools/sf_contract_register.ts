import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "受治理地维护当前 Work Item 的 extension_registry Candidate。" +
    "action=add 时登记新 Contract 或 namespace_type；action=update 时仅更新正式 Registry 中已存在的同 kind、同 ID Project Contract；" +
    "action=reset 时从正式 Registry 基线重建当前 WI Candidate。" +
    "update 不支持 namespace_type，不允许改变 Contract ID，不存在或 kind 不一致时失败；所有动作只写 WI Candidate，绝不直接写正式 Project Registry。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
    action: tool.schema
      .enum(["add", "update", "reset"])
      .optional()
      .describe("可选：add=新增（默认）；update=更新同 kind、同 ID 的既有 Project Contract；reset=从 live registry 重建 Candidate"),
    kind: tool.schema
      .enum(["shared_enum", "invariant", "public_interface", "extension_point", "namespace_type"])
      .optional()
      .describe("action=add/update 时必填；update 不支持 namespace_type"),
    entry: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("action=add/update 时必填；Project Contract 需 id/owner_module；update 的 id 必须已存在且 kind 相同；shared_enum 需 value_type=string|number 且 values 非空、同类型、唯一"),
    workflow_path: tool.schema
      .string()
      .optional()
      .describe("可选，候选 manifest 的 workflow_path（默认 contract_change_path）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_contract_register", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
