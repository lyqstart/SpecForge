/**
 * sf_knowledge_query - Knowledge Graph 查询工具
 *
 * 提供 Knowledge Graph 的查询操作：获取节点、邻居、子图、概览、影响分析、路径追溯。
 * 核心逻辑委托给 sf_knowledge_query_core.ts。
 *
 * Requirements: 3.1, 3.2
 */

import { tool } from "@opencode-ai/plugin"
import {
  getNode,
  getNeighbors,
  getSubgraph,
  getOverview,
  impactAnalysis,
  tracePath,
} from "./lib/sf_knowledge_query_core"
import type { Direction, QueryFilter } from "./lib/sf_knowledge_query_core"
import type { NodeType, EdgeType } from "./lib/sf_knowledge_graph_core"

export default tool({
  description:
    "Knowledge Graph 查询工具：获取节点详情、邻居节点、子图、概览统计、影响分析、路径追溯",
  args: {
    query_type: tool.schema
      .enum(["get_node", "get_neighbors", "get_subgraph", "get_overview", "impact_analysis", "trace_path"])
      .describe("查询类型"),
    node_id: tool.schema
      .string()
      .optional()
      .describe("节点 ID（get_node、get_neighbors、impact_analysis 时使用）"),
    work_item_id: tool.schema
      .string()
      .optional()
      .describe("Work Item ID（get_subgraph 时使用）"),
    direction: tool.schema
      .enum(["downstream", "upstream", "both"])
      .optional()
      .describe("影响分析方向（impact_analysis 时使用，默认 downstream）"),
    max_depth: tool.schema
      .number()
      .optional()
      .describe("最大遍历深度（impact_analysis 默认 3，trace_path 默认 5）"),
    source_id: tool.schema
      .string()
      .optional()
      .describe("源节点 ID（trace_path 时使用）"),
    target_id: tool.schema
      .string()
      .optional()
      .describe("目标节点 ID（trace_path 时使用）"),
    max_paths: tool.schema
      .number()
      .optional()
      .describe("最大路径数（trace_path 时使用，默认 10）"),
    include_inferred: tool.schema
      .boolean()
      .optional()
      .describe("是否包含推导边（impact_analysis 时使用，默认 false）"),
    filter_work_item_id: tool.schema
      .string()
      .optional()
      .describe("过滤条件：Work Item ID"),
    filter_node_type: tool.schema
      .string()
      .optional()
      .describe("过滤条件：节点类型"),
    filter_edge_type: tool.schema
      .string()
      .optional()
      .describe("过滤条件：边类型"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()

    // Build filter if any filter params provided
    const filter: QueryFilter | undefined =
      args.filter_work_item_id || args.filter_node_type || args.filter_edge_type
        ? {
            work_item_id: args.filter_work_item_id,
            node_type: args.filter_node_type as NodeType | undefined,
            edge_type: args.filter_edge_type as EdgeType | undefined,
          }
        : undefined

    switch (args.query_type) {
      case "get_node": {
        if (!args.node_id) {
          return JSON.stringify({ query_type: "get_node", result_count: 0, nodes: [], edges: [], found: false, message: "node_id parameter is required" })
        }
        const result = await getNode(args.node_id, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "get_neighbors": {
        if (!args.node_id) {
          return JSON.stringify({ query_type: "get_neighbors", result_count: 0, nodes: [], edges: [], found: false, message: "node_id parameter is required" })
        }
        const result = await getNeighbors(args.node_id, baseDir, filter)
        return JSON.stringify(result, null, 2)
      }

      case "get_subgraph": {
        if (!args.work_item_id) {
          return JSON.stringify({ query_type: "get_subgraph", result_count: 0, nodes: [], edges: [], found: false, message: "work_item_id parameter is required" })
        }
        const result = await getSubgraph(args.work_item_id, baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "get_overview": {
        const result = await getOverview(baseDir)
        return JSON.stringify(result, null, 2)
      }

      case "impact_analysis": {
        if (!args.node_id) {
          return JSON.stringify({ query_type: "impact_analysis", result_count: 0, nodes: [], edges: [], found: false, message: "node_id parameter is required" })
        }
        const direction: Direction = (args.direction as Direction) || "downstream"
        const maxDepth = args.max_depth ?? 3
        const result = await impactAnalysis(args.node_id, direction, maxDepth, baseDir, filter, args.include_inferred)
        return JSON.stringify(result, null, 2)
      }

      case "trace_path": {
        if (!args.source_id || !args.target_id) {
          return JSON.stringify({ query_type: "trace_path", result_count: 0, nodes: [], edges: [], found: false, message: "source_id and target_id parameters are required", paths: [] })
        }
        const options = {
          max_depth: args.max_depth ?? 5,
          max_paths: args.max_paths ?? 10,
        }
        const result = await tracePath(args.source_id, args.target_id, baseDir, options)
        return JSON.stringify(result, null, 2)
      }

      default:
        return JSON.stringify({ query_type: "error", result_count: 0, nodes: [], edges: [], message: `Unknown query_type: ${args.query_type}` })
    }
  },
})
