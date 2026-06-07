/**
 * sf_knowledge_graph 核心逻辑
 * Knowledge Graph 数据模型、验证函数、读写操作、syncFromSpec
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时）
 *
 * Requirements: 1.1-1.12, 2.1-2.10
 */

import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath } from "@specforge/types/directory-layout"
import { tryCheckCompatibility, logErrorToFile } from "./utils"

// ============================================================
// Types
// ============================================================

export type NodeType = "requirement" | "design_decision" | "task" | "code_file" | "refactor_target" | "ops_action"
export type EdgeType = "traces_to" | "decomposes_to" | "modifies" | "implements" | "affects"
export type SyncScope = "requirements" | "design" | "tasks" | "verification"

export interface NodeMetadata {
  source_file?: string
  source_line?: number
  req_id?: string
  design_id?: string
  task_id?: string
  path?: string
}

export interface RefactorTargetMetadata extends NodeMetadata {
  smell_type?: string
  risk_level?: "low" | "high"
  target_files?: string[]
}

export interface OpsActionMetadata extends NodeMetadata {
  action_type?: string
  target_environment?: string
  rollback_defined?: boolean
}

export interface GraphNode {
  id: string
  type: NodeType
  work_item_id: string
  label: string
  metadata?: NodeMetadata
  created_at: string
  updated_at: string
}

export interface GraphEdge {
  source: string
  target: string
  type: EdgeType
  work_item_id: string
  inferred: boolean
  created_at: string
}

export interface GraphStore {
  version: "1.0"
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SyncSummary {
  nodes_added: number
  nodes_updated: number
  nodes_removed: number
  edges_added: number
  edges_removed: number
}

export interface KGOperationResult {
  success: boolean
  summary?: SyncSummary
  error?: string
  warnings?: string[]
}

// ============================================================
// Constants
// ============================================================

const VALID_NODE_TYPES: NodeType[] = ["requirement", "design_decision", "task", "code_file", "refactor_target", "ops_action"]
const VALID_EDGE_TYPES: EdgeType[] = ["traces_to", "decomposes_to", "modifies", "implements", "affects"]
const LOCK_TIMEOUT = 5000
const GRAPH_RELATIVE_PATH = join(SPEC_DIR_NAME, 'knowledge', 'graph.json')
const CONFIG_RELATIVE_PATH = join(SPEC_DIR_NAME, LAYOUT.configFiles.project)

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validate node type
 */
export function isValidNodeType(type: string): type is NodeType {
  return VALID_NODE_TYPES.includes(type as NodeType)
}

/**
 * Validate edge type
 */
export function isValidEdgeType(type: string): type is EdgeType {
  return VALID_EDGE_TYPES.includes(type as EdgeType)
}

/**
 * Validate node ID format: <work_item_id>:<type>:<sequence>
 * Split by last two ":" characters.
 * work_item_id matches /^[A-Za-z0-9][A-Za-z0-9_-]*$/
 * type is a valid NodeType
 * sequence is a positive integer
 */
export function isValidNodeId(id: string): boolean {
  if (!id || typeof id !== "string") return false

  // Split by last two ":" — find the last colon, then the second-to-last colon
  const lastColon = id.lastIndexOf(":")
  if (lastColon === -1) return false

  const beforeLast = id.substring(0, lastColon)
  const sequence = id.substring(lastColon + 1)

  const secondLastColon = beforeLast.lastIndexOf(":")
  if (secondLastColon === -1) return false

  const workItemId = beforeLast.substring(0, secondLastColon)
  const type = beforeLast.substring(secondLastColon + 1)

  // Validate work_item_id
  if (!workItemId || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(workItemId)) return false

  // Validate type
  if (!isValidNodeType(type)) return false

  // Validate sequence is a positive integer
  if (!sequence || !/^\d+$/.test(sequence)) return false
  const seq = parseInt(sequence, 10)
  if (seq <= 0) return false

  return true
}

// ============================================================
// File Lock
// ============================================================

async function acquireLock(lockPath: string): Promise<void> {
  const start = Date.now()
  while (true) {
    try {
      await writeFile(lockPath, String(process.pid), { flag: "wx" })
      return
    } catch {
      if (Date.now() - start > LOCK_TIMEOUT) {
        throw new Error("Lock acquisition timeout")
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath)
  } catch {
    // Ignore errors on release
  }
}

// ============================================================
// Core I/O Functions
// ============================================================

/**
 * Check if Knowledge Graph is enabled via project.json config.
 * Returns true if field is missing (default true).
 */
export async function isKGEnabled(baseDir: string): Promise<boolean> {
  const configPath = join(baseDir, CONFIG_RELATIVE_PATH)
  try {
    const content = await readFile(configPath, "utf-8")
    const config = JSON.parse(content)
    if (typeof config.knowledge_graph_enabled === "boolean") {
      return config.knowledge_graph_enabled
    }
    // Field missing → default true
    return true
  } catch {
    // File doesn't exist or parse error → default true
    return true
  }
}

/**
 * Load GraphStore from disk.
 * - If file doesn't exist and KG is enabled, creates empty graph.
 * - If JSON parse fails, returns error result (does NOT overwrite corrupted file).
 */
export async function loadGraphStore(baseDir: string): Promise<KGOperationResult & { store?: GraphStore }> {
  const graphPath = join(baseDir, GRAPH_RELATIVE_PATH)

  let content: string
  try {
    content = await readFile(graphPath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      // File doesn't exist — check if enabled
      const enabled = await isKGEnabled(baseDir)
      if (enabled) {
        const emptyStore: GraphStore = { version: "1.0", nodes: [], edges: [] }
        // Create the directory and file
        await mkdir(dirname(graphPath), { recursive: true })
        await writeFile(graphPath, JSON.stringify(emptyStore, null, 2), "utf-8")
        return { success: true, store: emptyStore }
      }
      return { success: false, error: "Knowledge Graph is disabled and graph.json does not exist" }
    }
    return { success: false, error: `Failed to read graph.json: ${error.message}` }
  }

  // Parse JSON
  try {
    const store = JSON.parse(content) as GraphStore
    return { success: true, store }
  } catch {
    return { success: false, error: "graph.json is corrupted: JSON parse failed. File preserved for manual recovery." }
  }
}

/**
 * Save GraphStore atomically: write to .tmp then rename.
 * Uses .lock file for serialization.
 */
export async function saveGraphStore(store: GraphStore, baseDir: string): Promise<void> {
  const graphPath = join(baseDir, GRAPH_RELATIVE_PATH)
  const tempPath = graphPath + ".tmp"
  const lockPath = graphPath + ".lock"

  await mkdir(dirname(graphPath), { recursive: true })
  await acquireLock(lockPath)
  try {
    await writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8")
    await rename(tempPath, graphPath)
  } finally {
    await releaseLock(lockPath)
  }
}

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Add nodes to the graph store.
 * Validates ID format, type legality, uniqueness, and code_file metadata.path required.
 */
export async function addNodes(nodes: GraphNode[], baseDir: string): Promise<KGOperationResult> {
  try {
    // V3.4.0: 版本兼容性检查（動態導入，失敗時靜默跳過）
    await tryCheckCompatibility(baseDir, "sf_knowledge_graph_core")

    const loadResult = await loadGraphStore(baseDir)
    if (!loadResult.success || !loadResult.store) {
      return { success: false, error: loadResult.error }
    }

    const store = loadResult.store
    const existingIds = new Set(store.nodes.map((n) => n.id))
    const errors: string[] = []
    const added: GraphNode[] = []

    for (const node of nodes) {
      // Validate ID format
      if (!isValidNodeId(node.id)) {
        errors.push(`Invalid node ID format: ${node.id}`)
        continue
      }

      // Validate type
      if (!isValidNodeType(node.type)) {
        errors.push(`Invalid node type: ${node.type}`)
        continue
      }

      // Validate uniqueness
      if (existingIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`)
        continue
      }

      // Validate code_file must have metadata.path
      if (node.type === "code_file" && (!node.metadata || !node.metadata.path)) {
        errors.push(`code_file node must have metadata.path: ${node.id}`)
        continue
      }

      existingIds.add(node.id)
      added.push(node)
    }

    if (errors.length > 0 && added.length === 0) {
      return { success: false, error: errors.join("; ") }
    }

    store.nodes.push(...added)
    await saveGraphStore(store, baseDir)

    const summary: SyncSummary = {
      nodes_added: added.length,
      nodes_updated: 0,
      nodes_removed: 0,
      edges_added: 0,
      edges_removed: 0,
    }

    if (errors.length > 0) {
      return { success: true, summary, warnings: errors }
    }
    return { success: true, summary }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_knowledge_graph_core", "addNodes", err)
    throw err
  }
}

/**
 * Add edges to the graph store.
 * Validates source/target exist, type legal, no duplicates.
 */
export async function addEdges(edges: GraphEdge[], baseDir: string): Promise<KGOperationResult> {
  try {
    // V3.4.0: 版本兼容性检查（動態導入，失敗時靜默跳過）
    await tryCheckCompatibility(baseDir, "sf_knowledge_graph_core")

    const loadResult = await loadGraphStore(baseDir)
    if (!loadResult.success || !loadResult.store) {
      return { success: false, error: loadResult.error }
    }

    const store = loadResult.store
    const nodeIds = new Set(store.nodes.map((n) => n.id))
    const existingEdgeKeys = new Set(
      store.edges.map((e) => `${e.source}|${e.target}|${e.type}`)
    )
    const errors: string[] = []
    const added: GraphEdge[] = []

    for (const edge of edges) {
      // Validate edge type
      if (!isValidEdgeType(edge.type)) {
        errors.push(`Invalid edge type: ${edge.type}`)
        continue
      }

      // Validate source exists
      if (!nodeIds.has(edge.source)) {
        errors.push(`Source node not found: ${edge.source}`)
        continue
      }

      // Validate target exists
      if (!nodeIds.has(edge.target)) {
        errors.push(`Target node not found: ${edge.target}`)
        continue
      }

      // Check for duplicates
      const key = `${edge.source}|${edge.target}|${edge.type}`
      if (existingEdgeKeys.has(key)) {
        errors.push(`Duplicate edge: ${edge.source} → ${edge.target} (${edge.type})`)
        continue
      }

      // Set inferred default
      const edgeToAdd: GraphEdge = {
        ...edge,
        inferred: edge.inferred ?? false,
      }

      existingEdgeKeys.add(key)
      added.push(edgeToAdd)
    }

    if (errors.length > 0 && added.length === 0) {
      return { success: false, error: errors.join("; ") }
    }

    store.edges.push(...added)
    await saveGraphStore(store, baseDir)

    const summary: SyncSummary = {
      nodes_added: 0,
      nodes_updated: 0,
      nodes_removed: 0,
      edges_added: added.length,
      edges_removed: 0,
    }

    if (errors.length > 0) {
      return { success: true, summary, warnings: errors }
    }
    return { success: true, summary }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_knowledge_graph_core", "addEdges", err)
    throw err
  }
}

/**
 * Remove nodes and cascade delete associated edges.
 */
export async function removeNodes(nodeIds: string[], baseDir: string): Promise<KGOperationResult> {
  try {
    // V3.4.0: 版本兼容性检查（動態導入，失敗時靜默跳過）
    await tryCheckCompatibility(baseDir, "sf_knowledge_graph_core")

    const loadResult = await loadGraphStore(baseDir)
    if (!loadResult.success || !loadResult.store) {
      return { success: false, error: loadResult.error }
    }

    const store = loadResult.store
    const idsToRemove = new Set(nodeIds)

    const originalNodeCount = store.nodes.length
    const originalEdgeCount = store.edges.length

    store.nodes = store.nodes.filter((n) => !idsToRemove.has(n.id))
    store.edges = store.edges.filter(
      (e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target)
    )

    const nodesRemoved = originalNodeCount - store.nodes.length
    const edgesRemoved = originalEdgeCount - store.edges.length

    await saveGraphStore(store, baseDir)

    return {
      success: true,
      summary: {
        nodes_added: 0,
        nodes_updated: 0,
        nodes_removed: nodesRemoved,
        edges_added: 0,
        edges_removed: edgesRemoved,
      },
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_knowledge_graph_core", "removeNodes", err)
    throw err
  }
}

/**
 * Update a single node's label and/or metadata.
 */
export async function updateNode(
  nodeId: string,
  updates: { label?: string; metadata?: Partial<NodeMetadata> },
  baseDir: string
): Promise<KGOperationResult> {
  try {
    // V3.4.0: 版本兼容性检查（動態導入，失敗時靜默跳過）
    await tryCheckCompatibility(baseDir, "sf_knowledge_graph_core")

    const loadResult = await loadGraphStore(baseDir)
    if (!loadResult.success || !loadResult.store) {
      return { success: false, error: loadResult.error }
    }

    const store = loadResult.store
    const node = store.nodes.find((n) => n.id === nodeId)
    if (!node) {
      return { success: false, error: `Node not found: ${nodeId}` }
    }

    if (updates.label !== undefined) {
      node.label = updates.label
    }
    if (updates.metadata !== undefined) {
      node.metadata = { ...node.metadata, ...updates.metadata }
    }
    node.updated_at = new Date().toISOString()

    await saveGraphStore(store, baseDir)

    return {
      success: true,
      summary: {
        nodes_added: 0,
        nodes_updated: 1,
        nodes_removed: 0,
        edges_added: 0,
        edges_removed: 0,
      },
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_knowledge_graph_core", "updateNode", err)
    throw err
  }
}

// ============================================================
// syncFromSpec — Spec File Parsing & Sync
// ============================================================

/**
 * Parse requirements.md to extract requirement nodes.
 * Matches standardized `### REQ-N Title` format, plus legacy `### 需求 N` or `### Requirement N` headings.
 */
function parseRequirements(content: string, workItemId: string, sourceFile: string): GraphNode[] {
  const nodes: GraphNode[] = []
  const pattern = /^#{1,6}\s+(?:REQ-(\d+)|(?:需求|Requirement)\s+(\d+))[：:.]?\s*(.*)/gm
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const reqNum = match[1] || match[2]
    const title = match[3]?.trim() || `Requirement ${reqNum}`
    const now = new Date().toISOString()

    nodes.push({
      id: `${workItemId}:requirement:${reqNum}`,
      type: "requirement",
      work_item_id: workItemId,
      label: title.substring(0, 200),
      metadata: {
        source_file: sourceFile,
        req_id: `REQ-${reqNum}`,
      },
      created_at: now,
      updated_at: now,
    })
  }

  return nodes
}

/**
 * Parse design.md to extract design_decision nodes and traces_to edges.
 * Matches standardized `### DD-N Title` format, plus legacy `### N.N Title` headings.
 * Detects `refs: [REQ-N, ...]` and legacy `需求 N` / `Requirement N` references for traces_to edges.
 */
function parseDesign(
  content: string,
  workItemId: string,
  sourceFile: string
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const now = new Date().toISOString()

  // Split content into sections for reference detection
  const lines = content.split("\n")
  const sections: Array<{ id: string; startLine: number; title: string; seq: number }> = []
  let seq = 0

  for (let i = 0; i < lines.length; i++) {
    // Match standardized DD-N format: ### DD-1 Title
    const ddMatch = lines[i].match(/^#{1,6}\s+DD-(\d+)[：:.]?\s*(.*)/)
    // Match legacy format: ### 3.1 Title
    const legacyMatch = lines[i].match(/^#{2,3}\s+(\d+(?:\.\d+)?)[.、：:\s]+(.+)/)

    if (ddMatch) {
      seq++
      const designId = ddMatch[1]
      const title = ddMatch[2]?.trim() || `Design Decision ${designId}`
      sections.push({ id: designId, startLine: i, title, seq })

      nodes.push({
        id: `${workItemId}:design_decision:${seq}`,
        type: "design_decision",
        work_item_id: workItemId,
        label: title.substring(0, 200),
        metadata: {
          source_file: sourceFile,
          design_id: designId,
        },
        created_at: now,
        updated_at: now,
      })
    } else if (legacyMatch) {
      seq++
      const designId = legacyMatch[1]
      const title = legacyMatch[2].trim()
      sections.push({ id: designId, startLine: i, title, seq })

      nodes.push({
        id: `${workItemId}:design_decision:${seq}`,
        type: "design_decision",
        work_item_id: workItemId,
        label: title.substring(0, 200),
        metadata: {
          source_file: sourceFile,
          design_id: designId,
        },
        created_at: now,
        updated_at: now,
      })
    }
  }

  // For each section, detect requirement references to build traces_to edges
  for (let i = 0; i < sections.length; i++) {
    const startLine = sections[i].startLine
    const endLine = i + 1 < sections.length ? sections[i + 1].startLine : lines.length
    const sectionContent = lines.slice(startLine, endLine).join("\n")

    const seenReqs = new Set<string>()

    // Detect standardized refs: [REQ-1, REQ-3] format
    const refsLinePattern = /refs:\s*\[([^\]]+)\]/g
    let refsMatch: RegExpExecArray | null
    while ((refsMatch = refsLinePattern.exec(sectionContent)) !== null) {
      const refsList = refsMatch[1]
      const reqRefs = refsList.match(/REQ-(\d+)/g)
      if (reqRefs) {
        for (const ref of reqRefs) {
          const reqNum = ref.replace("REQ-", "")
          if (seenReqs.has(reqNum)) continue
          seenReqs.add(reqNum)

          edges.push({
            source: `${workItemId}:requirement:${reqNum}`,
            target: `${workItemId}:design_decision:${sections[i].seq}`,
            type: "traces_to",
            work_item_id: workItemId,
            inferred: false,
            created_at: now,
          })
        }
      }
    }

    // Detect legacy references: 需求 N, Requirement N, REQ-N (inline)
    const reqRefPattern = /(?:需求|Requirement)\s+(\d+)|REQ-(\d+)/g
    let refMatch: RegExpExecArray | null

    while ((refMatch = reqRefPattern.exec(sectionContent)) !== null) {
      const reqNum = refMatch[1] || refMatch[2]
      if (seenReqs.has(reqNum)) continue
      seenReqs.add(reqNum)

      edges.push({
        source: `${workItemId}:requirement:${reqNum}`,
        target: `${workItemId}:design_decision:${sections[i].seq}`,
        type: "traces_to",
        work_item_id: workItemId,
        inferred: false,
        created_at: now,
      })
    }
  }

  return { nodes, edges }
}

/**
 * Parse tasks.md to extract task nodes, code_file nodes, and edges.
 * Matches standardized `### TASK-N Title` format, plus legacy `## Task N:` headings and `- [ ] N.` format.
 * Parses `files: [path1, path2]` (standardized) and `修改文件` (legacy) fields for file paths.
 */
function parseTasks(
  content: string,
  workItemId: string,
  sourceFile: string
): { nodes: GraphNode[]; edges: GraphEdge[]; warnings: string[] } {
  const taskNodes: GraphNode[] = []
  const codeFileNodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const warnings: string[] = []
  const now = new Date().toISOString()

  // Split into task sections — try standardized TASK-N format first
  const standardPattern = /^#{1,6}\s+TASK-(\d+)[：:.]?\s*(.*)/gm
  const taskSections: Array<{ num: string; title: string; startIdx: number }> = []
  let match: RegExpExecArray | null

  while ((match = standardPattern.exec(content)) !== null) {
    taskSections.push({
      num: match[1],
      title: match[2]?.trim() || `Task ${match[1]}`,
      startIdx: match.index,
    })
  }

  // Fallback to legacy `## Task N:` format
  if (taskSections.length === 0) {
    const legacyPattern = /^##\s+Task\s+(\d+)[：:.]?\s*(.*)/gm
    while ((match = legacyPattern.exec(content)) !== null) {
      taskSections.push({
        num: match[1],
        title: match[2]?.trim() || `Task ${match[1]}`,
        startIdx: match.index,
      })
    }
  }

  // Also try matching the indented task format: `- [ ] N. Title` or `- [-] N. Title`
  if (taskSections.length === 0) {
    const altPattern = /^-\s+\[[ x~-]\]\s+(\d+)\.\s+(.+)/gm
    while ((match = altPattern.exec(content)) !== null) {
      taskSections.push({
        num: match[1],
        title: match[2]?.trim() || `Task ${match[1]}`,
        startIdx: match.index,
      })
    }
  }

  let codeFileSeq = 0
  const seenCodeFiles = new Map<string, string>() // path → node id

  for (let i = 0; i < taskSections.length; i++) {
    const task = taskSections[i]
    const startIdx = task.startIdx
    const endIdx = i + 1 < taskSections.length ? taskSections[i + 1].startIdx : content.length
    const sectionContent = content.substring(startIdx, endIdx)

    // Create task node
    const taskNodeId = `${workItemId}:task:${task.num}`
    taskNodes.push({
      id: taskNodeId,
      type: "task",
      work_item_id: workItemId,
      label: task.title.substring(0, 200),
      metadata: {
        source_file: sourceFile,
        task_id: `Task ${task.num}`,
      },
      created_at: now,
      updated_at: now,
    })

    // Parse files field: standardized `files: [path1, path2]` and legacy `修改文件` formats
    const filePaths = new Set<string>()

    // Standardized format: files: [path1, path2]
    const filesFieldPattern = /files:\s*\[([^\]]+)\]/g
    let filesMatch: RegExpExecArray | null
    while ((filesMatch = filesFieldPattern.exec(sectionContent)) !== null) {
      const pathsList = filesMatch[1]
      // Split by comma, trim whitespace and backticks
      for (const p of pathsList.split(/[,，]/)) {
        const trimmed = p.trim().replace(/`/g, "").replace(/^['"]|['"]$/g, "")
        if (trimmed && (trimmed.includes("/") || trimmed.includes("."))) {
          filePaths.add(trimmed)
        }
      }
    }

    // Legacy format: 修改文件
    if (filePaths.size === 0) {
      const legacyFilePatterns = [
        /修改文件[：:]\s*`([^`]+)`/g,
        /修改文件[：:]\s*(.+)/g,
      ]

      for (const fp of legacyFilePatterns) {
        let fileMatch: RegExpExecArray | null
        while ((fileMatch = fp.exec(sectionContent)) !== null) {
          // May contain comma-separated paths or backtick-wrapped paths
          const raw = fileMatch[1]
          // Extract backtick-wrapped paths
          const backtickPaths = raw.match(/`([^`]+)`/g)
          if (backtickPaths) {
            for (const bp of backtickPaths) {
              filePaths.add(bp.replace(/`/g, "").trim())
            }
          } else {
            // Split by comma or semicolons
            for (const p of raw.split(/[,;，、]/)) {
              const trimmed = p.trim().replace(/`/g, "")
              if (trimmed && (trimmed.includes("/") || trimmed.includes("."))) {
                filePaths.add(trimmed)
              }
            }
          }
        }
      }
    }

    // Create code_file nodes and modifies edges
    for (const filePath of filePaths) {
      let codeFileNodeId: string
      if (seenCodeFiles.has(filePath)) {
        codeFileNodeId = seenCodeFiles.get(filePath)!
      } else {
        codeFileSeq++
        codeFileNodeId = `${workItemId}:code_file:${codeFileSeq}`
        seenCodeFiles.set(filePath, codeFileNodeId)
        codeFileNodes.push({
          id: codeFileNodeId,
          type: "code_file",
          work_item_id: workItemId,
          label: filePath.split("/").pop() || filePath,
          metadata: { path: filePath },
          created_at: now,
          updated_at: now,
        })
      }

      // task → code_file modifies edge
      edges.push({
        source: taskNodeId,
        target: codeFileNodeId,
        type: "modifies",
        work_item_id: workItemId,
        inferred: false,
        created_at: now,
      })
    }

    // Heuristic: detect design references for decomposes_to edges
    // Standardized format: refs: [DD-1, DD-2, REQ-1] — extract DD-N references
    // Legacy format: "设计 3.1", "基于设计 N", "Design N.N"
    const seenDesignRefs = new Set<string>()

    // Standardized refs: [DD-N] format
    const refsPattern = /refs:\s*\[([^\]]+)\]/g
    let refsMatch: RegExpExecArray | null
    while ((refsMatch = refsPattern.exec(sectionContent)) !== null) {
      const refsList = refsMatch[1]
      const ddRefs = refsList.match(/DD-(\d+)/g)
      if (ddRefs) {
        for (const ref of ddRefs) {
          const designRef = ref.replace("DD-", "")
          if (seenDesignRefs.has(designRef)) continue
          seenDesignRefs.add(designRef)

          edges.push({
            source: `${workItemId}:design_ref:${designRef}`,
            target: taskNodeId,
            type: "decomposes_to",
            work_item_id: workItemId,
            inferred: false,
            created_at: now,
          })
        }
      }
    }

    // Legacy format
    const designRefPattern = /(?:设计|基于设计|Design)\s+(\d+(?:\.\d+)?)/g
    let designMatch: RegExpExecArray | null

    while ((designMatch = designRefPattern.exec(sectionContent)) !== null) {
      const designRef = designMatch[1]
      if (seenDesignRefs.has(designRef)) continue
      seenDesignRefs.add(designRef)

      // We need to find the design_decision node with this design_id
      // This will be resolved during sync when we have the full graph
      // For now, store as a placeholder that sync will resolve
      edges.push({
        source: `${workItemId}:design_ref:${designRef}`,
        target: taskNodeId,
        type: "decomposes_to",
        work_item_id: workItemId,
        inferred: false,
        created_at: now,
      })
    }
  }

  return { nodes: [...taskNodes, ...codeFileNodes], edges, warnings }
}

/**
 * Infer implements edges: trace requirement→design→task→code_file chain,
 * generate code_file→requirement implements edges with inferred=true.
 */
function inferImplementsEdges(store: GraphStore, workItemId: string): GraphEdge[] {
  const now = new Date().toISOString()
  const newEdges: GraphEdge[] = []

  // Filter nodes and edges for this work item
  const wiNodes = store.nodes.filter((n) => n.work_item_id === workItemId)
  const wiEdges = store.edges.filter((e) => e.work_item_id === workItemId)

  const codeFileNodes = wiNodes.filter((n) => n.type === "code_file")

  // Build reverse lookup maps
  // modifies: task → code_file, so reverse: code_file → tasks
  const codeFileToTasks = new Map<string, string[]>()
  for (const edge of wiEdges) {
    if (edge.type === "modifies") {
      const list = codeFileToTasks.get(edge.target) || []
      list.push(edge.source)
      codeFileToTasks.set(edge.target, list)
    }
  }

  // decomposes_to: design → task, so reverse: task → designs
  const taskToDesigns = new Map<string, string[]>()
  for (const edge of wiEdges) {
    if (edge.type === "decomposes_to") {
      const list = taskToDesigns.get(edge.target) || []
      list.push(edge.source)
      taskToDesigns.set(edge.target, list)
    }
  }

  // traces_to: requirement → design, so reverse: design → requirements
  const designToReqs = new Map<string, string[]>()
  for (const edge of wiEdges) {
    if (edge.type === "traces_to") {
      const list = designToReqs.get(edge.target) || []
      list.push(edge.source)
      designToReqs.set(edge.target, list)
    }
  }

  // Existing implements edges
  const existingImplements = new Set(
    wiEdges
      .filter((e) => e.type === "implements")
      .map((e) => `${e.source}|${e.target}`)
  )

  // For each code_file, trace back to requirements
  for (const codeFile of codeFileNodes) {
    const tasks = codeFileToTasks.get(codeFile.id) || []
    const reachableReqs = new Set<string>()

    for (const taskId of tasks) {
      const designs = taskToDesigns.get(taskId) || []
      for (const designId of designs) {
        const reqs = designToReqs.get(designId) || []
        for (const reqId of reqs) {
          reachableReqs.add(reqId)
        }
      }
    }

    for (const reqId of reachableReqs) {
      const key = `${codeFile.id}|${reqId}`
      if (!existingImplements.has(key)) {
        existingImplements.add(key)
        newEdges.push({
          source: codeFile.id,
          target: reqId,
          type: "implements",
          work_item_id: workItemId,
          inferred: true,
          created_at: now,
        })
      }
    }
  }

  return newEdges
}

/**
 * Sync from spec files. Idempotent: update existing nodes, create new ones, remove deleted ones.
 */
export async function syncFromSpec(
  workItemId: string,
  baseDir: string,
  scope: SyncScope
): Promise<KGOperationResult> {
  // V3.4.0: 版本兼容性检查（动态导入）
  await tryCheckCompatibility(baseDir, "sf_knowledge_graph_core")

  const loadResult = await loadGraphStore(baseDir)
  if (!loadResult.success || !loadResult.store) {
    return { success: false, error: loadResult.error }
  }

  const store = loadResult.store
  const specDir = resolveProjectPath(baseDir, "specs", workItemId)
  const warnings: string[] = []

  let summary: SyncSummary = {
    nodes_added: 0,
    nodes_updated: 0,
    nodes_removed: 0,
    edges_added: 0,
    edges_removed: 0,
  }

  try {
    if (scope === "requirements" || scope === "verification") {
      const reqResult = await syncRequirements(store, workItemId, specDir)
      summary = mergeSummaries(summary, reqResult.summary)
      warnings.push(...reqResult.warnings)
    }

    if (scope === "design" || scope === "verification") {
      const designResult = await syncDesign(store, workItemId, specDir)
      summary = mergeSummaries(summary, designResult.summary)
      warnings.push(...designResult.warnings)
    }

    if (scope === "tasks" || scope === "verification") {
      const tasksResult = await syncTasks(store, workItemId, specDir)
      summary = mergeSummaries(summary, tasksResult.summary)
      warnings.push(...tasksResult.warnings)
    }

    // Infer implements edges for tasks and verification scopes
    if (scope === "tasks" || scope === "verification") {
      const implementsEdges = inferImplementsEdges(store, workItemId)
      store.edges.push(...implementsEdges)
      summary.edges_added += implementsEdges.length
    }

    await saveGraphStore(store, baseDir)
  } catch (err: unknown) {
    const error = err as Error
    return { success: false, error: `syncFromSpec failed: ${error.message}` }
  }

  const result: KGOperationResult = { success: true, summary }
  if (warnings.length > 0) {
    result.warnings = warnings
  }
  return result
}

// ============================================================
// Sync Helpers
// ============================================================

function mergeSummaries(a: SyncSummary, b: SyncSummary): SyncSummary {
  return {
    nodes_added: a.nodes_added + b.nodes_added,
    nodes_updated: a.nodes_updated + b.nodes_updated,
    nodes_removed: a.nodes_removed + b.nodes_removed,
    edges_added: a.edges_added + b.edges_added,
    edges_removed: a.edges_removed + b.edges_removed,
  }
}

async function syncRequirements(
  store: GraphStore,
  workItemId: string,
  specDir: string
): Promise<{ summary: SyncSummary; warnings: string[] }> {
  const filePath = join(specDir, "requirements.md")
  const sourceFile = `${SPEC_DIR_NAME}/specs/${workItemId}/requirements.md`
  let content: string

  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return {
      summary: { nodes_added: 0, nodes_updated: 0, nodes_removed: 0, edges_added: 0, edges_removed: 0 },
      warnings: [`requirements.md not found at ${filePath}`],
    }
  }

  const parsedNodes = parseRequirements(content, workItemId, sourceFile)
  return applyNodeSync(store, parsedNodes, workItemId, "requirement")
}

async function syncDesign(
  store: GraphStore,
  workItemId: string,
  specDir: string
): Promise<{ summary: SyncSummary; warnings: string[] }> {
  const filePath = join(specDir, "design.md")
  const sourceFile = `${SPEC_DIR_NAME}/specs/${workItemId}/design.md`
  let content: string

  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return {
      summary: { nodes_added: 0, nodes_updated: 0, nodes_removed: 0, edges_added: 0, edges_removed: 0 },
      warnings: [`design.md not found at ${filePath}`],
    }
  }

  const { nodes: parsedNodes, edges: parsedEdges } = parseDesign(content, workItemId, sourceFile)
  const nodeResult = applyNodeSync(store, parsedNodes, workItemId, "design_decision")

  // Apply edges: traces_to edges
  const edgeResult = applyEdgeSync(store, parsedEdges, workItemId, "traces_to")

  return {
    summary: mergeSummaries(nodeResult.summary, edgeResult.summary),
    warnings: [...nodeResult.warnings, ...edgeResult.warnings],
  }
}

async function syncTasks(
  store: GraphStore,
  workItemId: string,
  specDir: string
): Promise<{ summary: SyncSummary; warnings: string[] }> {
  const filePath = join(specDir, "tasks.md")
  const sourceFile = `${SPEC_DIR_NAME}/specs/${workItemId}/tasks.md`
  let content: string

  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return {
      summary: { nodes_added: 0, nodes_updated: 0, nodes_removed: 0, edges_added: 0, edges_removed: 0 },
      warnings: [`tasks.md not found at ${filePath}`],
    }
  }

  const { nodes: parsedNodes, edges: parsedEdges, warnings: parseWarnings } = parseTasks(content, workItemId, sourceFile)

  // Separate task nodes and code_file nodes
  const taskNodes = parsedNodes.filter((n) => n.type === "task")
  const codeFileNodes = parsedNodes.filter((n) => n.type === "code_file")

  const taskResult = applyNodeSync(store, taskNodes, workItemId, "task")
  const codeFileResult = applyNodeSync(store, codeFileNodes, workItemId, "code_file")

  // Resolve design_ref placeholders in edges
  const resolvedEdges: GraphEdge[] = []
  const allWarnings = [...taskResult.warnings, ...codeFileResult.warnings, ...parseWarnings]

  for (const edge of parsedEdges) {
    if (edge.type === "decomposes_to" && edge.source.includes(":design_ref:")) {
      // Resolve design_ref to actual design_decision node
      const designRef = edge.source.split(":design_ref:")[1]
      const designNode = store.nodes.find(
        (n) =>
          n.type === "design_decision" &&
          n.work_item_id === workItemId &&
          n.metadata?.design_id === designRef
      )
      if (designNode) {
        resolvedEdges.push({ ...edge, source: designNode.id })
      } else {
        allWarnings.push(`Could not resolve design reference "${designRef}" for task→design edge`)
      }
    } else {
      resolvedEdges.push(edge)
    }
  }

  // Apply modifies edges
  const modifiesEdges = resolvedEdges.filter((e) => e.type === "modifies")
  const decomposesEdges = resolvedEdges.filter((e) => e.type === "decomposes_to")

  const modifiesResult = applyEdgeSync(store, modifiesEdges, workItemId, "modifies")
  const decomposesResult = applyEdgeSync(store, decomposesEdges, workItemId, "decomposes_to")

  return {
    summary: mergeSummaries(
      mergeSummaries(taskResult.summary, codeFileResult.summary),
      mergeSummaries(modifiesResult.summary, decomposesResult.summary)
    ),
    warnings: [...allWarnings, ...modifiesResult.warnings, ...decomposesResult.warnings],
  }
}

/**
 * Apply idempotent node sync: update existing, add new, remove deleted.
 */
function applyNodeSync(
  store: GraphStore,
  parsedNodes: GraphNode[],
  workItemId: string,
  nodeType: NodeType
): { summary: SyncSummary; warnings: string[] } {
  const now = new Date().toISOString()
  let nodesAdded = 0
  let nodesUpdated = 0
  let nodesRemoved = 0

  const parsedIds = new Set(parsedNodes.map((n) => n.id))

  // Update existing or add new
  for (const parsed of parsedNodes) {
    const existing = store.nodes.find((n) => n.id === parsed.id)
    if (existing) {
      // Update
      existing.label = parsed.label
      existing.metadata = parsed.metadata
      existing.updated_at = now
      nodesUpdated++
    } else {
      // Add new
      store.nodes.push(parsed)
      nodesAdded++
    }
  }

  // Remove nodes that no longer exist in spec (only for this work_item_id and type)
  const toRemove = store.nodes.filter(
    (n) =>
      n.type === nodeType &&
      n.work_item_id === workItemId &&
      !parsedIds.has(n.id)
  )

  if (toRemove.length > 0) {
    const removeIds = new Set(toRemove.map((n) => n.id))
    store.nodes = store.nodes.filter((n) => !removeIds.has(n.id))
    // Cascade delete edges
    store.edges = store.edges.filter(
      (e) => !removeIds.has(e.source) && !removeIds.has(e.target)
    )
    nodesRemoved = toRemove.length
  }

  return {
    summary: {
      nodes_added: nodesAdded,
      nodes_updated: nodesUpdated,
      nodes_removed: nodesRemoved,
      edges_added: 0,
      edges_removed: 0,
    },
    warnings: [],
  }
}

/**
 * Apply idempotent edge sync: add new edges, remove edges that no longer exist.
 */
function applyEdgeSync(
  store: GraphStore,
  parsedEdges: GraphEdge[],
  workItemId: string,
  edgeType: EdgeType
): { summary: SyncSummary; warnings: string[] } {
  let edgesAdded = 0
  let edgesRemoved = 0
  const warnings: string[] = []

  const parsedEdgeKeys = new Set(
    parsedEdges.map((e) => `${e.source}|${e.target}|${e.type}`)
  )

  // Validate and add new edges
  const existingEdgeKeys = new Set(
    store.edges.map((e) => `${e.source}|${e.target}|${e.type}`)
  )
  const nodeIds = new Set(store.nodes.map((n) => n.id))

  for (const edge of parsedEdges) {
    const key = `${edge.source}|${edge.target}|${edge.type}`
    if (existingEdgeKeys.has(key)) continue

    // Validate source and target exist
    if (!nodeIds.has(edge.source)) {
      warnings.push(`Edge source not found: ${edge.source}`)
      continue
    }
    if (!nodeIds.has(edge.target)) {
      warnings.push(`Edge target not found: ${edge.target}`)
      continue
    }

    store.edges.push(edge)
    existingEdgeKeys.add(key)
    edgesAdded++
  }

  // Remove edges of this type for this work_item that are no longer in parsed set
  // Only remove non-inferred edges of the specified type
  const toRemoveEdges = store.edges.filter(
    (e) =>
      e.type === edgeType &&
      e.work_item_id === workItemId &&
      !e.inferred &&
      !parsedEdgeKeys.has(`${e.source}|${e.target}|${e.type}`)
  )

  if (toRemoveEdges.length > 0) {
    const removeKeys = new Set(
      toRemoveEdges.map((e) => `${e.source}|${e.target}|${e.type}`)
    )
    store.edges = store.edges.filter(
      (e) => !removeKeys.has(`${e.source}|${e.target}|${e.type}`)
    )
    edgesRemoved = toRemoveEdges.length
  }

  return {
    summary: {
      nodes_added: 0,
      nodes_updated: 0,
      nodes_removed: 0,
      edges_added: edgesAdded,
      edges_removed: edgesRemoved,
    },
    warnings,
  }
}
