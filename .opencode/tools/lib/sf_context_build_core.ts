/**
 * sf_context_build 核心逻辑
 * Context Builder + Capability Broker
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时）
 *
 * Requirements: 5.1-5.10, 6.1-6.7, 7.4
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { loadGraphStore, isKGEnabled } from "./sf_knowledge_graph_core"
import { impactAnalysis, getSubgraph } from "./sf_knowledge_query_core"
import type { GraphNode } from "./sf_knowledge_graph_core"

// ============================================================
// Types
// ============================================================

export interface TaskQueryParams {
  work_item_id: string
  task_id?: string
  phase?: string
  task_description?: string
  workflow_type?: string
  target_files?: string[]
  file_types?: string[]
}

export interface ContextFragment {
  source_type: string
  source_id: string
  category: "requirement" | "design_decision" | "success_pattern" | "failure_pattern" | "warning"
  content: string
  priority: number
}

export interface ContextDataSource {
  name: string
  query(params: TaskQueryParams): Promise<ContextFragment[]>
}

export interface TaskContext {
  context: string
  sources: Array<{ type: string; id: string }>
  estimated_tokens: number
}

export interface CapabilityRecommendation {
  recommended_fragments: Array<{
    fragment_id: string
    reason: string
    content: string
    estimated_tokens: number
  }>
  estimated_tokens: number
}

export interface ContextBuildResult {
  task_context: TaskContext
  capabilities?: CapabilityRecommendation
}

// ============================================================
// Skill Fragment Config Types
// ============================================================

interface SkillFragmentEntry {
  fragment_id: string
  skill_file: string
  section_heading: string
  triggers: string[]
  description: string
}

interface SkillFragmentsConfig {
  version: string
  fragments: SkillFragmentEntry[]
}

// ============================================================
// Built-in Data Source 1: KnowledgeGraphSource
// ============================================================

export class KnowledgeGraphSource implements ContextDataSource {
  name = "knowledge_graph"

  constructor(private baseDir: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = []

    // Check if KG is enabled
    const enabled = await isKGEnabled(this.baseDir)
    if (!enabled) return fragments

    const loadResult = await loadGraphStore(this.baseDir)
    if (!loadResult.success || !loadResult.store) return fragments

    const store = loadResult.store

    // Find the task node
    let taskNodeId: string | undefined
    if (params.task_id) {
      const taskNode = store.nodes.find(
        (n) =>
          n.type === "task" &&
          n.work_item_id === params.work_item_id &&
          (n.metadata?.task_id === params.task_id || n.id === params.task_id)
      )
      if (taskNode) {
        taskNodeId = taskNode.id
      }
    }

    if (!taskNodeId) {
      // Try to find by work_item_id and task sequence
      const taskNodes = store.nodes.filter(
        (n) => n.type === "task" && n.work_item_id === params.work_item_id
      )
      if (taskNodes.length > 0 && params.task_id) {
        // Try matching by task_id pattern like "Task 1"
        const match = taskNodes.find(
          (n) => n.metadata?.task_id === `Task ${params.task_id}` || n.id.endsWith(`:task:${params.task_id}`)
        )
        if (match) taskNodeId = match.id
      }
    }

    if (!taskNodeId) return fragments

    // Upstream traversal from task node to design_decision and requirement
    const result = await impactAnalysis(taskNodeId, "upstream", 3, this.baseDir, undefined, false)
    if (!result.found) return fragments

    for (const node of result.nodes) {
      if (node.type === "requirement") {
        fragments.push({
          source_type: "knowledge_graph",
          source_id: node.id,
          category: "requirement",
          content: `[${node.metadata?.req_id || node.id}] ${node.label}`,
          priority: 1,
        })
      } else if (node.type === "design_decision") {
        fragments.push({
          source_type: "knowledge_graph",
          source_id: node.id,
          category: "design_decision",
          content: `[${node.metadata?.design_id || node.id}] ${node.label}`,
          priority: 2,
        })
      }
    }

    return fragments
  }
}

// ============================================================
// Built-in Data Source 2: ArchiveSource
// ============================================================

export class ArchiveSource implements ContextDataSource {
  name = "archive"

  constructor(private baseDir: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = []

    // Step 1: Get target files
    let targetFiles = params.target_files || []

    if (targetFiles.length === 0) {
      // Try to get from KG
      targetFiles = await this.getTargetFilesFromKG(params)
    }

    if (targetFiles.length === 0) {
      // Fallback: parse tasks.md
      targetFiles = await this.getTargetFilesFromTasksMd(params)
    }

    if (targetFiles.length === 0) return fragments

    // Step 2: Scan archive/agent_runs/
    const archiveDir = join(this.baseDir, "specforge", "archive", "agent_runs")
    let entries: string[]
    try {
      entries = await readdir(archiveDir)
    } catch {
      return fragments
    }

    // Step 3: For each run directory, check file intersection
    for (const entry of entries) {
      const runDir = join(archiveDir, entry)
      try {
        const filesChangedPath = join(runDir, "files_changed.json")
        const filesContent = await readFile(filesChangedPath, "utf-8")
        const filesData = JSON.parse(filesContent)

        // Extract file paths from files_changed.json
        const changedPaths: string[] = []
        if (Array.isArray(filesData.files)) {
          for (const f of filesData.files) {
            if (typeof f === "string") changedPaths.push(f)
            else if (f && typeof f.path === "string") changedPaths.push(f.path)
          }
        } else if (Array.isArray(filesData)) {
          for (const f of filesData) {
            if (typeof f === "string") changedPaths.push(f)
            else if (f && typeof f.path === "string") changedPaths.push(f.path)
          }
        }

        // Check intersection
        const intersection = targetFiles.filter((tf) =>
          changedPaths.some((cp) => cp === tf || cp.endsWith(tf) || tf.endsWith(cp))
        )

        if (intersection.length === 0) continue

        // Read result.json
        const resultPath = join(runDir, "result.json")
        const resultContent = await readFile(resultPath, "utf-8")
        const resultData = JSON.parse(resultContent)

        const status = resultData.status || "unknown"
        const taskDesc = resultData.task_description || ""
        const errorType = resultData.error_type || ""
        const errorSummary = resultData.error_summary || ""

        if (status === "success") {
          fragments.push({
            source_type: "archive",
            source_id: entry,
            category: "success_pattern",
            content: `成功经验 [${entry}]: ${taskDesc}`.substring(0, 500),
            priority: 4,
          })
        } else if (status === "failure") {
          fragments.push({
            source_type: "archive",
            source_id: entry,
            category: "failure_pattern",
            content: `失败模式 [${entry}]: ${taskDesc} — 错误: ${errorType} ${errorSummary}`.substring(0, 500),
            priority: 4,
          })
          if (errorSummary) {
            fragments.push({
              source_type: "archive",
              source_id: entry,
              category: "warning",
              content: `注意: ${errorSummary}`.substring(0, 300),
              priority: 3,
            })
          }
        }
      } catch {
        // Skip runs with parse errors
        continue
      }
    }

    return fragments
  }

  private async getTargetFilesFromKG(params: TaskQueryParams): Promise<string[]> {
    const enabled = await isKGEnabled(this.baseDir)
    if (!enabled) return []

    const loadResult = await loadGraphStore(this.baseDir)
    if (!loadResult.success || !loadResult.store) return []

    const store = loadResult.store
    const files: string[] = []

    // Find task node
    const taskNode = store.nodes.find(
      (n) =>
        n.type === "task" &&
        n.work_item_id === params.work_item_id &&
        (n.metadata?.task_id === params.task_id ||
          n.metadata?.task_id === `Task ${params.task_id}` ||
          n.id.endsWith(`:task:${params.task_id}`))
    )

    if (!taskNode) return []

    // Find code_file nodes connected via modifies edges
    const modifiesEdges = store.edges.filter(
      (e) => e.type === "modifies" && e.source === taskNode.id
    )

    for (const edge of modifiesEdges) {
      const codeFileNode = store.nodes.find((n) => n.id === edge.target)
      if (codeFileNode?.metadata?.path) {
        files.push(codeFileNode.metadata.path)
      }
    }

    return files
  }

  private async getTargetFilesFromTasksMd(params: TaskQueryParams): Promise<string[]> {
    const files: string[] = []

    // Try to read tasks.md from spec directory
    const tasksPath = join(this.baseDir, "specforge", "specs", params.work_item_id, "tasks.md")
    let content: string
    try {
      content = await readFile(tasksPath, "utf-8")
    } catch {
      return files
    }

    // Find the section for the current task
    const taskId = params.task_id
    if (!taskId) return files

    // Look for 修改文件 field in the task section
    const lines = content.split("\n")
    let inTargetTask = false

    for (const line of lines) {
      // Check if we're entering the target task section
      const taskMatch = line.match(/^(?:##\s+Task\s+|[-]\s+\[[ x~-]\]\s+)(\d+)[.：:]/i)
      if (taskMatch) {
        inTargetTask = taskMatch[1] === taskId
        continue
      }

      if (inTargetTask) {
        // Look for 修改文件 lines
        const fileMatch = line.match(/修改文件[：:]\s*(.+)/)
        if (fileMatch) {
          const raw = fileMatch[1]
          const backtickPaths = raw.match(/`([^`]+)`/g)
          if (backtickPaths) {
            for (const bp of backtickPaths) {
              files.push(bp.replace(/`/g, "").trim())
            }
          }
        }
      }
    }

    return files
  }
}

// ============================================================
// Phase Context: Cross-Work-Item Matching (Requirement 7.4)
// ============================================================

export class PhaseContextSource implements ContextDataSource {
  name = "phase_context"

  constructor(private baseDir: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    const fragments: ContextFragment[] = []

    if (!params.phase) return fragments

    const enabled = await isKGEnabled(this.baseDir)
    if (!enabled) return fragments

    const loadResult = await loadGraphStore(this.baseDir)
    if (!loadResult.success || !loadResult.store) return fragments

    const store = loadResult.store

    // Map phase to node_type
    let targetNodeType: string
    switch (params.phase) {
      case "requirements":
        targetNodeType = "requirement"
        break
      case "design":
        targetNodeType = "design_decision"
        break
      case "tasks":
        targetNodeType = "task"
        break
      default:
        return fragments
    }

    // Find nodes from OTHER work items of the target type
    const candidateNodes = store.nodes.filter(
      (n) => n.type === targetNodeType && n.work_item_id !== params.work_item_id
    )

    if (candidateNodes.length === 0) return fragments

    // Get keywords from current work item's nodes for similarity matching
    const currentWINodes = store.nodes.filter(
      (n) => n.work_item_id === params.work_item_id
    )
    const currentKeywords = extractKeywords(currentWINodes)

    // Also use task_description keywords if available
    if (params.task_description) {
      const descKeywords = params.task_description.split(/[\s,;，、。！？]+/).filter((w) => w.length > 1)
      for (const kw of descKeywords) {
        currentKeywords.add(kw.toLowerCase())
      }
    }

    if (currentKeywords.size === 0) {
      // No keywords to match, return top-5 by recency
      const top5 = candidateNodes.slice(0, 5)
      for (const node of top5) {
        fragments.push({
          source_type: "knowledge_graph",
          source_id: node.id,
          category: node.type === "requirement" ? "requirement" : "design_decision",
          content: `[跨WI参考: ${node.work_item_id}] ${node.label}`,
          priority: 1,
        })
      }
      return fragments
    }

    // Score candidates by keyword overlap
    const scored = candidateNodes.map((node) => {
      const nodeWords = node.label.toLowerCase().split(/[\s,;，、。！？：:]+/).filter((w) => w.length > 1)
      let score = 0
      for (const word of nodeWords) {
        if (currentKeywords.has(word)) score++
      }
      return { node, score }
    })

    // Sort by score descending, take top-5
    scored.sort((a, b) => b.score - a.score)
    const top5 = scored.slice(0, 5).filter((s) => s.score > 0)

    // If no matches with score > 0, return empty
    if (top5.length === 0) return fragments

    for (const { node } of top5) {
      const category = node.type === "requirement" ? "requirement" : "design_decision"
      fragments.push({
        source_type: "knowledge_graph",
        source_id: node.id,
        category,
        content: `[跨WI参考: ${node.work_item_id}] ${node.label}`,
        priority: 1,
      })
    }

    return fragments
  }
}

function extractKeywords(nodes: GraphNode[]): Set<string> {
  const keywords = new Set<string>()
  for (const node of nodes) {
    const words = node.label.toLowerCase().split(/[\s,;，、。！？：:]+/).filter((w) => w.length > 1)
    for (const word of words) {
      keywords.add(word)
    }
  }
  return keywords
}

// ============================================================
// buildTaskContext
// ============================================================

const MAX_CONTEXT_LENGTH = 3000

/**
 * Build task context from all registered data sources.
 * Formats into structured text with sections.
 * Truncates to ≤3000 chars with priority: 历史经验 > 注意事项 > 设计决策 > 需求
 */
export async function buildTaskContext(
  params: TaskQueryParams,
  dataSources: ContextDataSource[],
  baseDir: string
): Promise<TaskContext> {
  // Collect fragments from all data sources
  const allFragments: ContextFragment[] = []
  const sources: Array<{ type: string; id: string }> = []

  for (const ds of dataSources) {
    try {
      const fragments = await ds.query(params)
      allFragments.push(...fragments)
    } catch {
      // Skip failed data sources
      continue
    }
  }

  if (allFragments.length === 0) {
    return { context: "", sources: [], estimated_tokens: 0 }
  }

  // Collect sources
  for (const f of allFragments) {
    if (!sources.some((s) => s.type === f.source_type && s.id === f.source_id)) {
      sources.push({ type: f.source_type, id: f.source_id })
    }
  }

  // Group by category
  const requirements = allFragments.filter((f) => f.category === "requirement")
  const designDecisions = allFragments.filter((f) => f.category === "design_decision")
  const successPatterns = allFragments.filter((f) => f.category === "success_pattern")
  const failurePatterns = allFragments.filter((f) => f.category === "failure_pattern")
  const warnings = allFragments.filter((f) => f.category === "warning")

  // Build sections with priority ordering for truncation
  // Priority: 历史经验(4) > 注意事项(3) > 设计决策(2) > 需求(1)
  const sections: Array<{ heading: string; items: ContextFragment[]; priority: number }> = [
    { heading: "## 历史经验", items: [...successPatterns, ...failurePatterns], priority: 4 },
    { heading: "## 注意事项", items: warnings, priority: 3 },
    { heading: "## 设计决策", items: designDecisions, priority: 2 },
    { heading: "## 相关需求", items: requirements, priority: 1 },
  ]

  // Sort sections by priority descending (highest priority first in output)
  sections.sort((a, b) => b.priority - a.priority)

  // Build context string with truncation
  let context = ""
  let remaining = MAX_CONTEXT_LENGTH

  for (const section of sections) {
    if (section.items.length === 0) continue
    if (remaining <= 0) break

    const sectionHeader = section.heading + "\n\n"
    if (remaining < sectionHeader.length + 10) break

    context += sectionHeader
    remaining -= sectionHeader.length

    for (const item of section.items) {
      const line = "- " + item.content + "\n"
      if (remaining < line.length) {
        // Truncate this item
        const truncated = "- " + item.content.substring(0, remaining - 6) + "...\n"
        context += truncated
        remaining = 0
        break
      }
      context += line
      remaining -= line.length
    }

    context += "\n"
    remaining -= 1
  }

  const trimmedContext = context.trim()
  const estimatedTokens = Math.ceil(trimmedContext.length / 3)

  return {
    context: trimmedContext,
    sources,
    estimated_tokens: estimatedTokens,
  }
}

// ============================================================
// Capability Broker: recommendCapabilities
// ============================================================

/**
 * Read skill_fragments.json and match task_description keywords against triggers.
 * For matches: read the skill_file, extract section by section_heading, return FULL content.
 */
export async function recommendCapabilities(
  params: TaskQueryParams,
  baseDir: string
): Promise<CapabilityRecommendation> {
  const emptyResult: CapabilityRecommendation = {
    recommended_fragments: [],
    estimated_tokens: 0,
  }

  // Read skill_fragments.json
  const configPath = join(baseDir, "specforge", "config", "skill_fragments.json")
  let configContent: string
  try {
    configContent = await readFile(configPath, "utf-8")
  } catch {
    return emptyResult
  }

  let config: SkillFragmentsConfig
  try {
    config = JSON.parse(configContent)
  } catch {
    return emptyResult
  }

  if (!config.fragments || !Array.isArray(config.fragments)) {
    return emptyResult
  }

  const taskDesc = params.task_description || ""
  if (!taskDesc) return emptyResult

  const taskDescLower = taskDesc.toLowerCase()
  const recommended: CapabilityRecommendation["recommended_fragments"] = []

  for (const fragment of config.fragments) {
    // Check if any trigger keyword appears in task_description
    const matched = fragment.triggers.some((trigger) =>
      taskDescLower.includes(trigger.toLowerCase())
    )

    if (!matched) continue

    // Read the skill file and extract the section
    const skillPath = join(baseDir, fragment.skill_file)
    let skillContent: string
    try {
      skillContent = await readFile(skillPath, "utf-8")
    } catch {
      continue
    }

    // Extract section by heading
    const sectionContent = extractSection(skillContent, fragment.section_heading)
    if (!sectionContent) continue

    const estimatedTokens = Math.ceil(sectionContent.length / 3)

    recommended.push({
      fragment_id: fragment.fragment_id,
      reason: `任务描述匹配触发词: ${fragment.triggers.filter((t) => taskDescLower.includes(t.toLowerCase())).join(", ")}`,
      content: sectionContent,
      estimated_tokens: estimatedTokens,
    })
  }

  const totalTokens = recommended.reduce((sum, r) => sum + r.estimated_tokens, 0)

  return {
    recommended_fragments: recommended,
    estimated_tokens: totalTokens,
  }
}

/**
 * Extract a section from markdown content by heading.
 * Returns the full content from the heading to the next same-level or higher heading.
 */
function extractSection(content: string, heading: string): string | null {
  const lines = content.split("\n")
  let startIdx = -1
  let headingLevel = 0

  // Find the heading
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match heading with any level
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const title = headingMatch[2].trim()
      if (title.includes(heading) || heading.includes(title)) {
        startIdx = i
        headingLevel = headingMatch[1].length
        break
      }
    }
  }

  if (startIdx === -1) return null

  // Find the end of the section (next heading of same or higher level)
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+/)
    if (headingMatch && headingMatch[1].length <= headingLevel) {
      endIdx = i
      break
    }
  }

  const sectionLines = lines.slice(startIdx, endIdx)
  return sectionLines.join("\n").trim()
}

// ============================================================
// Main Entry Point: buildContext
// ============================================================

/**
 * Main entry point for Context Builder.
 * Combines buildTaskContext and recommendCapabilities.
 */
export async function buildContext(
  workItemId: string,
  taskId: string | undefined,
  phase: string | undefined,
  includeCapabilities: boolean,
  baseDir: string
): Promise<ContextBuildResult> {
  const params: TaskQueryParams = {
    work_item_id: workItemId,
    task_id: taskId,
    phase,
  }

  // Build data sources
  const dataSources: ContextDataSource[] = [
    new KnowledgeGraphSource(baseDir),
    new ArchiveSource(baseDir),
  ]

  // Add phase context source if phase is set
  if (phase) {
    dataSources.push(new PhaseContextSource(baseDir))
  }

  const taskContext = await buildTaskContext(params, dataSources, baseDir)

  let capabilities: CapabilityRecommendation | undefined
  if (includeCapabilities) {
    capabilities = await recommendCapabilities(params, baseDir)
    // Only include if there are recommendations
    if (capabilities.recommended_fragments.length === 0) {
      capabilities = undefined
    }
  }

  return {
    task_context: taskContext,
    capabilities,
  }
}
