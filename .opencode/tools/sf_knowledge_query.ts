import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

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
    const result = await daemon.invokeTool("sf_knowledge_query", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
