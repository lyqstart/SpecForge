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

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 design gate 检查
 *
 * 检查项：
 * 1. design.md 是否存在
 * 2. 是否引用了 requirements.md 中的需求编号（"需求 \d+" 或 "Requirement \d+"）
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkDesignGate(
  workItemId: string,
  baseDir: string
): Promise<GateResult> {
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

  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 2. 检查是否引用了需求编号
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

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

// ============================================================
// Helper functions
// ============================================================

/**
 * 检查是否引用了需求编号
 * 匹配: "需求 1", "需求 12", "Requirement 1", "Requirement 12" 等
 */
export function hasRequirementReferences(content: string): boolean {
  const patterns = [/需求\s*\d+/i, /requirement\s*\d+/i, /REQ[-_]?\w*\d+/i]
  return patterns.some((pattern) => pattern.test(content))
}
