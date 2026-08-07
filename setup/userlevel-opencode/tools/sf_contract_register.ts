import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "受治理地维护当前 Work Item 的 Contract Candidate。" +
    "action=add 时登记新 Project Contract 或 namespace_type；action=update 时仅更新正式 Registry 中已存在的同 kind、同 ID Project Contract；" +
    "action=promote 时仅允许 architecture_change_path，把当前 Module/Internal Contract 受控升级为不同 ID 的 Project/Public Contract，同时退休旧 Module Contract Candidate 并记录 contract_promotions；" +
    "action=reset 时从正式 Registry 基线重建当前 WI Project Contract Candidate。" +
    "Promotion 的新 Project Contract source_refs 必须是真实 ARCH-/DATA- ID，并必须提供 migration_conclusion 与 compatibility。所有动作只写 WI Candidate，绝不直接写正式 Project Registry。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
    action: tool.schema
      .enum(["add", "update", "promote", "reset"])
      .optional()
      .describe("add=新增（默认）；update=更新既有 Project Contract；promote=Module→Project Promotion；reset=从 live registry 重建 Candidate"),
    kind: tool.schema
      .enum(["shared_enum", "invariant", "public_interface", "extension_point", "namespace_type"])
      .optional()
      .describe("action=add/update/promote 时必填；update/promote 不支持 namespace_type"),
    entry: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("action=add/update/promote 时必填；promote 时 id 必须为新的 Project Contract ID，source_refs 只能为真实 ARCH-/DATA-*"),
    workflow_path: tool.schema
      .string()
      .optional()
      .describe("候选 workflow_path；promote 固定要求 architecture_change_path"),
    source_module: tool.schema
      .string()
      .optional()
      .describe("action=promote 必填：旧 Module/Internal Contract 所属 MODULE_CODE"),
    from_contract_id: tool.schema
      .string()
      .optional()
      .describe("action=promote 必填：当前正式 Module/Internal Contract ID"),
    migration_conclusion: tool.schema
      .string()
      .optional()
      .describe("action=promote 必填：消费者迁移闭环结论"),
    compatibility: tool.schema
      .string()
      .optional()
      .describe("action=promote 必填：兼容性/破坏性及消费者处理结论"),
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
