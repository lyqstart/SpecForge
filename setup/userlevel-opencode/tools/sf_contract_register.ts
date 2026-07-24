import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "登记一条跨模块契约（共享枚举/不变量/公共接口/扩展点）到契约登记册。" +
    "这是契约模型的“提议填单”工具：它读取当前 extension_registry.json，在 contracts 块里加入一条契约，" +
    "把完整提议写入 candidates/project/extension_registry.json，并在 candidate_manifest.json 登记显式合并条目。" +
    "它绝不直接写 project 真相源——变更只通过正常的 候选门禁 → 用户决策 → Merge Runner 路径落盘。" +
    "适用于消费方遇到 contract_gap（需要未登记的共享取值/接口）时，由 owner 模块走治理把它正式登记。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
    kind: tool.schema
      .enum(["shared_enum", "invariant", "public_interface", "extension_point"])
      .describe("契约种类"),
    entry: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .describe("契约条目对象；必须含 id 与 owner_module。shared_enum 还需 values 数组"),
    workflow_path: tool.schema
      .string()
      .optional()
      .describe("可选，候选 manifest 的 workflow_path（默认 change_request）"),
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
