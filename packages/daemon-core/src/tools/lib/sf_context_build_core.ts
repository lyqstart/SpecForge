/**
 * sf_context_build 核心逻辑
 * Context Builder + Capability Broker
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时）
 *
 * Requirements: 5.1-5.10, 6.1-6.7, 7.4
 */

import { readFile, readdir } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import {
  SPEC_DIR_NAME,
  resolveProjectPath,
  workItemSpecArtifactReadCandidates,
} from "@specforge/types/directory-layout"
import { loadGraphStore, isKGEnabled } from "./sf_knowledge_graph_core"
import { impactAnalysis, getSubgraph } from "./sf_knowledge_query_core"
import { tryCheckCompatibility, logErrorToFile } from "./utils"
import type { GraphNode } from "./sf_knowledge_graph_core"
import { resolveSystemGovernanceRequirement } from "./sf_design_governance_policy"

/**
 * Thrown when sf_context_build cannot collect any governance context fragments.
 * This is a fail-closed behavior: an empty context means the consuming agent
 * has no governance constraints, which is unsafe for task execution.
 */
export class ContextBuildError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "ContextBuildError"
    this.code = code
  }
}

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
  category: "governance" | "requirement" | "design_decision" | "success_pattern" | "failure_pattern" | "warning"
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
  context_id: string
  context_sha256: string
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
  task_context?: TaskContext
  capabilities?: CapabilityRecommendation
}

export type ContextBuildOptions = Pick<
  TaskQueryParams,
  "task_description" | "workflow_type" | "target_files" | "file_types"
>

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
    const archiveDir = join(this.baseDir, SPEC_DIR_NAME, 'runtime', 'archive', 'agent_runs')
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

    // Candidate is authoritative; Work Item root and legacy specs are read-only fallbacks.
    let content: string | null = null
    for (const tasksPath of workItemSpecArtifactReadCandidates(
      this.baseDir,
      params.work_item_id,
      "tasks",
    )) {
      try {
        content = await readFile(tasksPath, "utf-8")
        break
      } catch {
        // Continue through the declared compatibility order.
      }
    }
    if (content === null) {
      return files
    }

    // Find the section for the current task
    const taskId = params.task_id
    if (!taskId) return files

    // Look for 修改文件 field in the task section
    const lines = content.split("\n")
    let inTargetTask = false
    const normalizedTaskId = taskId.trim().toUpperCase()

    for (const line of lines) {
      // Check if we're entering the target task section
      const canonicalTaskMatch = line.match(/^#{2,4}\s+(TASK-WI-\d{4}-\d{3})\b/i)
      const legacyTaskMatch = line.match(
        /^(?:##\s+Task\s+|[-]\s+\[[ x~-]\]\s+)(\d+)[.：:]/i,
      )
      if (canonicalTaskMatch || legacyTaskMatch) {
        const foundTaskId = (canonicalTaskMatch?.[1] ?? legacyTaskMatch?.[1] ?? "")
          .trim()
          .toUpperCase()
        inTargetTask =
          foundTaskId === normalizedTaskId ||
          (legacyTaskMatch !== null &&
            normalizedTaskId.endsWith(`-${foundTaskId.padStart(3, "0")}`))
        continue
      }

      if (inTargetTask) {
        // Support the canonical task-document/v1 fields and the legacy Chinese label.
        const fileMatch = line.match(
          /(?:修改文件[：:]|\*\*(?:files|allowed_write_files)\*\*\s*:)\s*(.+)/i,
        )
        if (fileMatch) {
          const raw = fileMatch[1]
          const backtickPaths = raw.match(/`([^`]+)`/g)
          if (backtickPaths) {
            for (const bp of backtickPaths) {
              files.push(bp.replace(/`/g, "").trim())
            }
          } else {
            for (const entry of raw.replace(/^\[/, "").replace(/\]$/, "").split(",")) {
              const candidate = entry.replace(/['"]/g, "").trim()
              if (candidate) files.push(candidate)
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


// ============================================================
// Project Governance Context: authoritative upper-layer constraints
// ============================================================

function normalizeContextPath(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
}

async function readJsonForContext(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"))
  } catch {
    return null
  }
}

function stringArrayForContext(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))
  ).sort()
}

function recordForContext(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, any>
}

function firstNonEmptyStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const normalized = stringArrayForContext(value)
    if (normalized.length > 0) return normalized
  }
  return []
}

async function resolveContextScope(
  workItemDir: string,
  trigger: Record<string, any> | null
): Promise<{
  rawScope: Record<string, any>
  sourceFile: "governance_scope.json" | "trigger_result.json"
  preferCandidate: boolean
} | null> {
  const frozenScope = recordForContext(
    await readJsonForContext(join(workItemDir, "governance_scope.json"))
  )
  if (frozenScope?.active === true) {
    return {
      rawScope: {
        ...frozenScope,
        planned_code_paths:
          frozenScope.planned_code_paths ?? frozenScope.allowed_write_files,
      },
      sourceFile: "governance_scope.json",
      preferCandidate: false,
    }
  }

  const impactScope = recordForContext(trigger?.impact_scope)
  if (impactScope) {
    return {
      rawScope: impactScope,
      sourceFile: "trigger_result.json",
      preferCandidate: true,
    }
  }

  const impactSummary = recordForContext(trigger?.impact_summary)
  if (!impactSummary) return null

  return {
    rawScope: {
      ...impactSummary,
      affected_modules: firstNonEmptyStringArray(
        impactSummary.affected_modules,
        impactSummary.impacted_modules,
        impactSummary.changed_modules,
        impactSummary.new_modules,
        impactSummary.existing_modules
      ),
      planned_code_paths:
        impactSummary.planned_code_paths ??
        impactSummary.allowed_write_files ??
        impactSummary.target_files,
    },
    sourceFile: "trigger_result.json",
    preferCandidate: true,
  }
}

function clipContext(value: string, max = 800): string {
  const compact = value.replace(/\r/g, "").trim()
  return compact.length <= max ? compact : compact.slice(0, max - 3) + "..."
}

function referencedMarkdown(text: string, refs: string[]): string {
  const lines = text.replace(/\r/g, "").split("\n")
  const chunks: string[] = []
  for (const ref of refs) {
    const index = lines.findIndex((line) => line.includes(ref))
    if (index < 0) continue
    const start = Math.max(0, index - 1)
    const end = Math.min(lines.length, index + 5)
    chunks.push(lines.slice(start, end).join("\n").trim())
  }
  return clipContext(Array.from(new Set(chunks)).join("\n"), 900)
}

function collectContractEntries(
  value: unknown,
  wanted: Set<string>,
  out: Array<Record<string, unknown>>
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectContractEntries(item, wanted, out)
    return
  }
  if (!value || typeof value !== "object") return
  const record = value as Record<string, unknown>
  if (typeof record.id === "string" && wanted.has(record.id)) {
    out.push(record)
  }
  for (const child of Object.values(record)) {
    collectContractEntries(child, wanted, out)
  }
}

export class ProjectGovernanceContextSource implements ContextDataSource {
  name = "project_governance"

  constructor(private baseDir: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    const workItemDir = join(
      this.baseDir,
      SPEC_DIR_NAME,
      "work-items",
      params.work_item_id
    )
    const trigger = recordForContext(
      await readJsonForContext(join(workItemDir, "trigger_result.json"))
    )
    const resolvedScope = await resolveContextScope(workItemDir, trigger)
    if (!resolvedScope) return []
    const { rawScope, sourceFile, preferCandidate } = resolvedScope

    const scope = {
      affected_modules: stringArrayForContext(rawScope.affected_modules),
      architecture_refs: stringArrayForContext(rawScope.architecture_refs),
      data_model_refs: stringArrayForContext(rawScope.data_model_refs),
      design_refs: stringArrayForContext(rawScope.design_refs),
      project_contract_refs: stringArrayForContext(rawScope.project_contract_refs),
      module_contract_refs: stringArrayForContext(rawScope.module_contract_refs),
      planned_code_paths: stringArrayForContext(rawScope.planned_code_paths),
    }

    const manifestPath = join(
      this.baseDir,
      SPEC_DIR_NAME,
      "project",
      "spec_manifest.json"
    )
    const manifest = (await readJsonForContext(manifestPath)) ?? {}
    const project = manifest.project ?? {}
    const candidateManifest =
      (await readJsonForContext(join(workItemDir, "candidate_manifest.json"))) ?? {}
    const targetMap = new Map<string, string>()
    for (const entry of Array.isArray(candidateManifest.entries)
      ? candidateManifest.entries
      : []) {
      const target = normalizeContextPath(entry?.target_path)
      const candidate = normalizeContextPath(entry?.candidate_path ?? entry?.path)
      if (target && candidate && !candidate.includes("..")) {
        targetMap.set(target, join(workItemDir, candidate))
      }
    }

    const prospectiveText = async (
      targetPath: string,
      conventionalCandidate?: string
    ): Promise<string> => {
      const target = normalizeContextPath(targetPath)
      const explicit = targetMap.get(target)

      const readFormal = async (): Promise<string> => {
        try {
          return await readFile(
            isAbsolute(targetPath) ? targetPath : join(this.baseDir, target),
            "utf-8"
          )
        } catch {
          return ""
        }
      }

      const readCandidate = async (): Promise<string> => {
        if (explicit) {
          try {
            return await readFile(explicit, "utf-8")
          } catch {
            // fall through to conventional candidate
          }
        }
        if (!conventionalCandidate) return ""
        try {
          return await readFile(join(workItemDir, conventionalCandidate), "utf-8")
        } catch {
          return ""
        }
      }

      if (preferCandidate) {
        return (await readCandidate()) || (await readFormal())
      }
      return (await readFormal()) || (await readCandidate())
    }

    const architectureTarget = normalizeContextPath(
      project.architecture ?? `${SPEC_DIR_NAME}/project/architecture.md`
    )
    const dataModelTarget = normalizeContextPath(
      project.data_model ?? `${SPEC_DIR_NAME}/project/data_model.md`
    )
    const extensionRegistryTarget = normalizeContextPath(
      project.extension_registry ?? `${SPEC_DIR_NAME}/project/extension_registry.json`
    )

    const architectureText = await prospectiveText(
      architectureTarget,
      "candidates/project/architecture.candidate.md"
    )
    const dataModelText = await prospectiveText(
      dataModelTarget,
      "candidates/project/data_model.candidate.md"
    )
    const extensionRegistryText = await prospectiveText(extensionRegistryTarget)

    const blocks: string[] = [
      `Impact Scope: modules=${scope.affected_modules.join(",") || "none"}; ` +
        `planned_code_paths=${scope.planned_code_paths.join(",") || "none"}`,
    ]

    const architectureBlock = referencedMarkdown(
      architectureText,
      scope.architecture_refs
    )
    if (architectureBlock) {
      blocks.push(
        `Architecture [${scope.architecture_refs.join(",")}]\n${architectureBlock}`
      )
    }

    const dataModelBlock = referencedMarkdown(dataModelText, scope.data_model_refs)
    if (dataModelBlock) {
      blocks.push(`Data Model [${scope.data_model_refs.join(",")}]\n${dataModelBlock}`)
    }

    const projectContracts: Array<Record<string, unknown>> = []
    if (extensionRegistryText && scope.project_contract_refs.length > 0) {
      try {
        collectContractEntries(
          JSON.parse(extensionRegistryText),
          new Set(scope.project_contract_refs),
          projectContracts
        )
      } catch {
        // malformed content is handled by Contract Integrity Gate
      }
    }
    if (projectContracts.length > 0) {
      blocks.push(`Project Contracts\n${clipContext(JSON.stringify(projectContracts), 700)}`)
    }

    for (const moduleCode of scope.affected_modules) {
      const rawModule = (Array.isArray(manifest.modules) ? manifest.modules : []).find(
        (entry: any) =>
          String(
            entry?.module_code ??
              entry?.name ??
              entry?.module_id ??
              entry?.module ??
              entry?.id ??
              ""
          )
            .replace(/^MOD-/i, "")
            .toUpperCase() === moduleCode.toUpperCase()
      )
      const moduleRoot = `${SPEC_DIR_NAME}/project/modules/${moduleCode}`
      const requirementsTarget = normalizeContextPath(
        rawModule?.requirements ?? `${moduleRoot}/requirements.md`
      )
      const designTarget = normalizeContextPath(
        rawModule?.design ?? `${moduleRoot}/design.md`
      )
      const contractsTarget = normalizeContextPath(
        rawModule?.contracts ?? `${moduleRoot}/contracts.json`
      )

      const requirementsText = await prospectiveText(
        requirementsTarget,
        `candidates/project/modules/${moduleCode}/requirements.candidate.md`
      )
      if (requirementsText) {
        blocks.push(
          `Requirement ${moduleCode}\n${clipContext(requirementsText, 550)}`
        )
      }

      const moduleDesignRefs = scope.design_refs.filter((ref) =>
        ref.toUpperCase().includes(`-${moduleCode.toUpperCase()}-`)
      )
      const designText = await prospectiveText(
        designTarget,
        `candidates/project/modules/${moduleCode}/design.candidate.md`
      )
      const designBlock = referencedMarkdown(designText, moduleDesignRefs)
      if (designBlock) {
        blocks.push(`Module Design ${moduleCode}\n${designBlock}`)
      }

      const moduleContractIds = new Set(scope.module_contract_refs)
      if (moduleContractIds.size > 0) {
        const contractsText = await prospectiveText(
          contractsTarget,
          `candidates/project/modules/${moduleCode}/contracts.candidate.json`
        )
        if (contractsText) {
          try {
            const internalContracts: Array<Record<string, unknown>> = []
            collectContractEntries(
              JSON.parse(contractsText),
              moduleContractIds,
              internalContracts
            )
            if (internalContracts.length > 0) {
              blocks.push(
                `Module Contracts ${moduleCode}\n${clipContext(
                  JSON.stringify(internalContracts),
                  650
                )}`
              )
            }
          } catch {
            // malformed content is handled by Contract Integrity Gate
          }
        }
      }
    }

    return [
      {
        source_type: this.name,
        source_id: normalizeContextPath(
          `${SPEC_DIR_NAME}/work-items/${params.work_item_id}/${sourceFile}`
        ),
        category: "governance",
        content: clipContext(blocks.join("\n\n"), 2400),
        priority: 5,
      },
    ]
  }
}

// ============================================================
// Runtime Policy Source: required design analysis scope
// ============================================================

export class DesignGovernancePolicySource implements ContextDataSource {
  name = "design_governance_policy"

  constructor(private baseDir: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    if (params.phase !== "design") return []

    const requirement = await resolveSystemGovernanceRequirement(
      params.work_item_id,
      this.baseDir
    )

    if (requirement.blocking_issue) {
      return [
        {
          source_type: this.name,
          source_id: requirement.source_path ?? "trigger_result.json",
          category: "warning",
          content:
            `DESIGN_SCOPE_BLOCKED: ${requirement.blocking_issue}. ` +
            "Do not author a design artifact until authoritative trigger facts are available.",
          priority: 5,
        },
      ]
    }

    const requiredScope = requirement.required ? "system_governance" : "solution_design"
    return [
      {
        source_type: this.name,
        source_id: requirement.source_path ?? "trigger_result.json",
        category: "design_decision",
        content:
          `required_analysis_scope: ${requiredScope}; ` +
          `runtime_basis: ${requirement.reasons.join(", ") || "no system-governance trigger"}`,
        priority: 5,
      },
    ]
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
// Knowledge Base Source: Global Knowledge Store (V5.0)
// ============================================================

const RELEVANCE_THRESHOLD = 60

/** 数据源 3：全局知识库（V5.0 新增） */
export class KnowledgeBaseSource implements ContextDataSource {
  name = "knowledge_base"

  constructor(private currentProject: string) {}

  async query(params: TaskQueryParams): Promise<ContextFragment[]> {
    try {
      const {
        searchEntries,
        updateEntry,
      } = await import("./sf_knowledge_base_core")

      // 从 TaskQueryParams 提取检索参数
      const keywords = extractSearchKeywordsFromDescription(params.task_description || "")
      const filePatterns = params.target_files || []
      const categoryHint = mapPhaseToKnowledgeCategory(params.phase)

      // 检索所有非 archived 条目
      const results = await searchEntries({
        keywords,
        file_patterns: filePatterns,
        category: categoryHint,
        limit: 20,
      })

      // 过滤可见性：active 全局可见，candidate 仅当前项目
      const visible = results.filter(
        (r) =>
          r.entry.status === "active" ||
          (r.entry.status === "candidate" && r.entry.source_project === this.currentProject)
      )

      // 应用最低阈值
      const qualified = visible.filter((r) => r.relevance_score >= RELEVANCE_THRESHOLD)

      // 取 top-5
      const top5 = qualified
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 5)

      // 递增 usage_count 并更新 last_used_at
      for (const result of top5) {
        await updateEntry({
          entry_id: result.entry.id,
          // updateEntry 内部会更新 updated_at 和 version
          // 我们需要手动处理 usage_count 和 last_used_at
        }).catch(() => {})
      }

      // 转换为 ContextFragment
      return top5.map((r) => ({
        source_type: "knowledge_base",
        source_id: r.entry.id,
        category: mapKnowledgeCategoryToFragment(r.entry.category),
        content: formatKnowledgeContent(r.entry, r.match_reasons),
        priority: 5,
      }))
    } catch {
      // Knowledge base unavailable, return empty
      return []
    }
  }
}

function extractSearchKeywordsFromDescription(description: string): string[] {
  return description
    .split(/[\s,;.!?，。；！？、：:]+/)
    .filter((w) => w.length > 1)
    .slice(0, 10)
}

function mapPhaseToKnowledgeCategory(phase?: string): string | undefined {
  const mapping: Record<string, string> = {
    development: "failure_pattern",
    design: "modification_pattern",
    requirements: "workflow_tip",
    tasks: "checklist",
  }
  return phase ? mapping[phase] : undefined
}

function mapKnowledgeCategoryToFragment(
  category: string
): "requirement" | "design_decision" | "success_pattern" | "failure_pattern" | "warning" {
  if (category === "failure_pattern") return "failure_pattern"
  if (category === "checklist") return "warning"
  return "success_pattern"
}

function formatKnowledgeContent(
  entry: { title: string; content: string; category: string; confidence: string; applicability: string; anti_conditions: string[] },
  matchReasons: string[]
): string {
  const parts = [
    `【${entry.title}】(${entry.category}, confidence=${entry.confidence})`,
    entry.content.length > 200 ? entry.content.substring(0, 200) + "..." : entry.content,
  ]
  if (entry.applicability) {
    parts.push(`适用范围: ${entry.applicability}`)
  }
  if (entry.anti_conditions.length > 0) {
    parts.push(`不适用: ${entry.anti_conditions.join("; ")}`)
  }
  parts.push(`匹配原因: ${matchReasons.join(", ")}`)
  return parts.join(" | ")
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
  try {
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
    throw new ContextBuildError(
      "CONTEXT_INCOMPLETE",
      "No governance context fragments were collected from any data source. " +
        "The Work Item may be missing trigger_result.json, governance_scope.json, " +
        "or candidate_manifest.json. Cannot build task context without governance constraints.",
    )
  }

  // Collect sources
  for (const f of allFragments) {
    if (!sources.some((s) => s.type === f.source_type && s.id === f.source_id)) {
      sources.push({ type: f.source_type, id: f.source_id })
    }
  }

  // Group by category
  const governance = allFragments.filter((f) => f.category === "governance")
  const requirements = allFragments.filter((f) => f.category === "requirement")
  const designDecisions = allFragments.filter((f) => f.category === "design_decision")
  const successPatterns = allFragments.filter((f) => f.category === "success_pattern")
  const failurePatterns = allFragments.filter((f) => f.category === "failure_pattern")
  const warnings = allFragments.filter((f) => f.category === "warning")

  // Build sections with priority ordering for truncation
  // Priority: 历史经验(4) > 注意事项(3) > 设计决策(2) > 需求(1)
  const sections: Array<{ heading: string; items: ContextFragment[]; priority: number }> = [
    { heading: "## 治理约束", items: governance, priority: 5 },
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

  // Generate deterministic context identity for executor binding
  const { createHash } = await import("node:crypto")
  const contextHash = createHash("sha256").update(trimmedContext).digest("hex")
  const contextId = "CTX-" + contextHash.substring(0, 16)

  return {
    context: trimmedContext,
    sources,
    estimated_tokens: estimatedTokens,
    context_id: contextId,
    context_sha256: contextHash,
  }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_context_build_core", "buildTaskContext", err)
    throw err
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
  try {
  const emptyResult: CapabilityRecommendation = {
    recommended_fragments: [],
    estimated_tokens: 0,
  }

  // Read skill_fragments.json
  const configPath = join(baseDir, SPEC_DIR_NAME, 'config', 'skill_fragments.json')
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
  } catch (err) {
    await logErrorToFile(baseDir, "sf_context_build_core", "recommendCapabilities", err)
    throw err
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
  baseDir: string,
  options: Partial<ContextBuildOptions> = {}
): Promise<ContextBuildResult> {
  try {
  // V3.4.0: 版本兼容性检查
  await tryCheckCompatibility(baseDir, "sf_context_build_core")

  const params: TaskQueryParams = {
    ...options,
    work_item_id: workItemId,
    task_id: taskId,
    phase,
  }

  // Build data sources
  const dataSources: ContextDataSource[] = [
    new ProjectGovernanceContextSource(baseDir),
    new DesignGovernancePolicySource(baseDir),
    new KnowledgeGraphSource(baseDir),
    new ArchiveSource(baseDir),
  ]

  // V5.0: Register Knowledge_DataSource if knowledge_base_enabled=true
  if (await isKnowledgeBaseEnabled(baseDir)) {
    const projectName = await getProjectNameForContext(baseDir)
    dataSources.push(new KnowledgeBaseSource(projectName))
  }

  // Add phase context source if phase is set
  if (phase) {
    dataSources.push(new PhaseContextSource(baseDir))
  }

  let taskContext: TaskContext | undefined
  try {
    taskContext = await buildTaskContext(params, dataSources, baseDir)
  } catch (err) {
    if (!(err instanceof ContextBuildError)) throw err
    // Context is incomplete; fall through to still build capabilities when requested
  }

  let capabilities: CapabilityRecommendation | undefined
  if (includeCapabilities) {
    capabilities = await recommendCapabilities(params, baseDir)
    // Only include if there are recommendations
    if (capabilities.recommended_fragments.length === 0) {
      capabilities = undefined
    }
  }

  // Fail-closed: incomplete context with no capabilities to return
  if (!taskContext && !capabilities) {
    throw new ContextBuildError(
      "CONTEXT_INCOMPLETE",
      "No governance context fragments were collected from any data source. " +
        "The Work Item may be missing trigger_result.json, governance_scope.json, " +
        "or candidate_manifest.json. Cannot build task context without governance constraints.",
    )
  }

  return {
    task_context: taskContext,
    capabilities,
  }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_context_build_core", "buildContext", err)
    throw err
  }
}

async function isKnowledgeBaseEnabled(baseDir: string): Promise<boolean> {
  try {
    const configPath = join(baseDir, SPEC_DIR_NAME, 'config', 'project.json')
    const content = await readFile(configPath, "utf-8")
    const config = JSON.parse(content)
    return config.knowledge_base_enabled === true
  } catch {
    return false
  }
}

async function getProjectNameForContext(baseDir: string): Promise<string> {
  try {
    const configPath = join(baseDir, SPEC_DIR_NAME, 'config', 'project.json')
    const content = await readFile(configPath, "utf-8")
    const config = JSON.parse(content)
    return config.name || "unknown"
  } catch {
    return "unknown"
  }
}
