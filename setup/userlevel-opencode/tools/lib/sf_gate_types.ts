/**
 * sf_gate_types — 共享 Gate 类型定义
 *
 * GateResult 类型由所有 Gate core 模块从此文件共享。
 *
 * Requirements: REQ-8 AC-5
 */

// ============================================================
// GateResult — 所有 Gate 工具的统一返回类型
// ============================================================

export interface GateResult {
  status: "pass" | "fail" | "blocked"
  blocking_issues: string[]
  warnings: string[]
  next_action: "continue" | "revise" | "ask_user"
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
