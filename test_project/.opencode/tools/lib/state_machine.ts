/**
 * SpecForge 状态机定义
 * 定义 Feature Spec 工作流的合法状态流转表
 */

// ============================================================
// States
// ============================================================

/**
 * Feature Spec 工作流的所有合法状态
 */
export const ALL_STATES = [
  "intake",
  "requirements",
  "requirements_gate",
  "design",
  "design_gate",
  "tasks",
  "tasks_gate",
  "development",
  "review",
  "verification",
  "verification_gate",
  "completed",
  "blocked",
] as const

export type WorkflowState = (typeof ALL_STATES)[number]

// ============================================================
// Transition Table
// ============================================================

/**
 * 合法状态流转表
 * key: 当前状态（from_state）
 * value: 该状态可以流转到的合法目标状态列表
 */
export const VALID_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["requirements"]],
    ["requirements", ["requirements_gate"]],
    ["requirements_gate", ["design", "requirements", "blocked"]],
    ["design", ["design_gate"]],
    ["design_gate", ["tasks", "design", "blocked"]],
    ["tasks", ["tasks_gate"]],
    ["tasks_gate", ["development", "tasks", "blocked"]],
    ["development", ["review"]],
    ["review", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

// ============================================================
// Validation
// ============================================================

/**
 * 验证状态流转是否合法
 * @param from 当前状态
 * @param to 目标状态
 * @returns 如果流转合法返回 true，否则返回 false
 */
export function isValidTransition(from: string, to: string): boolean {
  const validTargets = VALID_TRANSITIONS.get(from)
  if (!validTargets) {
    return false
  }
  return validTargets.includes(to)
}
