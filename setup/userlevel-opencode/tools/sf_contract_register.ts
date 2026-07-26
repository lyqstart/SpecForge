import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "受治理地维护当前 Work Item 的 extension_registry Candidate。" +
    "action=add 时登记一条跨模块契约或命名空间类型；同一 WI 连续调用会在已有 Candidate 上累积。" +
    "action=reset 时丢弃当前 WI 的旧 extension_registry Candidate 内容，并从正式 live registry 基线重建 Candidate，" +
    "用于清理缺陷/测试产生的候选污染；reset 不修改正式 registry，也不执行 Merge。" +
    "工具会把完整提议写入 candidates/project/extension_registry.json，并在 candidate_manifest.json 登记显式合并条目。" +
    "它绝不直接写 project 真相源——变更只通过正常的 候选门禁 → 用户决策 → Merge Runner 路径落盘。" +
    "适用于消费方遇到 contract_gap（需要未登记的共享取值/接口）时，由 owner 模块走治理把它正式登记。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，例如 WI-0001"),
    action: tool.schema
      .enum(["add", "reset"])
      .optional()
      .describe("可选：add=登记（默认）；reset=从 live registry 基线重建当前 WI Candidate"),
    kind: tool.schema
      .enum(["shared_enum", "invariant", "public_interface", "extension_point", "namespace_type"])
      .optional()
      .describe("action=add 时必填：契约种类"),
    entry: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("action=add 时必填：契约条目需 id/owner_module；namespace_type 需 namespace/type_id；shared_enum 必须显式提供 value_type=string|number，values 必须与该类型一致、非空且唯一；不支持对象数组或混合类型"),
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
