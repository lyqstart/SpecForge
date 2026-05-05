import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  KnowledgeGraphSource,
  ArchiveSource,
  PhaseContextSource,
  buildTaskContext,
  recommendCapabilities,
  buildContext,
} from "../../../../.opencode/tools/lib/sf_context_build_core"
import type {
  TaskQueryParams,
  ContextFragment,
  ContextDataSource,
  TaskContext,
} from "../../../../.opencode/tools/lib/sf_context_build_core"
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
  tempDir = await mkdtemp(join(tmpdir(), "cb-test-"))
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

async function setupConfig(baseDir: string, config: Record<string, unknown>): Promise<void> {
  const configDir = join(baseDir, "specforge", "config")
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, "project.json"), JSON.stringify(config, null, 2), "utf-8")
}

async function setupArchiveRun(
  baseDir: string,
  runId: string,
  filesChanged: unknown,
  result: unknown
): Promise<void> {
  const runDir = join(baseDir, "specforge", "archive", "agent_runs", runId)
  await mkdir(runDir, { recursive: true })
  await writeFile(join(runDir, "files_changed.json"), JSON.stringify(filesChanged, null, 2), "utf-8")
  await writeFile(join(runDir, "result.json"), JSON.stringify(result, null, 2), "utf-8")
}

async function setupSkillFragments(baseDir: string, config: unknown): Promise<void> {
  const configDir = join(baseDir, "specforge", "config")
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, "skill_fragments.json"), JSON.stringify(config, null, 2), "utf-8")
}

async function setupSkillFile(baseDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(baseDir, relativePath)
  const { dirname } = await import("node:path")
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, "utf-8")
}

async function setupTasksMd(baseDir: string, workItemId: string, content: string): Promise<void> {
  const specDir = join(baseDir, "specforge", "specs", workItemId)
  await mkdir(specDir, { recursive: true })
  await writeFile(join(specDir, "tasks.md"), content, "utf-8")
}


// ============================================================
// Standard test graph: requirement → design → task → code_file
// ============================================================

function buildStandardGraph() {
  const nodes: GraphNode[] = [
    makeNode({ id: "WI-001:requirement:1", type: "requirement", label: "Knowledge Graph 数据模型", metadata: { req_id: "需求 1" } }),
    makeNode({ id: "WI-001:requirement:2", type: "requirement", label: "KG 读写工具", metadata: { req_id: "需求 2" } }),
    makeNode({ id: "WI-001:design_decision:1", type: "design_decision", label: "JSON 文件存储", metadata: { design_id: "3.1" } }),
    makeNode({ id: "WI-001:task:1", type: "task", label: "实现 sf_knowledge_graph_core.ts", metadata: { task_id: "Task 1" } }),
    makeNode({ id: "WI-001:task:2", type: "task", label: "创建 sf_knowledge_graph.ts wrapper", metadata: { task_id: "Task 2" } }),
    makeNode({ id: "WI-001:code_file:1", type: "code_file", label: "sf_knowledge_graph_core.ts", metadata: { path: ".opencode/tools/lib/sf_knowledge_graph_core.ts" } }),
    makeNode({ id: "WI-001:code_file:2", type: "code_file", label: "sf_knowledge_graph.ts", metadata: { path: ".opencode/tools/sf_knowledge_graph.ts" } }),
  ]
  const edges: GraphEdge[] = [
    makeEdge({ source: "WI-001:requirement:1", target: "WI-001:design_decision:1", type: "traces_to" }),
    makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:1", type: "decomposes_to" }),
    makeEdge({ source: "WI-001:design_decision:1", target: "WI-001:task:2", type: "decomposes_to" }),
    makeEdge({ source: "WI-001:task:1", target: "WI-001:code_file:1", type: "modifies" }),
    makeEdge({ source: "WI-001:task:2", target: "WI-001:code_file:2", type: "modifies" }),
  ]
  return { nodes, edges }
}

// ============================================================
// KnowledgeGraphSource
// ============================================================

describe("KnowledgeGraphSource", () => {
  it("should return requirement and design fragments via upstream traversal", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new KnowledgeGraphSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(1)
    const categories = fragments.map((f) => f.category)
    expect(categories).toContain("design_decision")
    expect(categories).toContain("requirement")
  })

  it("should return empty when KG is disabled", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: false })

    const source = new KnowledgeGraphSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should return empty when graph has no matching task node", async () => {
    await setupGraph(tempDir, [], [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new KnowledgeGraphSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "99" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should match task by Task N format in metadata", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new KnowledgeGraphSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "Task 1" }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// ArchiveSource
// ============================================================

describe("ArchiveSource", () => {
  it("should return success/failure patterns when files intersect", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    // Create archive run with matching file
    await setupArchiveRun(
      tempDir,
      "run-001",
      { files: [{ path: ".opencode/tools/lib/sf_knowledge_graph_core.ts" }] },
      { status: "success", task_description: "Implemented KG core" }
    )
    await setupArchiveRun(
      tempDir,
      "run-002",
      { files: [{ path: ".opencode/tools/lib/sf_knowledge_graph_core.ts" }] },
      { status: "failure", task_description: "Failed KG test", error_type: "TypeError", error_summary: "undefined is not a function" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(2)
    const categories = fragments.map((f) => f.category)
    expect(categories).toContain("success_pattern")
    expect(categories).toContain("failure_pattern")
  })

  it("should return empty when no files intersect", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    // Archive run with non-matching file
    await setupArchiveRun(
      tempDir,
      "run-003",
      { files: [{ path: "src/unrelated.ts" }] },
      { status: "success", task_description: "Unrelated task" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should return empty when archive directory does not exist", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })
    // No archive directory created

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should use target_files from params when provided", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: true })
    // No graph needed since target_files is provided directly

    await setupArchiveRun(
      tempDir,
      "run-004",
      { files: [{ path: "src/my-file.ts" }] },
      { status: "success", task_description: "Direct target match" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      target_files: ["src/my-file.ts"],
    }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(1)
    expect(fragments[0].category).toBe("success_pattern")
  })

  it("should fallback to tasks.md when KG has no data", async () => {
    // No graph file, KG disabled
    await setupConfig(tempDir, { knowledge_graph_enabled: false })

    // Setup tasks.md with file references
    await setupTasksMd(tempDir, "WI-001", `
## Task 1: 实现核心模块

修改文件: \`src/core.ts\`, \`src/utils.ts\`

### 详细描述
实现核心逻辑
`)

    // Archive run matching one of the files from tasks.md
    await setupArchiveRun(
      tempDir,
      "run-005",
      { files: [{ path: "src/core.ts" }] },
      { status: "success", task_description: "Core implementation" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(1)
    expect(fragments[0].category).toBe("success_pattern")
  })

  it("should handle files_changed.json with string array format", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    await setupArchiveRun(
      tempDir,
      "run-006",
      ["src/target.ts", "src/other.ts"],
      { status: "success", task_description: "String array format" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      target_files: ["src/target.ts"],
    }
    const fragments = await source.query(params)

    expect(fragments.length).toBeGreaterThanOrEqual(1)
  })

  it("should generate warning fragments from failure results", async () => {
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    await setupArchiveRun(
      tempDir,
      "run-007",
      { files: [{ path: "src/target.ts" }] },
      { status: "failure", task_description: "Failed task", error_type: "ReferenceError", error_summary: "Variable not defined" }
    )

    const source = new ArchiveSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      target_files: ["src/target.ts"],
    }
    const fragments = await source.query(params)

    const categories = fragments.map((f) => f.category)
    expect(categories).toContain("failure_pattern")
    expect(categories).toContain("warning")
  })
})


// ============================================================
// buildTaskContext
// ============================================================

describe("buildTaskContext", () => {
  it("should build context with KG data present", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    // Also add archive data
    await setupArchiveRun(
      tempDir,
      "run-010",
      { files: [{ path: ".opencode/tools/lib/sf_knowledge_graph_core.ts" }] },
      { status: "success", task_description: "Previous KG implementation" }
    )

    const dataSources: ContextDataSource[] = [
      new KnowledgeGraphSource(tempDir),
      new ArchiveSource(tempDir),
    ]
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const result = await buildTaskContext(params, dataSources, tempDir)

    expect(result.context).not.toBe("")
    expect(result.context).toContain("历史经验")
    expect(result.context).toContain("设计决策")
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
    expect(result.estimated_tokens).toBeGreaterThan(0)
  })

  it("should build context when KG is empty but Archive has data", async () => {
    // Empty graph
    await setupGraph(tempDir, [], [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    // Archive with matching files (using target_files in params)
    await setupArchiveRun(
      tempDir,
      "run-011",
      { files: [{ path: "src/module.ts" }] },
      { status: "failure", task_description: "Module failed", error_type: "Error", error_summary: "Missing import" }
    )

    const dataSources: ContextDataSource[] = [
      new KnowledgeGraphSource(tempDir),
      new ArchiveSource(tempDir),
    ]
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      target_files: ["src/module.ts"],
    }
    const result = await buildTaskContext(params, dataSources, tempDir)

    expect(result.context).not.toBe("")
    expect(result.context).toContain("历史经验")
    expect(result.context).toContain("注意事项")
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
  })

  it("should return empty context when all data sources have no data", async () => {
    await setupGraph(tempDir, [], [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const dataSources: ContextDataSource[] = [
      new KnowledgeGraphSource(tempDir),
      new ArchiveSource(tempDir),
    ]
    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "99" }
    const result = await buildTaskContext(params, dataSources, tempDir)

    expect(result.context).toBe("")
    expect(result.sources).toHaveLength(0)
    expect(result.estimated_tokens).toBe(0)
  })

  it("should truncate context to ≤3000 characters", async () => {
    // Create a custom data source that returns a lot of data
    const verboseSource: ContextDataSource = {
      name: "verbose",
      async query(): Promise<ContextFragment[]> {
        const fragments: ContextFragment[] = []
        // Generate many fragments to exceed 3000 chars
        for (let i = 0; i < 50; i++) {
          fragments.push({
            source_type: "test",
            source_id: `item-${i}`,
            category: "success_pattern",
            content: `这是一条很长的历史经验记录，包含了大量的详细信息用于测试截断功能。编号 ${i}，内容重复以确保超过限制。`,
            priority: 4,
          })
        }
        for (let i = 0; i < 50; i++) {
          fragments.push({
            source_type: "test",
            source_id: `req-${i}`,
            category: "requirement",
            content: `需求 ${i}: 这是一条需求描述，用于测试优先级截断。低优先级内容应该被截断。`,
            priority: 1,
          })
        }
        return fragments
      },
    }

    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const result = await buildTaskContext(params, [verboseSource], tempDir)

    expect(result.context.length).toBeLessThanOrEqual(3000)
    expect(result.context).toContain("历史经验")
    expect(result.estimated_tokens).toBeGreaterThan(0)
  })

  it("should prioritize 历史经验 over 需求 in truncation", async () => {
    // Source that returns both high-priority and low-priority items
    const mixedSource: ContextDataSource = {
      name: "mixed",
      async query(): Promise<ContextFragment[]> {
        const fragments: ContextFragment[] = []
        // High priority: success patterns
        for (let i = 0; i < 30; i++) {
          fragments.push({
            source_type: "test",
            source_id: `success-${i}`,
            category: "success_pattern",
            content: `成功经验 ${i}: 使用了正确的方法实现了功能，确保了测试通过。`,
            priority: 4,
          })
        }
        // Low priority: requirements
        for (let i = 0; i < 30; i++) {
          fragments.push({
            source_type: "test",
            source_id: `req-${i}`,
            category: "requirement",
            content: `需求 ${i}: 系统应该支持某个功能的实现。`,
            priority: 1,
          })
        }
        return fragments
      },
    }

    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const result = await buildTaskContext(params, [mixedSource], tempDir)

    // 历史经验 section should appear before 相关需求
    const historyIdx = result.context.indexOf("## 历史经验")
    const reqIdx = result.context.indexOf("## 相关需求")

    expect(historyIdx).toBeGreaterThanOrEqual(0)
    if (reqIdx >= 0) {
      expect(historyIdx).toBeLessThan(reqIdx)
    }
  })

  it("should handle custom data source registration", async () => {
    const customSource: ContextDataSource = {
      name: "custom_source",
      async query(params: TaskQueryParams): Promise<ContextFragment[]> {
        return [
          {
            source_type: "custom",
            source_id: "custom-1",
            category: "design_decision",
            content: `Custom context for ${params.work_item_id}`,
            priority: 2,
          },
        ]
      },
    }

    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const result = await buildTaskContext(params, [customSource], tempDir)

    expect(result.context).toContain("Custom context for WI-001")
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].type).toBe("custom")
    expect(result.sources[0].id).toBe("custom-1")
  })

  it("should skip failed data sources gracefully", async () => {
    const failingSource: ContextDataSource = {
      name: "failing",
      async query(): Promise<ContextFragment[]> {
        throw new Error("Data source failure")
      },
    }

    const workingSource: ContextDataSource = {
      name: "working",
      async query(): Promise<ContextFragment[]> {
        return [
          {
            source_type: "working",
            source_id: "w-1",
            category: "warning",
            content: "This should still appear",
            priority: 3,
          },
        ]
      },
    }

    const params: TaskQueryParams = { work_item_id: "WI-001", task_id: "1" }
    const result = await buildTaskContext(params, [failingSource, workingSource], tempDir)

    expect(result.context).toContain("This should still appear")
  })
})

// ============================================================
// recommendCapabilities
// ============================================================

describe("recommendCapabilities", () => {
  it("should return matching fragments with full content", async () => {
    // Setup skill_fragments.json
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "brainstorming-7-dimensions",
          skill_file: ".opencode/skills/superpowers-brainstorming/SKILL.md",
          section_heading: "7 个维度",
          triggers: ["需求分析", "头脑风暴", "brainstorming"],
          description: "从 7 个维度进行需求头脑风暴",
        },
        {
          fragment_id: "tdd-red-green",
          skill_file: ".opencode/skills/superpowers-tdd/SKILL.md",
          section_heading: "Red-Green-Refactor",
          triggers: ["测试驱动", "TDD", "单元测试"],
          description: "TDD 循环方法论",
        },
      ],
    })

    // Setup skill files
    await setupSkillFile(
      tempDir,
      ".opencode/skills/superpowers-brainstorming/SKILL.md",
      `# Brainstorming Skill

## 7 个维度

从以下 7 个维度进行需求分析：
1. 功能性需求
2. 非功能性需求
3. 用户体验
4. 安全性
5. 可维护性
6. 可扩展性
7. 兼容性

## 其他章节

这里是其他内容。
`
    )

    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "进行需求分析和头脑风暴",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments.length).toBe(1)
    expect(result.recommended_fragments[0].fragment_id).toBe("brainstorming-7-dimensions")
    expect(result.recommended_fragments[0].content).toContain("7 个维度")
    expect(result.recommended_fragments[0].content).toContain("功能性需求")
    expect(result.recommended_fragments[0].estimated_tokens).toBeGreaterThan(0)
    expect(result.estimated_tokens).toBeGreaterThan(0)
  })

  it("should return empty when no triggers match", async () => {
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "tdd-red-green",
          skill_file: ".opencode/skills/superpowers-tdd/SKILL.md",
          section_heading: "Red-Green-Refactor",
          triggers: ["测试驱动", "TDD"],
          description: "TDD 循环方法论",
        },
      ],
    })

    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "实现数据库连接池",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments).toHaveLength(0)
    expect(result.estimated_tokens).toBe(0)
  })

  it("should return empty when skill_fragments.json does not exist", async () => {
    // No config file created
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "需求分析",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments).toHaveLength(0)
    expect(result.estimated_tokens).toBe(0)
  })

  it("should return empty when task_description is empty", async () => {
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "test-frag",
          skill_file: "test.md",
          section_heading: "Test",
          triggers: ["test"],
          description: "Test",
        },
      ],
    })

    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments).toHaveLength(0)
  })

  it("should handle case-insensitive trigger matching", async () => {
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "tdd-frag",
          skill_file: ".opencode/skills/superpowers-tdd/SKILL.md",
          section_heading: "TDD Basics",
          triggers: ["TDD", "test"],
          description: "TDD basics",
        },
      ],
    })

    await setupSkillFile(
      tempDir,
      ".opencode/skills/superpowers-tdd/SKILL.md",
      `# TDD Skill

## TDD Basics

Write tests first, then implement.

## Advanced
More content here.
`
    )

    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "Write unit test for the module using tdd approach",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments.length).toBe(1)
    expect(result.recommended_fragments[0].content).toContain("Write tests first")
  })

  it("should skip fragments when skill file does not exist", async () => {
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "missing-skill",
          skill_file: ".opencode/skills/nonexistent/SKILL.md",
          section_heading: "Test",
          triggers: ["test"],
          description: "Missing skill",
        },
      ],
    })

    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      task_id: "1",
      task_description: "Write a test",
    }
    const result = await recommendCapabilities(params, tempDir)

    expect(result.recommended_fragments).toHaveLength(0)
  })
})


// ============================================================
// PhaseContextSource (Cross-Work-Item Matching)
// ============================================================

describe("PhaseContextSource", () => {
  it("should return nodes from other work items matching phase type", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001", label: "Knowledge Graph 数据模型" }),
      makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002", label: "Knowledge Graph 查询" }),
      makeNode({ id: "WI-003:requirement:1", type: "requirement", work_item_id: "WI-003", label: "用户认证系统" }),
    ]
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new PhaseContextSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      phase: "requirements",
      task_description: "Knowledge Graph",
    }
    const fragments = await source.query(params)

    // Should find WI-002's requirement (keyword overlap with "Knowledge Graph")
    expect(fragments.length).toBeGreaterThanOrEqual(1)
    const contents = fragments.map((f) => f.content)
    expect(contents.some((c) => c.includes("WI-002"))).toBe(true)
  })

  it("should return empty when phase is not set", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001" }),
      makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002" }),
    ]
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new PhaseContextSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should return empty when KG is disabled", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001" }),
      makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002" }),
    ]
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: false })

    const source = new PhaseContextSource(tempDir)
    const params: TaskQueryParams = { work_item_id: "WI-001", phase: "requirements" }
    const fragments = await source.query(params)

    expect(fragments).toHaveLength(0)
  })

  it("should match design_decision nodes for design phase", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:design_decision:1", type: "design_decision", work_item_id: "WI-001", label: "JSON 存储方案" }),
      makeNode({ id: "WI-002:design_decision:1", type: "design_decision", work_item_id: "WI-002", label: "JSON 文件格式" }),
      makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002", label: "数据持久化" }),
    ]
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new PhaseContextSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      phase: "design",
      task_description: "JSON 存储",
    }
    const fragments = await source.query(params)

    // Should find WI-002's design_decision (keyword overlap with "JSON")
    expect(fragments.length).toBeGreaterThanOrEqual(1)
    const contents = fragments.map((f) => f.content)
    expect(contents.some((c) => c.includes("WI-002"))).toBe(true)
    // Should NOT include requirement nodes (wrong type for design phase)
    expect(fragments.every((f) => !f.content.includes("数据持久化"))).toBe(true)
  })

  it("should return top-5 results maximum", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:task:1", type: "task", work_item_id: "WI-001", label: "实现核心模块" }),
    ]
    // Add 10 task nodes from other work items with matching keywords
    for (let i = 2; i <= 11; i++) {
      nodes.push(
        makeNode({ id: `WI-00${i}:task:1`, type: "task", work_item_id: `WI-00${i}`, label: `实现核心模块 ${i}` })
      )
    }
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const source = new PhaseContextSource(tempDir)
    const params: TaskQueryParams = {
      work_item_id: "WI-001",
      phase: "tasks",
      task_description: "实现核心模块",
    }
    const fragments = await source.query(params)

    expect(fragments.length).toBeLessThanOrEqual(5)
  })
})

// ============================================================
// buildContext (main entry point)
// ============================================================

describe("buildContext", () => {
  it("should combine task context and capabilities", async () => {
    const { nodes, edges } = buildStandardGraph()
    await setupGraph(tempDir, nodes, edges)
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    // Setup skill fragments
    await setupSkillFragments(tempDir, {
      version: "1.0",
      fragments: [
        {
          fragment_id: "tdd-frag",
          skill_file: ".opencode/skills/superpowers-tdd/SKILL.md",
          section_heading: "TDD Basics",
          triggers: ["实现", "核心"],
          description: "TDD basics",
        },
      ],
    })
    await setupSkillFile(
      tempDir,
      ".opencode/skills/superpowers-tdd/SKILL.md",
      `# TDD

## TDD Basics

Write tests first.
`
    )

    const result = await buildContext("WI-001", "1", undefined, true, tempDir)

    expect(result.task_context).toBeDefined()
    // KG has data so context should be non-empty
    expect(result.task_context.context.length).toBeGreaterThan(0)
  })

  it("should include phase context source when phase is set", async () => {
    const nodes: GraphNode[] = [
      makeNode({ id: "WI-001:requirement:1", type: "requirement", work_item_id: "WI-001", label: "核心功能" }),
      makeNode({ id: "WI-002:requirement:1", type: "requirement", work_item_id: "WI-002", label: "核心功能扩展" }),
    ]
    await setupGraph(tempDir, nodes, [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const result = await buildContext("WI-001", undefined, "requirements", false, tempDir)

    // Phase context should find WI-002's requirement
    if (result.task_context.context.length > 0) {
      expect(result.task_context.context).toContain("WI-002")
    }
  })

  it("should not include capabilities when includeCapabilities is false", async () => {
    await setupGraph(tempDir, [], [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const result = await buildContext("WI-001", "1", undefined, false, tempDir)

    expect(result.capabilities).toBeUndefined()
  })

  it("should return empty task_context when no data available", async () => {
    await setupGraph(tempDir, [], [])
    await setupConfig(tempDir, { knowledge_graph_enabled: true })

    const result = await buildContext("WI-001", "99", undefined, false, tempDir)

    expect(result.task_context.context).toBe("")
    expect(result.task_context.sources).toHaveLength(0)
    expect(result.task_context.estimated_tokens).toBe(0)
  })
})
