/**
 * sf_design_gate 核心逻辑
 * 检查 design.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.5
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { GateResult } from "./sf_requirements_gate_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 design gate 检查（扩展版）
 *
 * 检查项（默认模式 feature_spec / bugfix_spec）：
 * 1. design.md 是否存在
 * 2. 是否引用了 requirements.md 中的需求编号（"需求 \d+" 或 "Requirement \d+"）
 *
 * 检查项（feature_spec_design_first 模式）：
 * 1. design.md 是否存在
 * 2. 是否包含架构概述章节
 * 3. 是否定义模块或组件边界
 * 4. 是否包含数据模型或接口定义
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @param workflowType - 工作流类型，默认 "feature_spec"
 * @returns Gate 检查结果
 */
export async function checkDesignGate(
  workItemId: string,
  baseDir: string,
  workflowType: string = "feature_spec"
): Promise<GateResult> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  const specDir = join(baseDir, "specforge", "specs", workItemId)
  const docPath = join(specDir, "design.md")

  // 1. 读取 design.md
  let content: string
  try {
    content = await readFile(docPath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: ["design.md not found"],
        warnings: [],
        next_action: "revise",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read design.md: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  // 2. 根据 workflow_type 选择检查标准
  if (workflowType === "feature_spec_design_first") {
    const designFirstResult = checkDesignGateDesignFirst(content)
    if (designFirstResult.status === "pass") {
      // ★ V4.0: KG sync on pass
      let kgSync: SyncSummary | null = null
      try {
        if (await isKGEnabled(baseDir)) {
          const kgResult = await syncFromSpec(workItemId, baseDir, "design")
          if (kgResult.success && kgResult.summary) {
            kgSync = kgResult.summary
          } else if (kgResult.error) {
            designFirstResult.warnings.push(`KG sync warning: ${kgResult.error}`)
          }
        }
      } catch (err) {
        designFirstResult.warnings.push(`KG sync failed: ${(err as Error).message}`)
      }
      designFirstResult.kg_sync = kgSync
    }
    return designFirstResult
  }

  // 3. 默认行为（feature_spec / bugfix_spec）：检查需求引用（V1 行为不变）
  const blockingIssues: string[] = []
  const warnings: string[] = []

  if (!hasRequirementReferences(content)) {
    blockingIssues.push(
      '设计文档未引用需求编号（需要包含"需求 X"、"REQ-XXX"或"Requirement X"格式的引用）'
    )
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  // ★ V4.0: KG sync on pass
  let kgSync: SyncSummary | null = null
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, "design")
      if (kgResult.success && kgResult.summary) {
        kgSync = kgResult.summary
      } else if (kgResult.error) {
        warnings.push(`KG sync warning: ${kgResult.error}`)
      }
    }
  } catch (err) {
    warnings.push(`KG sync failed: ${(err as Error).message}`)
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    kg_sync: kgSync,
  }
}

/**
 * Design-First 工作流的 design gate 检查
 * 不检查需求引用，改为检查架构完整性
 */
export function checkDesignGateDesignFirst(content: string): GateResult {
  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 检查 1: 架构概述章节
  if (!hasArchitectureSection(content)) {
    blockingIssues.push(
      `design.md 缺少架构概述章节（需要包含\u201C架构\u201D、\u201CArchitecture\u201D或\u201C概述\u201D标题）`
    )
  }

  // 检查 2: 模块或组件边界
  if (!hasModuleBoundaries(content)) {
    blockingIssues.push(
      `design.md 未定义模块或组件边界（需要包含\u201C模块\u201D、\u201C组件\u201D、\u201CModule\u201D或\u201CComponent\u201D）`
    )
  }

  // 检查 3: 数据模型或接口定义
  if (!hasDataModelOrInterface(content)) {
    blockingIssues.push(
      `design.md 缺少数据模型或接口定义（需要包含\u201C数据模型\u201D、\u201C接口\u201D、\u201CData Model\u201D或\u201CInterface\u201D）`
    )
  }

  if (blockingIssues.length > 0) {
    return { status: "fail", blocking_issues: blockingIssues, warnings, next_action: "revise" }
  }

  return { status: "pass", blocking_issues: [], warnings, next_action: "continue" }
}

// ============================================================
// Helper functions
// ============================================================

/**
 * 检查是否引用了需求编号
 * Standardized: refs: [REQ-1, REQ-3]
 * Legacy: "需求 1", "需求 12", "Requirement 1", "Requirement 12", "REQ-001" 等
 */
export function hasRequirementReferences(content: string): boolean {
  const patterns = [/refs:\s*\[[^\]]*REQ-\d+/i, /需求\s*\d+/i, /requirement\s*\d+/i, /REQ[-_]?\w*\d+/i]
  return patterns.some((pattern) => pattern.test(content))
}

// ============================================================
// Design-First Helper Functions
// ============================================================

/**
 * 检查是否包含架构概述章节
 * 匹配标题中包含 "架构"、"Architecture"、"概述"、"Overview"
 */
export function hasArchitectureSection(content: string): boolean {
  const patterns = [/#+\s*.*架构/i, /#+\s*.*architecture/i, /#+\s*.*概述/i, /#+\s*.*overview/i]
  return patterns.some((p) => p.test(content))
}

/**
 * 检查是否定义了模块或组件边界
 * 匹配内容中包含 "模块"、"组件"、"Module"、"Component"
 */
export function hasModuleBoundaries(content: string): boolean {
  const patterns = [/模块/i, /组件/i, /module/i, /component/i]
  return patterns.some((p) => p.test(content))
}

/**
 * 检查是否包含数据模型或接口定义
 * 匹配内容中包含 "数据模型"、"接口"、"Data Model"、"Interface"
 */
export function hasDataModelOrInterface(content: string): boolean {
  const patterns = [/数据模型/i, /接口/i, /data\s*model/i, /interface/i, /类型定义/i, /type\s*defin/i]
  return patterns.some((p) => p.test(content))
}
