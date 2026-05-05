/**
 * sf_knowledge_graph - Knowledge Graph 读写工具
 *
 * 提供 Knowledge Graph 的节点和边 CRUD 操作，以及从 spec 文件同步。
 * 核心逻辑委托给 sf_knowledge_graph_core.ts。
 *
 * Requirements: 2.1, 2.2
 */

import { tool } from "@opencode-ai/plugin"
import {
  addNodes,
  addEdges,
  removeNodes,
  updateNode,
  syncFromSpec,
} from "./lib/sf_knowledge_graph_core"
import type { GraphNode, GraphEdge, SyncScope } from "./lib/sf_knowledge_graph_core"

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
    const baseDir = context.directory || context.worktree || process.cwd()

    switch (args.operation) {
      case "add_nodes": {
        if (!args.nodes) {
          return JSON.stringify({ success: false, error: "nodes parameter is required for add_nodes" })
        }
        const nodes: GraphNode[] = JSON.parse(args.nodes)
        const result = await addNodes(nodes, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "add_edges": {
        if (!args.edges) {
          return JSON.stringify({ success: false, error: "edges parameter is required for add_edges" })
        }
        const edges: GraphEdge[] = JSON.parse(args.edges)
        const result = await addEdges(edges, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "remove_nodes": {
        if (!args.node_ids) {
          return JSON.stringify({ success: false, error: "node_ids parameter is required for remove_nodes" })
        }
        const nodeIds: string[] = JSON.parse(args.node_ids)
        const result = await removeNodes(nodeIds, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "update_node": {
        if (!args.node_id) {
          return JSON.stringify({ success: false, error: "node_id parameter is required for update_node" })
        }
        const updates: { label?: string; metadata?: Record<string, unknown> } = {}
        if (args.label !== undefined) {
          updates.label = args.label
        }
        if (args.metadata !== undefined) {
          updates.metadata = JSON.parse(args.metadata)
        }
        const result = await updateNode(args.node_id, updates, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "sync_from_spec": {
        if (!args.scope) {
          return JSON.stringify({ success: false, error: "scope parameter is required for sync_from_spec" })
        }
        const result = await syncFromSpec(args.work_item_id, baseDir, args.scope as SyncScope)
        return JSON.stringify(result, null, 2)
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown operation: ${args.operation}` })
    }
  },
})
