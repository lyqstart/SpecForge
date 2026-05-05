import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  getNode,
  getNeighbors,
  getSubgraph,
  getOverview,
  impactAnalysis,
  tracePath,
} from "../../../../.opencode/tools/lib/sf_knowledge_query_core"
import type {
  GraphNode,
  GraphEdge,
  GraphStore,
  NodeType,
  EdgeType,
} from "../../../../.opencode/tools/lib/sf_knowledge_graph_core"

// ============================================================
// Test Helpers
// ============================================================

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "kq-test-"))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function makeNode(overrides: Partial<GraphNode> & { id: string; type: NodeType }): GraphNode {
  const now = new Date().toISOString()
  return {
    work_item_id: "WI-001",
    label: "Test node",
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> & { source: string; target: string; type: EdgeType }): GraphEdge {
  return {
    work_item_id: "WI-001",
    inferred: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

async function setupGraph(baseDir: string, nodes: GraphNode[], edges: GraphEdge[] = []): Promise<void> {
  const graphDir = join(baseDir, "specforge", "knowledge")
  await mkdir(graphDir, { recursive: true })
  const store: GraphStore = { version: "1.0", nodes, edges }
  await writeFile(join(graphDir, "graph.json"), JSON.stringify(store, null, 2), "utf-8")
}

async function setupEmptyGraph(baseDir: string): Promise<void> {
  await setupGraph(baseDir, [], [])
}

// ============================================================
// Standard test graph: requirement → design → task → code_file
// with an inferred implements edge (code_file → requirement)
// ============================================================

function buildStandardGraph() {
  const nodes: GraphNode[] = [
    makeNode({ id: "WI-001:requirement:1", type: "requirement", label: "Req 1" }),
    makeNode({ id: "WI-001:design_decision:1", type: "design_decision", label: "Design 1" }),
    makeNode({ id: "WI-001:task:1", type: "task", label: "Task 1" }),
    makeNode({ id: "WI-001:code_file:1", type: "code_file", label: "core.ts", metadata: { path: "src/core.ts" } }),
  ]
  const edges: GraphEdge[] = [
    makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
    makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
    makeEdge({ source: "WI-001:task:1", target: "WI-001:code_file:1", type: "modifies" }),
    makeEdge({ source: "WI-001:code_file:1", target: "WI-001:requirement:1", type: "implements", inferred: true }),
  ]
  return { nodes, edges }
}

// ============================================================
// getNode
// ============================================================

describe("getNode", () => {
  it("should return node and its direct neighbors when node exists", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await getNode("WI-001:requirement:1", tempDir)
    expect(result.query_type).toBe("get_node")
    expect(result.found).toBe(true)
    expect(result.nodes.length).toBeGreaterThanOrEqual(1)
    expect(result.nodes[0].id).toBe("WI-001:requirement:1")
    // Should include neighbors (design_decision:1 via traces_to, code_file:1 via implements)
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("should return found=false when node does not exist", async () => {
    await setupEmptyGraph(tempDir)

    const result = await getNode("WI-001:requirement:99", tempDir)
    expect(result.found).toBe(false)
    expect(result.message).toContain("Node not found")
    expect(result.result_count).toBe(0)
  })
})

// ============================================================
// getNeighbors
// ============================================================

describe("getNeighbors", () => {
  it("should return all neighbor nodes", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await getNeighbors("WI-001:design_decision:1", tempDir)
    expect(result.found).toBe(true)
    expect(result.result_count).toBe(2) // requirement:1 and task:1
    const neighborIds = result.nodes.map((n) => n.id)
    expect(neighborIds).toContain("WI-001:requirement:1")
    expect(neighborIds).toContain("WI-001:task:1")
  })

  it("should return empty when node has no neighbors", async () => {
    const nodes = [makeNode({ id: "WI-001:requirement:1", type: "requirement" })]
    await setupGraph(tempDir, nodes, [])

    const result = await getNeighbors("WI-001:requirement:1", tempDir)
    expect(result.found).toBe(true)
    expect(result.result_count).toBe(0)
    expect(result.nodes).toHaveLength(0)
  })

  it("should return found=false when node does not exist", async () => {
    await setupEmptyGraph(tempDir)

    const result = await getNeighbors("WI-001:requirement:99", tempDir)
    expect(result.found).toBe(false)
    expect(result.message).toContain("Node not found")
  })

  it("should filter neighbors by node_type", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await getNeighbors("WI-001:design_decision:1", tempDir, { node_type: "task" })
    expect(result.result_count).toBe(1)
    expect(result.nodes[0].type).toBe("task")
  })

  it("should filter neighbors by edge_type", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await getNeighbors("WI-001:design_decision:1", tempDir, { edge_type: "traces_to" })
    // Only traces_to edges connect to design_decision:1 from requirement:1
    expect(result.result_count).toBe(1)
    expect(result.nodes[0].id).toBe("WI-001:requirement:1")
  })
})

// ============================================================
// getSubgraph
// ============================================================

describe("getSubgraph", () => {
  it("should return all nodes and edges for a work item", async () => {
    const { nodes, edges } = buildStandardGraph()
    // Add a node from a different work item
    const extraNode = makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002" })
    await setupGraph(tempDir, [...nodes, extraNode], edges)

    const result = await getSubgraph("WI-001", tempDir)
    expect(result.found).toBe(true)
    expect(result.result_count).toBe(4) // Only WI-001 nodes
    expect(result.nodes.every((n) => n.work_item_id === "WI-001")).toBe(true)
    expect(result.edges.every((e) => e.work_item_id === "WI-001")).toBe(true)
  })

  it("should return empty for non-existent work item", async () => {
    await setupEmptyGraph(tempDir)

    const result = await getSubgraph("WI-999", tempDir)
    expect(result.found).toBe(false)
    expect(result.result_count).toBe(0)
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})

// ============================================================
// getOverview
// ============================================================

describe("getOverview", () => {
  it("should return correct statistics", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await getOverview(tempDir)
    expect(result.query_type).toBe("get_overview")
    expect(result.total_nodes).toBe(4)
    expect(result.total_edges).toBe(4)
    expect(result.nodes_by_type.requirement).toBe(1)
    expect(result.nodes_by_type.design_decision).toBe(1)
    expect(result.nodes_by_type.task).toBe(1)
    expect(result.nodes_by_type.code_file).toBe(1)
    expect(result.edges_by_type.traces_to).toBe(1)
    expect(result.edges_by_type.decomposes_to).toBe(1)
    expect(result.edges_by_type.modifies).toBe(1)
    expect(result.edges_by_type.implements).toBe(1)
    expect(result.work_items).toContain("WI-001")
  })

  it("should return zeros for empty graph", async () => {
    await setupEmptyGraph(tempDir)

    const result = await getOverview(tempDir)
    expect(result.total_nodes).toBe(0)
    expect(result.total_edges).toBe(0)
    expect(result.work_items).toHaveLength(0)
  })
})

// ============================================================
// impactAnalysis
// ============================================================

describe("impactAnalysis", () => {
  describe("downstream", () => {
    it("should only follow source→target direction", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From requirement:1 downstream (excluding inferred edges)
      const result = await impactAnalysis("WI-001:requirement:1", "downstream", 5, tempDir)
      expect(result.found).toBe(true)
      // Should reach: design_decision:1, task:1, code_file:1
      expect(result.result_count).toBe(3)
      const ids = result.nodes.map((n) => n.id)
      expect(ids).toContain("WI-001:design_decision:1")
      expect(ids).toContain("WI-001:task:1")
      expect(ids).toContain("WI-001:code_file:1")
    })
  })

  describe("upstream", () => {
    it("should only follow target→source direction", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From code_file:1 upstream (excluding inferred edges)
      const result = await impactAnalysis("WI-001:code_file:1", "upstream", 5, tempDir)
      expect(result.found).toBe(true)
      // Should reach: task:1, design_decision:1, requirement:1
      expect(result.result_count).toBe(3)
      const ids = result.nodes.map((n) => n.id)
      expect(ids).toContain("WI-001:task:1")
      expect(ids).toContain("WI-001:design_decision:1")
      expect(ids).toContain("WI-001:requirement:1")
    })
  })

  describe("both", () => {
    it("should follow both directions", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From design_decision:1 both directions (excluding inferred)
      const result = await impactAnalysis("WI-001:design_decision:1", "both", 5, tempDir)
      expect(result.found).toBe(true)
      // Should reach: requirement:1 (upstream via traces_to), task:1 (downstream via decomposes_to), code_file:1 (downstream via modifies from task:1)
      expect(result.result_count).toBe(3)
    })
  })

  describe("depth limit", () => {
    it("should respect maxDepth", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From requirement:1 downstream with maxDepth=1
      const result = await impactAnalysis("WI-001:requirement:1", "downstream", 1, tempDir)
      expect(result.found).toBe(true)
      // Should only reach design_decision:1 (depth 1)
      expect(result.result_count).toBe(1)
      expect(result.nodes[0].id).toBe("WI-001:design_decision:1")
    })
  })

  describe("cycle handling", () => {
    it("should not infinite loop on cycles (implements cycle)", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // With includeInferred=true, there's a cycle: req→design→task→code→req
      const result = await impactAnalysis("WI-001:requirement:1", "downstream", 10, tempDir, undefined, true)
      expect(result.found).toBe(true)
      // Should visit all nodes but not loop infinitely
      expect(result.result_count).toBe(3) // design, task, code_file (req is start, already visited)
    })
  })

  describe("exclude inferred", () => {
    it("should default exclude inferred=true edges", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From code_file:1 downstream — the only downstream edge from code_file is implements (inferred)
      const result = await impactAnalysis("WI-001:code_file:1", "downstream", 5, tempDir)
      // Should NOT follow the implements edge (inferred=true)
      expect(result.result_count).toBe(0)
    })
  })

  describe("include_inferred=true", () => {
    it("should include inferred edges when includeInferred is true", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      // From code_file:1 downstream with includeInferred=true
      const result = await impactAnalysis("WI-001:code_file:1", "downstream", 5, tempDir, undefined, true)
      // Should follow implements edge to requirement:1
      expect(result.result_count).toBeGreaterThanOrEqual(1)
      const ids = result.nodes.map((n) => n.id)
      expect(ids).toContain("WI-001:requirement:1")
    })
  })

  describe("result has depth", () => {
    it("should include correct depth value for each node", async () => {
      const { nodes, edges } = buildStandardGraph()
      await setupGraph(tempDir, nodes, edges)

      const result = await impactAnalysis("WI-001:requirement:1", "downstream", 5, tempDir)
      // design_decision at depth 1, task at depth 2, code_file at depth 3
      const designNode = result.nodes.find((n) => n.id === "WI-001:design_decision:1") as any
      const taskNode = result.nodes.find((n) => n.id === "WI-001:task:1") as any
      const codeNode = result.nodes.find((n) => n.id === "WI-001:code_file:1") as any

      expect(designNode.depth).toBe(1)
      expect(taskNode.depth).toBe(2)
      expect(codeNode.depth).toBe(3)
    })
  })

  describe("node not found", () => {
    it("should return found=false for non-existent node", async () => {
      await setupEmptyGraph(tempDir)

      const result = await impactAnalysis("WI-001:requirement:99", "downstream", 3, tempDir)
      expect(result.found).toBe(false)
      expect(result.message).toContain("Node not found")
    })
  })
})

// ============================================================
// tracePath
// ============================================================

describe("tracePath", () => {
  it("should find path when one exists", async () => {
    // Use a graph without the implements edge to test a clear linear path
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", label: "Req 1" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision", label: "Design 1" }),
      makeNode({ id: "WI-001:task:1", type: "task", label: "Task 1" }),
      makeNode({ id: "WI-001:code_file:1", type: "code_file", label: "core.ts", metadata: { path: "src/core.ts" } }),
    ]
    const edges: GraphEdge[] = [
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
      makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
      makeEdge({ source: "WI-001:task:1", target: "WI-001:code_file:1", type: "modifies" }),
    ]
    await setupGraph(tempDir, nodes, edges)

    const result = await tracePath("WI-001:requirement:1", "WI-001:code_file:1", tempDir)
    expect(result.found).toBe(true)
    expect(result.result_count).toBeGreaterThanOrEqual(1)
    expect(result.paths).toBeDefined()
    expect(result.paths!.length).toBeGreaterThanOrEqual(1)
    // Shortest path: req → design → task → code_file (length 3)
    expect(result.paths![0].length).toBe(3)
  })

  it("should return found=false when no path exists", async () => {
    // Two disconnected nodes
    const nodes = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "WI-001:task:1", type: "task" }),
    ]
    await setupGraph(tempDir, nodes, [])

    const result = await tracePath("WI-001:requirement:1", "WI-001:task:1", tempDir)
    expect(result.found).toBe(false)
    expect(result.result_count).toBe(0)
    expect(result.paths).toHaveLength(0)
  })

  it("should respect max_depth limit", async () => {
    // Use a linear graph without shortcuts
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", label: "Req 1" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision", label: "Design 1" }),
      makeNode({ id: "WI-001:task:1", type: "task", label: "Task 1" }),
      makeNode({ id: "WI-001:code_file:1", type: "code_file", label: "core.ts", metadata: { path: "src/core.ts" } }),
    ]
    const edges: GraphEdge[] = [
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
      makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
      makeEdge({ source: "WI-001:task:1", target: "WI-001:code_file:1", type: "modifies" }),
    ]
    await setupGraph(tempDir, nodes, edges)

    // Path from req to code_file is length 3, set max_depth=2 so it can't be found
    const result = await tracePath("WI-001:requirement:1", "WI-001:code_file:1", tempDir, { max_depth: 2 })
    expect(result.found).toBe(false)
    expect(result.result_count).toBe(0)
  })

  it("should respect max_paths limit", async () => {
    // Create a graph with multiple paths
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision" }),
      makeNode({ id: "WI-001:design_decision:2", type: "design_decision" }),
      makeNode({ id: "WI-001:task:1", type: "task" }),
    ]
    const edges: GraphEdge[] = [
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:2", type: "traces_to" }),
      makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
      makeEdge({ source: "WI-001:design_decision:2", target: "WI-001:task:1", type: "decomposes_to" }),
    ]
    await setupGraph(tempDir, nodes, edges)

    const result = await tracePath("WI-001:requirement:1", "WI-001:task:1", tempDir, { max_paths: 1 })
    expect(result.found).toBe(true)
    expect(result.paths!.length).toBe(1)
  })

  it("should return error for non-existent source node", async () => {
    await setupEmptyGraph(tempDir)

    const result = await tracePath("WI-001:requirement:99", "WI-001:task:1", tempDir)
    expect(result.found).toBe(false)
    expect(result.message).toContain("Source node not found")
  })

  it("should return error for non-existent target node", async () => {
    const nodes = [makeNode({ id: "WI-001:requirement:1", type: "requirement" })]
    await setupGraph(tempDir, nodes, [])

    const result = await tracePath("WI-001:requirement:1", "WI-001:task:99", tempDir)
    expect(result.found).toBe(false)
    expect(result.message).toContain("Target node not found")
  })
})

// ============================================================
// Filter tests
// ============================================================

describe("filter", () => {
  it("should filter impactAnalysis by work_item_id", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision", work_item_id: "WI-001" }),
      makeNode({ id: "WI-002:design_decision:1", type: "design_decision", work_item_id: "WI-002" }),
    ]
    const edges: GraphEdge[] = [
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to", work_item_id: "WI-001" }),
      makeEdge({ source: "WI-001:requirement:1", target: "WI-002:design_decision:1", type: "traces_to", work_item_id: "WI-001" }),
    ]
    await setupGraph(tempDir, nodes, edges)

    const result = await impactAnalysis("WI-001:requirement:1", "downstream", 5, tempDir, { work_item_id: "WI-001" })
    expect(result.result_count).toBe(1)
    expect(result.nodes[0].work_item_id).toBe("WI-001")
  })

  it("should filter impactAnalysis by node_type", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await impactAnalysis("WI-001:requirement:1", "downstream", 5, tempDir, { node_type: "task" })
    // Only task nodes should be in results (but BFS still traverses through design_decision)
    for (const node of result.nodes) {
      expect(node.type).toBe("task")
    }
  })

  it("should filter impactAnalysis by edge_type", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)

    const result = await impactAnalysis("WI-001:requirement:1", "downstream", 5, tempDir, { edge_type: "traces_to" })
    // Only follows traces_to edges, so only reaches design_decision:1
    expect(result.result_count).toBe(1)
    expect(result.nodes[0].id).toBe("WI-001:design_decision:1")
  })

  it("should filter getNeighbors by work_item_id", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision", work_item_id: "WI-001" }),
      makeNode({ id: "WI-002:design_decision:1", type: "design_decision", work_item_id: "WI-002" }),
    ]
    const edges: GraphEdge[] = [
      makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
      makeEdge({ source: "WI-001:requirement:1", target: "WI-002:design_decision:1", type: "traces_to" }),
    ]
    await setupGraph(tempDir, nodes, edges)

    const result = await getNeighbors("WI-001:requirement:1", tempDir, { work_item_id: "WI-001" })
    expect(result.result_count).toBe(1)
    expect(result.nodes[0].work_item_id).toBe("WI-001")
  })
})
