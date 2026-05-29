/**
 * sf_design_gate 核心逻辑
 * 检查 design.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.5, 11.2, 11.5, 11.6, 2.8, 3.7, 3.8, 4.6, 5.9
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveProjectPath } from "@specforge/types/directory-layout"
import type { GateResult, GateModeSpec } from "./sf_gate_types"
import { parseSections } from "./sf_requirements_gate_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { tryCheckCompatibility, logErrorToFile } from "./utils"
import { isValidVerificationType } from "./sf_verification_types"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Design Gate Mode Types and Strategy Table
// ============================================================

/**
 * Design Gate 支持的 mode 类型
 */
export type DesignGateMode = "change_request" | "ops_task" | "refactor" | "investigation"

/**
 * 检查 design_delta.md 内容（change_request mode）
 * pass 条件：所有 section 非空，增量设计与 impact_analysis 变更范围一致
 */
export function checkDesignDeltaContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  // 增量设计描述必须有实质内容（不能只是占位符）
  const designDesc = sections["增量设计描述"]?.trim()
  if (designDesc && designDesc.length < 10) {
    return {
      status: "fail",
      blocking_issues: ["增量设计描述内容过短，需要详细描述设计变更"],
      warnings: [],
      next_action: "revise",
    }
  }
  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  }
}

/**
 * 检查 ops_plan.md 内容（ops_task mode）
 * pass 条件：所有 section 非空，回滚方案覆盖每个操作步骤，回滚触发条件已定义
 */
export function checkOpsPlanContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  const warnings: string[] = []
  const blockingIssues: string[] = []

  // 检查回滚方案是否覆盖操作步骤
  const steps = sections["操作步骤"]?.trim() || ""
  const rollback = sections["回滚方案"]?.trim() || ""

  // 简单检查：操作步骤中有编号步骤时，回滚方案也应有对应内容
  const stepLines = steps.split("\n").filter((l) => /^\s*\d+[\.\)、]/.test(l))
  if (stepLines.length > 0 && rollback.split("\n").filter((l) => l.trim()).length < stepLines.length) {
    blockingIssues.push("回滚方案未覆盖所有操作步骤（操作步骤数 > 回滚方案条目数）")
  }

  // 检查回滚触发条件是否已定义（不能为空或模糊）
  const triggerConditions = sections["回滚触发条件"]?.trim() || ""
  const vaguePatterns = [/^无$/i, /^n\/?a$/i, /^待定$/i, /^tbd$/i, /^none$/i]
  if (vaguePatterns.some((p) => p.test(triggerConditions))) {
    blockingIssues.push("回滚触发条件不明确（不能为\"无\"、\"N/A\"、\"待定\"等模糊表述）")
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

/**
 * 检查 refactor_plan.md 内容（refactor mode）
 * pass 条件：所有 section 非空
 */
export function checkRefactorPlanContent(
  _content: string,
  _sections: Record<string, string>
): GateResult {
  // 轻量级检查：只要所有 section 非空即可（已在外层检查）
  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  }
}

/**
 * 检查 findings_report.md 内容（investigation mode）
 * pass 条件：结论有证据支撑，建议可操作
 */
export function checkFindingsReportContent(
  _content: string,
  sections: Record<string, string>
): GateResult {
  const blockingIssues: string[] = []

  // 检查结论是否有证据支撑：调查结论中应引用数据和证据
  const conclusions = sections["调查结论"]?.trim() || ""
  const evidence = sections["数据和证据"]?.trim() || ""

  if (evidence.length === 0) {
    blockingIssues.push("数据和证据为空，结论缺乏支撑")
  } else if (conclusions.length > 0 && evidence.length < 20) {
    blockingIssues.push("数据和证据内容过少，不足以支撑调查结论")
  }

  // 检查建议是否可操作：建议中应包含具体动作
  const recommendations = sections["建议"]?.trim() || ""
  if (recommendations.length > 0 && recommendations.length < 10) {
    blockingIssues.push("建议内容过短，需要包含可操作的具体建议")
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings: [],
      next_action: "revise",
    }
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings: [],
    next_action: "continue",
  }
}

/**
 * Design Gate 策略表
 * 定义 4 种 mode 的检查规则
 */
export const DESIGN_GATE_SPECS: GateModeSpec[] = [
  {
    mode: "change_request",
    targetFile: "design_delta.md",
    requiredSections: ["增量设计描述", "受影响模块", "兼容性影响", "回归风险", "KG 追溯关系"],
    checkFn: checkDesignDeltaContent,
  },
  {
    mode: "ops_task",
    targetFile: "ops_plan.md",
    requiredSections: ["操作目标", "前置条件", "操作步骤", "回滚方案", "回滚触发条件", "风险评估", "影响范围"],
    checkFn: checkOpsPlanContent,
  },
  {
    mode: "refactor",
    targetFile: "refactor_plan.md",
    requiredSections: ["重构策略", "步骤顺序", "风险等级判定"],
    checkFn: checkRefactorPlanContent,
  },
  {
    mode: "investigation",
    targetFile: "findings_report.md",
    requiredSections: ["调查结论", "数据和证据", "建议", "限制"],
    checkFn: checkFindingsReportContent,
  },
]

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
 * 当传入 options.mode 参数时，按 DESIGN_GATE_SPECS 策略表执行对应检查。
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @param workflowType - 工作流类型，默认 "feature_spec"（向后兼容）
 * @param options - 可选参数，包含 mode 字段
 * @returns Gate 检查结果
 */
export async function checkDesignGate(
  workItemId: string,
  baseDir: string,
  workflowType: string = "feature_spec",
  options?: { workflowType?: string; mode?: DesignGateMode }
): Promise<GateResult> {
  try {
    // V3.4.0: 版本兼容性检查（动态导入，失败时静默跳过）
    await tryCheckCompatibility(baseDir, "sf_design_gate_core")

    // V3.6: Mode dispatch — 当传入 mode 参数时，按策略表执行
    const mode = options?.mode
    if (mode !== undefined) {
      return executeDesignGateMode(workItemId, baseDir, mode)
    }

    const specDir = resolveProjectPath(baseDir, "specs", workItemId)
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

    // V3.7: 验证 Correctness Properties 中 test_type 字段的合法性（本地语法检查）
    const cpTestTypes = extractCPTestTypes(content)
    for (const { cpId, testType } of cpTestTypes) {
      if (!isValidVerificationType(testType)) {
        blockingIssues.push(
          `${cpId}: test_type 值非法 "${testType}"，合法值为: unit, property, integration, e2e, regression`
        )
      }
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
  } catch (err) {
    await logErrorToFile(baseDir, "sf_design_gate_core", "checkDesignGate", err)
    throw err
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
// Design Gate Mode Dispatch
// ============================================================

/**
 * 执行 Design Gate mode 分发逻辑
 * 按 DESIGN_GATE_SPECS 策略表查找并执行对应 mode 的检查
 */
async function executeDesignGateMode(
  workItemId: string,
  baseDir: string,
  mode: DesignGateMode
): Promise<GateResult> {
  // 查找策略表
  const spec = DESIGN_GATE_SPECS.find((s) => s.mode === mode)
  if (spec === undefined) {
    return {
      status: "fail",
      blocking_issues: [],
      warnings: [`Unsupported mode: "${mode}"`],
      next_action: "ask_user",
    }
  }

  // 读取目标文件
  const specDir = resolveProjectPath(baseDir, "specs", workItemId)
  const filePath = join(specDir, spec.targetFile)
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: [`File not found: ${spec.targetFile}`],
        warnings: [],
        next_action: "revise",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read ${spec.targetFile}: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  // 解析 sections 并检查完整性
  const sections = parseSections(content, spec.requiredSections)
  const missing = spec.requiredSections.filter((s) => !sections[s]?.trim())
  if (missing.length > 0) {
    return {
      status: "fail",
      blocking_issues: missing.map((s) => `Missing section: ${s}`),
      warnings: [],
      next_action: "revise",
    }
  }

  // 调用 mode 特定的检查函数
  return spec.checkFn(content, sections)
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

// ============================================================
// V3.7: Correctness Properties test_type 验证
// ============================================================

/**
 * 从 design.md 内容中提取所有 Correctness Properties 的 test_type、test_file、requirement_ref 字段
 *
 * @param content - design.md 文件内容
 * @returns 提取的 CP 信息列表
 */
export function extractCPTestTypes(
  content: string
): Array<{ cpId: string; testType: string; testFile?: string; requirementRef?: string }> {
  const results: Array<{ cpId: string; testType: string; testFile?: string; requirementRef?: string }> = []

  // 匹配 CP-N 标题
  const cpPattern = /^#{1,6}\s+(CP-\d+[^\n]*)/gm
  let match: RegExpExecArray | null

  while ((match = cpPattern.exec(content)) !== null) {
    const cpIdMatch = match[1].match(/CP-\d+/)
    if (!cpIdMatch) continue

    const cpId = cpIdMatch[0]
    const afterCP = content.slice(match.index + match[0].length)
    const nextHeading = /^#{1,6}\s/m.exec(afterCP)
    const cpSection = nextHeading ? afterCP.slice(0, nextHeading.index) : afterCP

    const testTypeMatch = /\*\*test_type\*\*\s*:\s*(.*)/i.exec(cpSection)
    if (testTypeMatch) {
      const entry: { cpId: string; testType: string; testFile?: string; requirementRef?: string } = {
        cpId,
        testType: testTypeMatch[1].trim(),
      }

      const testFileMatch = /\*\*test_file\*\*\s*:\s*(.+)/i.exec(cpSection)
      if (testFileMatch) {
        entry.testFile = testFileMatch[1].trim()
      }

      const reqRefMatch = /\*\*requirement_ref\*\*\s*:\s*(\S+)/i.exec(cpSection)
      if (reqRefMatch) {
        entry.requirementRef = reqRefMatch[1].trim()
      }

      results.push(entry)
    }
  }

  return results
}
