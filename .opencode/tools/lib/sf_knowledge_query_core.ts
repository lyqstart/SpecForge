/**
 * sf_knowledge_query 核心逻辑
 * Knowledge Graph 查询函数：getNode、getNeighbors、getSubgraph、getOverview、impactAnalysis、tracePath
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时）
 *
 * Requirements: 3.1-3.10
 */

import { loadGraphStore } from "./sf_knowledge_graph_core"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"
import type { GraphNode, GraphEdge, GraphStore, NodeType, EdgeType } from "./sf_knowledge_graph_core"

// ============================================================
// Types
// ============================================================

export type Direction = "downstream" | "upstream" | "both"

export interface QueryResult {
  query_type: string
  result_count: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  found?: boolean
  message?: string
  paths?: GraphPath[]
}

export interface OverviewResult {
  query_type: "get_overview"
  nodes_by_type: Record<NodeType, number>
  edges_by_type: Record<EdgeType, number>
  work_items: string[]
  total_nodes: number
  total_edges: number
}

export interface GraphPath {
  nodes: GraphNode[]
  edges: GraphEdge[]
  length: number
}

export interface QueryFilter {
  work_item_id?: string
  node_type?: NodeType
  edge_type?: EdgeType
}

// ============================================================
// Helper: load store or return error result
// ============================================================

async function loadStore(baseDir: string): Promise<{ store?: GraphStore; error?: QueryResult }> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  const loadResult = await loadGraphStore(baseDir)
  if (!loadResult.success || !loadResult.store) {
    return {
      error: {
        query_type: "error",
        result_count: 0,
        nodes: [],
        edges: [],
        found: false,
        message: loadResult.error || "Failed to load graph store",
      },
    }
  }
  return { store: loadResult.store }
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Get a single node and its direct neighbors (connected nodes and edges).
 */
export async function getNode(nodeId: string, baseDir: string): Promise<QueryResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) return error

  const node = store!.nodes.find((n) => n.id === nodeId)
  if (!node) {
    return {
      query_type: "get_node",
      result_count: 0,
      nodes: [],
      edges: [],
      found: false,
      message: `Node not found: ${nodeId}`,
    }
  }

  // Find direct edges
  const directEdges = store!.edges.filter(
    (e) => e.source === nodeId || e.target === nodeId
  )

  // Find neighbor nodes
  const neighborIds = new Set<string>()
  for (const edge of directEdges) {
    if (edge.source === nodeId) neighborIds.add(edge.target)
    if (edge.target === nodeId) neighborIds.add(edge.source)
  }

  const neighborNodes = store!.nodes.filter((n) => neighborIds.has(n.id))

  return {
    query_type: "get_node",
    result_count: 1 + neighborNodes.length,
    nodes: [node, ...neighborNodes],
    edges: directEdges,
    found: true,
  }
}

/**
 * Get all neighbor nodes of a given node, optionally filtered.
 */
export async function getNeighbors(
  nodeId: string,
  baseDir: string,
  filter?: QueryFilter
): Promise<QueryResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) return error

  const node = store!.nodes.find((n) => n.id === nodeId)
  if (!node) {
    return {
      query_type: "get_neighbors",
      result_count: 0,
      nodes: [],
      edges: [],
      found: false,
      message: `Node not found: ${nodeId}`,
    }
  }

  // Find direct edges
  let directEdges = store!.edges.filter(
    (e) => e.source === nodeId || e.target === nodeId
  )

  // Apply edge_type filter
  if (filter?.edge_type) {
    directEdges = directEdges.filter((e) => e.type === filter.edge_type)
  }

  // Find neighbor node IDs
  const neighborIds = new Set<string>()
  for (const edge of directEdges) {
    if (edge.source === nodeId) neighborIds.add(edge.target)
    if (edge.target === nodeId) neighborIds.add(edge.source)
  }

  // Get neighbor nodes
  let neighborNodes = store!.nodes.filter((n) => neighborIds.has(n.id))

  // Apply filters
  if (filter?.work_item_id) {
    neighborNodes = neighborNodes.filter((n) => n.work_item_id === filter.work_item_id)
  }
  if (filter?.node_type) {
    neighborNodes = neighborNodes.filter((n) => n.type === filter.node_type)
  }

  return {
    query_type: "get_neighbors",
    result_count: neighborNodes.length,
    nodes: neighborNodes,
    edges: directEdges,
    found: true,
  }
}

/**
 * Get all nodes and edges for a specific work item.
 */
export async function getSubgraph(workItemId: string, baseDir: string): Promise<QueryResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) return error

  const nodes = store!.nodes.filter((n) => n.work_item_id === workItemId)
  const edges = store!.edges.filter((e) => e.work_item_id === workItemId)

  return {
    query_type: "get_subgraph",
    result_count: nodes.length,
    nodes,
    edges,
    found: nodes.length > 0,
  }
}

/**
 * Get overview statistics of the graph store.
 */
export async function getOverview(baseDir: string): Promise<OverviewResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) {
    return {
      query_type: "get_overview",
      nodes_by_type: { requirement: 0, design_decision: 0, task: 0, code_file: 0 },
      edges_by_type: { traces_to: 0, decomposes_to: 0, modifies: 0, implements: 0 },
      work_items: [],
      total_nodes: 0,
      total_edges: 0,
    }
  }

  const nodesByType: Record<NodeType, number> = {
    requirement: 0,
    design_decision: 0,
    task: 0,
    code_file: 0,
  }
  for (const node of store!.nodes) {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1
  }

  const edgesByType: Record<EdgeType, number> = {
    traces_to: 0,
    decomposes_to: 0,
    modifies: 0,
    implements: 0,
  }
  for (const edge of store!.edges) {
    edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1
  }

  const workItems = [...new Set(store!.nodes.map((n) => n.work_item_id))]

  return {
    query_type: "get_overview",
    nodes_by_type: nodesByType,
    edges_by_type: edgesByType,
    work_items: workItems,
    total_nodes: store!.nodes.length,
    total_edges: store!.edges.length,
  }
}

/**
 * Impact analysis: BFS traversal along specified direction.
 * Default excludes inferred=true edges to prevent impact pollution.
 * Each result node has a depth field.
 */
export async function impactAnalysis(
  nodeId: string,
  direction: Direction,
  maxDepth: number,
  baseDir: string,
  filter?: QueryFilter,
  includeInferred?: boolean
): Promise<QueryResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) return error

  const node = store!.nodes.find((n) => n.id === nodeId)
  if (!node) {
    return {
      query_type: "impact_analysis",
      result_count: 0,
      nodes: [],
      edges: [],
      found: false,
      message: `Node not found: ${nodeId}`,
    }
  }

  // BFS
  const visited = new Set<string>([nodeId])
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }]
  const resultNodes: Array<GraphNode & { depth: number }> = []
  const resultEdges: GraphEdge[] = []

  while (queue.length > 0) {
    const { id: currentId, depth: currentDepth } = queue.shift()!

    if (currentDepth >= maxDepth) continue

    // Find edges based on direction
    let relevantEdges: GraphEdge[] = []

    if (direction === "downstream" || direction === "both") {
      // downstream: follow source→target (current is source)
      const downstream = store!.edges.filter((e) => e.source === currentId)
      relevantEdges.push(...downstream)
    }

    if (direction === "upstream" || direction === "both") {
      // upstream: follow target→source (current is target)
      const upstream = store!.edges.filter((e) => e.target === currentId)
      relevantEdges.push(...upstream)
    }

    // Filter out inferred edges unless includeInferred is true
    if (!includeInferred) {
      relevantEdges = relevantEdges.filter((e) => !e.inferred)
    }

    // Apply edge_type filter
    if (filter?.edge_type) {
      relevantEdges = relevantEdges.filter((e) => e.type === filter.edge_type)
    }

    for (const edge of relevantEdges) {
      // Determine neighbor based on direction
      let neighborId: string
      if (direction === "downstream") {
        neighborId = edge.target
      } else if (direction === "upstream") {
        neighborId = edge.source
      } else {
        // both: neighbor is the other end
        neighborId = edge.source === currentId ? edge.target : edge.source
      }

      if (visited.has(neighborId)) continue

      const neighborNode = store!.nodes.find((n) => n.id === neighborId)
      if (!neighborNode) continue

      // Apply filters
      if (filter?.work_item_id && neighborNode.work_item_id !== filter.work_item_id) continue
      if (filter?.node_type && neighborNode.type !== filter.node_type) continue

      visited.add(neighborId)
      const nodeWithDepth = { ...neighborNode, depth: currentDepth + 1 }
      resultNodes.push(nodeWithDepth)
      resultEdges.push(edge)
      queue.push({ id: neighborId, depth: currentDepth + 1 })
    }
  }

  // Sort by depth ascending
  resultNodes.sort((a, b) => a.depth - b.depth)

  return {
    query_type: "impact_analysis",
    result_count: resultNodes.length,
    nodes: resultNodes,
    edges: resultEdges,
    found: true,
  }
}

/**
 * Find paths from source to target, shortest first.
 * Uses BFS to find paths. Prevents path explosion with max_depth and max_paths.
 */
export async function tracePath(
  sourceId: string,
  targetId: string,
  baseDir: string,
  options?: { max_depth?: number; max_paths?: number }
): Promise<QueryResult> {
  const { store, error } = await loadStore(baseDir)
  if (error) return error

  const maxDepth = options?.max_depth ?? 5
  const maxPaths = options?.max_paths ?? 10

  const sourceNode = store!.nodes.find((n) => n.id === sourceId)
  if (!sourceNode) {
    return {
      query_type: "trace_path",
      result_count: 0,
      nodes: [],
      edges: [],
      found: false,
      message: `Source node not found: ${sourceId}`,
      paths: [],
    }
  }

  const targetNode = store!.nodes.find((n) => n.id === targetId)
  if (!targetNode) {
    return {
      query_type: "trace_path",
      result_count: 0,
      nodes: [],
      edges: [],
      found: false,
      message: `Target node not found: ${targetId}`,
      paths: [],
    }
  }

  // BFS to find paths (shortest first)
  // Each queue entry is a path: list of node IDs and edges traversed
  interface PathEntry {
    nodeIds: string[]
    edges: GraphEdge[]
  }

  const foundPaths: GraphPath[] = []
  const queue: PathEntry[] = [{ nodeIds: [sourceId], edges: [] }]

  while (queue.length > 0 && foundPaths.length < maxPaths) {
    const current = queue.shift()!
    const currentNodeId = current.nodeIds[current.nodeIds.length - 1]

    if (current.nodeIds.length - 1 >= maxDepth) continue

    // Find all edges connected to current node (both directions)
    const connectedEdges = store!.edges.filter(
      (e) => e.source === currentNodeId || e.target === currentNodeId
    )

    for (const edge of connectedEdges) {
      const neighborId = edge.source === currentNodeId ? edge.target : edge.source

      // Prevent cycles within a single path
      if (current.nodeIds.includes(neighborId)) continue

      const newPath: PathEntry = {
        nodeIds: [...current.nodeIds, neighborId],
        edges: [...current.edges, edge],
      }

      if (neighborId === targetId) {
        // Found a path
        const pathNodes = newPath.nodeIds.map(
          (id) => store!.nodes.find((n) => n.id === id)!
        )
        foundPaths.push({
          nodes: pathNodes,
          edges: newPath.edges,
          length: newPath.edges.length,
        })

        if (foundPaths.length >= maxPaths) break
      } else {
        queue.push(newPath)
      }
    }
  }

  // Collect all unique nodes and edges from found paths
  const allNodeIds = new Set<string>()
  const allEdgeKeys = new Set<string>()
  const allNodes: GraphNode[] = []
  const allEdges: GraphEdge[] = []

  for (const path of foundPaths) {
    for (const node of path.nodes) {
      if (!allNodeIds.has(node.id)) {
        allNodeIds.add(node.id)
        allNodes.push(node)
      }
    }
    for (const edge of path.edges) {
      const key = `${edge.source}|${edge.target}|${edge.type}`
      if (!allEdgeKeys.has(key)) {
        allEdgeKeys.add(key)
        allEdges.push(edge)
      }
    }
  }

  return {
    query_type: "trace_path",
    result_count: foundPaths.length,
    nodes: allNodes,
    edges: allEdges,
    found: foundPaths.length > 0,
    paths: foundPaths,
  }
}
