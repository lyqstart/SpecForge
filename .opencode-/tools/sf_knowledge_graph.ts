import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "Knowledge Graph 读写工具：添加/删除节点、添加边、更新节点、从 spec 文件同步",
  args: {
    operation: tool.schema
      .enum(["add_nodes", "add_edges", "remove_nodes", "update_node", "sync_from_spec"])
      .describe("操作类型"),
    work_item_id: tool.schema.string().describe("Work Item ID"),
    scope: tool.schema
      .enum(["requirements", "design", "tasks", "verification"])
      .optional()
      .describe("同步范围（sync_from_spec 时必填）"),
    nodes: tool.schema
      .string()
      .optional()
      .describe("节点数组的 JSON 字符串（add_nodes 时使用）"),
    edges: tool.schema
      .string()
      .optional()
      .describe("边数组的 JSON 字符串（add_edges 时使用）"),
    node_ids: tool.schema
      .string()
      .optional()
      .describe("节点 ID 数组的 JSON 字符串（remove_nodes 时使用）"),
    node_id: tool.schema
      .string()
      .optional()
      .describe("要更新的节点 ID（update_node 时使用）"),
    label: tool.schema
      .string()
      .optional()
      .describe("新的节点标签（update_node 时使用）"),
    metadata: tool.schema
      .string()
      .optional()
      .describe("节点 metadata 的 JSON 字符串（update_node 时使用）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_knowledge_graph", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
