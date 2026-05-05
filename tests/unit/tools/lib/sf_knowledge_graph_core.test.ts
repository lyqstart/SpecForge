import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  isValidNodeId,
  isValidNodeType,
  isValidEdgeType,
  loadGraphStore,
  saveGraphStore,
  isKGEnabled,
  addNodes,
  addEdges,
  removeNodes,
  updateNode,
  syncFromSpec,
  type GraphNode,
  type GraphEdge,
  type GraphStore,
  type NodeType,
  type EdgeType,
  type SyncScope,
} from "../../../../.opencode/tools/lib/sf_knowledge_graph_core"

// ============================================================
// Test Helpers
// ============================================================

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "kg-test-"))
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

async function setupEmptyGraph(baseDir: string): Promise<void> {
  const graphDir = join(baseDir, "specforge", "knowledge")
  await mkdir(graphDir, { recursive: true })
  const store: GraphStore = { version: "1.0", nodes: [], edges: [] }
  await writeFile(join(graphDir, "graph.json"), JSON.stringify(store, null, 2), "utf-8")
}

async function setupConfig(baseDir: string, config: Record<string, unknown>): Promise<void> {
  const configDir = join(baseDir, "specforge", "config")
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, "project.json"), JSON.stringify(config, null, 2), "utf-8")
}

async function setupGraphWithNodes(baseDir: string, nodes: GraphNode[], edges: GraphEdge[] = []): Promise<void> {
  const graphDir = join(baseDir, "specforge", "knowledge")
  await mkdir(graphDir, { recursive: true })
  const store: GraphStore = { version: "1.0", nodes, edges }
  await writeFile(join(graphDir, "graph.json"), JSON.stringify(store, null, 2), "utf-8")
}

// ============================================================
// isValidNodeId
// ============================================================

describe("isValidNodeId", () => {
  it("should return true for valid IDs", () => {
    expect(isValidNodeId("WI-001:requirement:1")).toBe(true)
    expect(isValidNodeId("WI-001:design_decision:2")).toBe(true)
    expect(isValidNodeId("WI-001:task:10")).toBe(true)
    expect(isValidNodeId("WI-001:code_file:3")).toBe(true)
  })

  it("should handle complex work_item_ids", () => {
    expect(isValidNodeId("ABC-123:requirement:1")).toBe(true)
    expect(isValidNodeId("My_Project-v2:task:5")).toBe(true)
    expect(isValidNodeId("A:requirement:1")).toBe(true)
    expect(isValidNodeId("WI001:requirement:1")).toBe(true)
  })

  it("should return false for invalid IDs", () => {
    expect(isValidNodeId("")).toBe(false)
    expect(isValidNodeId("no-colons")).toBe(false)
    expect(isValidNodeId("WI-001:requirement")).toBe(false)
    expect(isValidNodeId("WI-001:invalid_type:1")).toBe(false)
    expect(isValidNodeId("WI-001:requirement:0")).toBe(false)
    expect(isValidNodeId("WI-001:requirement:-1")).toBe(false)
    expect(isValidNodeId("WI-001:requirement:abc")).toBe(false)
    expect(isValidNodeId(":requirement:1")).toBe(false)
    expect(isValidNodeId("-invalid:requirement:1")).toBe(false)
    expect(isValidNodeId("_invalid:requirement:1")).toBe(false)
  })

  it("should handle work_item_id with colons correctly (split by last two colons)", () => {
    // work_item_id cannot contain colons since it must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/
    expect(isValidNodeId("a:b:requirement:1")).toBe(false)
  })
})

// ============================================================
// isValidNodeType
// ============================================================

describe("isValidNodeType", () => {
  it("should return true for valid types", () => {
    expect(isValidNodeType("requirement")).toBe(true)
    expect(isValidNodeType("design_decision")).toBe(true)
    expect(isValidNodeType("task")).toBe(true)
    expect(isValidNodeType("code_file")).toBe(true)
  })

  it("should return false for invalid types", () => {
    expect(isValidNodeType("invalid")).toBe(false)
    expect(isValidNodeType("")).toBe(false)
    expect(isValidNodeType("REQUIREMENT")).toBe(false)
  })
})

// ============================================================
// isValidEdgeType
// ============================================================

describe("isValidEdgeType", () => {
  it("should return true for valid types", () => {
    expect(isValidEdgeType("traces_to")).toBe(true)
    expect(isValidEdgeType("decomposes_to")).toBe(true)
    expect(isValidEdgeType("modifies")).toBe(true)
    expect(isValidEdgeType("implements")).toBe(true)
  })

  it("should return false for invalid types", () => {
    expect(isValidEdgeType("invalid")).toBe(false)
    expect(isValidEdgeType("")).toBe(false)
  })
})

// ============================================================
// isKGEnabled
// ============================================================

describe("isKGEnabled", () => {
  it("should return true when knowledge_graph_enabled is true", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: true })
    expect(await isKGEnabled(tempDir)).toBe(true)
  })

  it("should return false when knowledge_graph_enabled is false", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: false })
    expect(await isKGEnabled(tempDir)).toBe(false)
  })

  it("should return true when field is missing (default)", async () => {
    await setupConfig(tempDir, { name: "test" })
    expect(await isKGEnabled(tempDir)).toBe(true)
  })

  it("should return true when config file does not exist", async () => {
    expect(await isKGEnabled(tempDir)).toBe(true)
  })
})

// ============================================================
// loadGraphStore
// ============================================================

describe("loadGraphStore", () => {
  it("should load existing graph.json", async () => {
    const store: GraphStore = {
      version: "1.0",
      nodes: [makeNode({ id: "WI-001:requirement:1", type: "requirement" })],
      edges: [],
    }
    await setupGraphWithNodes(tempDir, store.nodes, store.edges)

    const result = await loadGraphStore(tempDir)
    expect(result.success).toBe(true)
    expect(result.store?.nodes).toHaveLength(1)
    expect(result.store?.nodes[0].id).toBe("WI-001:requirement:1")
  })

  it("should create empty graph when file does not exist and KG is enabled", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const result = await loadGraphStore(tempDir)
    expect(result.success).toBe(true)
    expect(result.store?.nodes).toHaveLength(0)
    expect(result.store?.edges).toHaveLength(0)

    // Verify file was created
    const content = await readFile(join(tempDir, "specforge", "knowledge", "graph.json"), "utf-8")
    expect(JSON.parse(content)).toEqual({ version: "1.0", nodes: [], edges: [] })
  })

  it("should return error when file does not exist and KG is disabled", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: false })

    const result = await loadGraphStore(tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("disabled")
  })

  it("should return error when JSON is corrupted (not overwrite)", async () => {
    const graphDir = join(tempDir, "specforge", "knowledge")
    await mkdir(graphDir, { recursive: true })
    await writeFile(join(graphDir, "graph.json"), "{ invalid json !!!", "utf-8")

    const result = await loadGraphStore(tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("corrupted")

    // Verify original file is preserved
    const content = await readFile(join(graphDir, "graph.json"), "utf-8")
    expect(content).toBe("{ invalid json !!!")
  })
})

// ============================================================
// saveGraphStore
// ============================================================

describe("saveGraphStore", () => {
  it("should write graph atomically", async () => {
    const store: GraphStore = {
      version: "1.0",
      nodes: [makeNode({ id: "WI-001:requirement:1", type: "requirement" })],
      edges: [],
    }

    await saveGraphStore(store, tempDir)

    const content = await readFile(join(tempDir, "specforge", "knowledge", "graph.json"), "utf-8")
    const loaded = JSON.parse(content)
    expect(loaded.version).toBe("1.0")
    expect(loaded.nodes).toHaveLength(1)
  })

  it("should create directory if it does not exist", async () => {
    const store: GraphStore = { version: "1.0", nodes: [], edges: [] }
    await saveGraphStore(store, tempDir)

    const content = await readFile(join(tempDir, "specforge", "knowledge", "graph.json"), "utf-8")
    expect(JSON.parse(content)).toEqual({ version: "1.0", nodes: [], edges: [] })
  })
})

// ============================================================
// addNodes
// ============================================================

describe("addNodes", () => {
  beforeEach(async () => {
    await setupEmptyGraph(tempDir)
  })

  it("should add valid nodes", async () => {
    const nodes = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "WI-001:task:1", type: "task" }),
    ]

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_added).toBe(2)
  })

  it("should reject invalid node ID format", async () => {
    const nodes = [makeNode({ id: "invalid-id", type: "requirement" })]

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid node ID format")
  })

  it("should reject duplicate node IDs", async () => {
    const nodes = [makeNode({ id: "WI-001:requirement:1", type: "requirement" })]
    await addNodes(nodes, tempDir)

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Duplicate node ID")
  })

  it("should require metadata.path for code_file nodes", async () => {
    const nodes = [makeNode({ id: "WI-001:code_file:1", type: "code_file" })]

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("metadata.path")
  })

  it("should accept code_file nodes with metadata.path", async () => {
    const nodes = [
      makeNode({
        id: "WI-001:code_file:1",
        type: "code_file",
        metadata: { path: "src/index.ts" },
      }),
    ]

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_added).toBe(1)
  })

  it("should partially succeed with warnings when some nodes are invalid", async () => {
    const nodes = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "invalid", type: "requirement" }),
    ]

    const result = await addNodes(nodes, tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_added).toBe(1)
    expect(result.warnings).toBeDefined()
    expect(result.warnings!.length).toBeGreaterThan(0)
  })
})

// ============================================================
// addEdges
// ============================================================

describe("addEdges", () => {
  beforeEach(async () => {
    const nodes = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision" }),
      makeNode({ id: "WI-001:task:1", type: "task" }),
      makeNode({ id: "WI-001:code_file:1", type: "code_file", metadata: { path: "src/a.ts" } }),
    ]
    await setupGraphWithNodes(tempDir, nodes)
  })

  it("should add valid edges", async () => {
    const edges = [
      makeEdge({
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:1",
        type: "traces_to",
      }),
    ]

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.edges_added).toBe(1)
  })

  it("should reject edges with non-existent source", async () => {
    const edges = [
      makeEdge({
        source: "WI-001:requirement:99",
        target: "WI-001:design_decision:1",
        type: "traces_to",
      }),
    ]

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Source node not found")
  })

  it("should reject edges with non-existent target", async () => {
    const edges = [
      makeEdge({
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:99",
        type: "traces_to",
      }),
    ]

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Target node not found")
  })

  it("should reject duplicate edges", async () => {
    const edges = [
      makeEdge({
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:1",
        type: "traces_to",
      }),
    ]
    await addEdges(edges, tempDir)

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Duplicate edge")
  })

  it("should reject invalid edge type", async () => {
    const edges = [
      makeEdge({
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:1",
        type: "invalid_type" as EdgeType,
      }),
    ]

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid edge type")
  })

  it("should default inferred to false", async () => {
    const edges = [
      {
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:1",
        type: "traces_to" as EdgeType,
        work_item_id: "WI-001",
        inferred: undefined as unknown as boolean,
        created_at: new Date().toISOString(),
      },
    ]

    const result = await addEdges(edges, tempDir)
    expect(result.success).toBe(true)

    // Verify the edge was stored with inferred=false
    const loadResult = await loadGraphStore(tempDir)
    const storedEdge = loadResult.store!.edges[0]
    expect(storedEdge.inferred).toBe(false)
  })
})

// ============================================================
// removeNodes
// ============================================================

describe("removeNodes", () => {
  it("should remove nodes and cascade delete edges", async () => {
    const nodes = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision" }),
    ]
    const edges = [
      makeEdge({
        source: "WI-001:requirement:1",
        target: "WI-001:design_decision:1",
        type: "traces_to",
      }),
    ]
    await setupGraphWithNodes(tempDir, nodes, edges)

    const result = await removeNodes(["WI-001:requirement:1"], tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_removed).toBe(1)
    expect(result.summary?.edges_removed).toBe(1)

    // Verify the graph state
    const loadResult = await loadGraphStore(tempDir)
    expect(loadResult.store!.nodes).toHaveLength(1)
    expect(loadResult.store!.edges).toHaveLength(0)
  })

  it("should handle removing non-existent nodes gracefully", async () => {
    await setupEmptyGraph(tempDir)

    const result = await removeNodes(["WI-001:requirement:99"], tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_removed).toBe(0)
  })
})

// ============================================================
// updateNode
// ============================================================

describe("updateNode", () => {
  it("should update node label", async () => {
    const nodes = [makeNode({ id: "WI-001:requirement:1", type: "requirement", label: "Old label" })]
    await setupGraphWithNodes(tempDir, nodes)

    const result = await updateNode("WI-001:requirement:1", { label: "New label" }, tempDir)
    expect(result.success).toBe(true)
    expect(result.summary?.nodes_updated).toBe(1)

    const loadResult = await loadGraphStore(tempDir)
    expect(loadResult.store!.nodes[0].label).toBe("New label")
  })

  it("should update node metadata", async () => {
    const nodes = [makeNode({ id: "WI-001:requirement:1", type: "requirement", metadata: { req_id: "需求 1" } })]
    await setupGraphWithNodes(tempDir, nodes)

    const result = await updateNode("WI-001:requirement:1", { metadata: { source_file: "test.md" } }, tempDir)
    expect(result.success).toBe(true)

    const loadResult = await loadGraphStore(tempDir)
    expect(loadResult.store!.nodes[0].metadata?.source_file).toBe("test.md")
    expect(loadResult.store!.nodes[0].metadata?.req_id).toBe("需求 1")
  })

  it("should return error for non-existent node", async () => {
    await setupEmptyGraph(tempDir)

    const result = await updateNode("WI-001:requirement:99", { label: "test" }, tempDir)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Node not found")
  })
})

// ============================================================
// syncFromSpec
// ============================================================

describe("syncFromSpec", () => {
  async function setupSpecDir(baseDir: string, workItemId: string, files: Record<string, string>): Promise<void> {
    const specDir = join(baseDir, "specforge", "specs", workItemId)
    await mkdir(specDir, { recursive: true })
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(specDir, name), content, "utf-8")
    }
  }

  describe("scope=requirements", () => {
    it("should parse requirements.md and create requirement nodes", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `# Requirements\n\n### REQ-1 用户登录\n\n描述...\n\n### REQ-2 用户注册\n\n描述...\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBe(2)

      const loadResult = await loadGraphStore(tempDir)
      const nodes = loadResult.store!.nodes
      expect(nodes).toHaveLength(2)
      expect(nodes[0].id).toBe("WI-001:requirement:1")
      expect(nodes[0].label).toBe("用户登录")
      expect(nodes[0].metadata?.req_id).toBe("REQ-1")
      expect(nodes[1].id).toBe("WI-001:requirement:2")
    })

    it("should handle legacy Chinese requirement headings", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `# Requirements\n\n### 需求 1：用户登录\n\n描述...\n\n### 需求 2：用户注册\n\n描述...\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBe(2)

      const loadResult = await loadGraphStore(tempDir)
      const nodes = loadResult.store!.nodes
      expect(nodes).toHaveLength(2)
      expect(nodes[0].id).toBe("WI-001:requirement:1")
      expect(nodes[0].label).toBe("用户登录")
      expect(nodes[0].metadata?.req_id).toBe("REQ-1")
    })

    it("should handle English requirement headings", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `# Requirements\n\n### Requirement 1: User Login\n\nDesc...\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBe(1)
    })

    it("should be idempotent (update existing nodes)", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `### REQ-1 用户登录\n`,
      })

      await syncFromSpec("WI-001", tempDir, "requirements")

      // Update the file
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `### REQ-1 用户登录（更新）\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_updated).toBe(1)
      expect(result.summary?.nodes_added).toBe(0)

      const loadResult = await loadGraphStore(tempDir)
      expect(loadResult.store!.nodes[0].label).toBe("用户登录（更新）")
    })

    it("should remove nodes for deleted requirements", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `### REQ-1 A\n\n### REQ-2 B\n`,
      })
      await syncFromSpec("WI-001", tempDir, "requirements")

      // Remove requirement 2
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `### REQ-1 A\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_removed).toBe(1)

      const loadResult = await loadGraphStore(tempDir)
      expect(loadResult.store!.nodes).toHaveLength(1)
    })

    it("should handle missing requirements.md gracefully", async () => {
      await setupEmptyGraph(tempDir)
      const specDir = join(tempDir, "specforge", "specs", "WI-001")
      await mkdir(specDir, { recursive: true })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some((w) => w.includes("requirements.md not found"))).toBe(true)
    })

    it("should handle empty requirements.md", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `# Empty doc\n\nNo requirements here.\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "requirements")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBe(0)
    })
  })

  describe("scope=design", () => {
    it("should parse design.md and create design_decision nodes with traces_to edges", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "design.md": `# Design\n\n### DD-1 数据模型设计\n\nrefs: [REQ-1]\n\n### DD-2 API 设计\n\nrefs: [REQ-2]\n`,
      })

      // First add requirement nodes so edges can reference them
      const nodes = [
        makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
        makeNode({ id: "WI-001:requirement:2", type: "requirement" }),
      ]
      await setupGraphWithNodes(tempDir, nodes)

      const result = await syncFromSpec("WI-001", tempDir, "design")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBe(2)
      expect(result.summary?.edges_added).toBeGreaterThanOrEqual(1)

      const loadResult = await loadGraphStore(tempDir)
      const designNodes = loadResult.store!.nodes.filter((n) => n.type === "design_decision")
      expect(designNodes).toHaveLength(2)
      expect(designNodes[0].metadata?.design_id).toBe("1")

      const tracesEdges = loadResult.store!.edges.filter((e) => e.type === "traces_to")
      expect(tracesEdges.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("scope=tasks", () => {
    it("should parse tasks.md and create task/code_file nodes with edges", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "tasks.md": `# Tasks\n\n### TASK-1 实现核心模块\n\nfiles: [.opencode/tools/lib/core.ts]\n\n### TASK-2 编写测试\n\nfiles: [tests/core.test.ts]\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "tasks")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBeGreaterThanOrEqual(2)

      const loadResult = await loadGraphStore(tempDir)
      const taskNodes = loadResult.store!.nodes.filter((n) => n.type === "task")
      const codeFileNodes = loadResult.store!.nodes.filter((n) => n.type === "code_file")
      expect(taskNodes.length).toBeGreaterThanOrEqual(2)
      expect(codeFileNodes.length).toBeGreaterThanOrEqual(1)
    })

    it("should create modifies edges between tasks and code files", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "tasks.md": `# Tasks\n\n### TASK-1 实现功能\n\nfiles: [src/main.ts]\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "tasks")
      expect(result.success).toBe(true)

      const loadResult = await loadGraphStore(tempDir)
      const modifiesEdges = loadResult.store!.edges.filter((e) => e.type === "modifies")
      expect(modifiesEdges.length).toBeGreaterThanOrEqual(1)
    })

    it("should handle legacy Task N: format headings", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "tasks.md": `# Tasks\n\n## Task 1: 实现核心\n\n修改文件: \`src/core.ts\`\n\n## Task 2: 测试\n\n修改文件: \`tests/test.ts\`\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "tasks")
      expect(result.success).toBe(true)

      const loadResult = await loadGraphStore(tempDir)
      const taskNodes = loadResult.store!.nodes.filter((n) => n.type === "task")
      expect(taskNodes).toHaveLength(2)
    })

    it("should handle legacy indented task format", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "tasks.md": `# Tasks\n\n- [ ] 1. 实现核心模块\n    - 修改文件: \`.opencode/tools/lib/core.ts\`\n\n- [ ] 2. 编写测试\n    - 修改文件: \`tests/core.test.ts\`\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "tasks")
      expect(result.success).toBe(true)
      expect(result.summary?.nodes_added).toBeGreaterThanOrEqual(2)

      const loadResult = await loadGraphStore(tempDir)
      const taskNodes = loadResult.store!.nodes.filter((n) => n.type === "task")
      const codeFileNodes = loadResult.store!.nodes.filter((n) => n.type === "code_file")
      expect(taskNodes.length).toBeGreaterThanOrEqual(2)
      expect(codeFileNodes.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("scope=verification", () => {
    it("should sync all files and infer implements edges", async () => {
      await setupEmptyGraph(tempDir)
      await setupSpecDir(tempDir, "WI-001", {
        "requirements.md": `### REQ-1 功能A\n`,
        "design.md": `### DD-1 设计A\n\nrefs: [REQ-1]\n`,
        "tasks.md": `### TASK-1 实现A\n\nrefs: [DD-1]\nfiles: [src/a.ts]\n`,
      })

      const result = await syncFromSpec("WI-001", tempDir, "verification")
      expect(result.success).toBe(true)

      const loadResult = await loadGraphStore(tempDir)
      const store = loadResult.store!

      // Should have all node types
      expect(store.nodes.some((n) => n.type === "requirement")).toBe(true)
      expect(store.nodes.some((n) => n.type === "design_decision")).toBe(true)
      expect(store.nodes.some((n) => n.type === "task")).toBe(true)
      expect(store.nodes.some((n) => n.type === "code_file")).toBe(true)

      // Should have implements edges (inferred)
      const implementsEdges = store.edges.filter((e) => e.type === "implements")
      expect(implementsEdges.length).toBeGreaterThanOrEqual(1)
      expect(implementsEdges[0].inferred).toBe(true)
    })
  })

  describe("implements inference", () => {
    it("should trace requirement→design→task→code_file and create implements edges", async () => {
      // Set up a complete chain manually
      const nodes: GraphNode[] = [
        makeNode({ id: "WI-001:requirement:1", type: "requirement" }),
        makeNode({ id: "WI-001:design_decision:1", type: "design_decision" }),
        makeNode({ id: "WI-001:task:1", type: "task" }),
        makeNode({ id: "WI-001:code_file:1", type: "code_file", metadata: { path: "src/a.ts" } }),
      ]
      const edges: GraphEdge[] = [
        makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
        makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
        makeEdge({ source: "WI-001:task:1", target: "WI-001:code_file:1", type: "modifies" }),
      ]
      await setupGraphWithNodes(tempDir, nodes, edges)

      // Create spec dir (even if empty, syncFromSpec needs it)
      const specDir = join(tempDir, "specforge", "specs", "WI-001")
      await mkdir(specDir, { recursive: true })
      await writeFile(join(specDir, "requirements.md"), "### REQ-1 Test\n", "utf-8")
      await writeFile(join(specDir, "design.md"), "### DD-1 Design\n\nrefs: [REQ-1]\n", "utf-8")
      await writeFile(join(specDir, "tasks.md"), "### TASK-1 Task\n\nrefs: [DD-1]\nfiles: [src/a.ts]\n", "utf-8")

      const result = await syncFromSpec("WI-001", tempDir, "verification")
      expect(result.success).toBe(true)

      const loadResult = await loadGraphStore(tempDir)
      const implementsEdges = loadResult.store!.edges.filter((e) => e.type === "implements")
      expect(implementsEdges.length).toBeGreaterThanOrEqual(1)

      const implEdge = implementsEdges.find(
        (e) => e.source.includes("code_file") && e.target.includes("requirement")
      )
      expect(implEdge).toBeDefined()
      expect(implEdge!.inferred).toBe(true)
    })
  })
})
