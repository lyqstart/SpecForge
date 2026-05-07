/**
 * sf_gate_types — 共享 Gate 类型定义
 *
 * GateResult 和 SyncSummary 类型从 sf_requirements_gate_core.ts 迁移到此独立文件，
 * 所有 Gate core 模块从此文件导入共享类型。
 *
 * Requirements: REQ-8 AC-5
 */

import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export SyncSummary for convenience
export type { SyncSummary } from "./sf_knowledge_graph_core"

// ============================================================
// GateResult — 所有 Gate 工具的统一返回类型
// ============================================================

export interface GateResult {
  status: "pass" | "fail" | "blocked"
  blocking_issues: string[]
  warnings: string[]
  next_action: "continue" | "revise" | "ask_user"
  kg_sync?: SyncSummary | null
  details?: Record<string, unknown> // V3.7 新增，可选
}

// ============================================================
// GateModeSpec — Gate Mode 策略表接口
// ============================================================

/**
 * Gate Mode Spec 策略表接口
 * 定义每种 mode 的目标文件、必需 sections 和检查函数
 */
export interface GateModeSpec {
  mode: string
  targetFile: string
  requiredSections: string[]
  checkFn: (content: string, sections: Record<string, string>) => GateResult
}
