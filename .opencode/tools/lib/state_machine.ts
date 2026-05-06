/**
 * SpecForge 状态机定义
 * 定义多种工作流的合法状态流转表
 */

// ============================================================
// Workflow Types
// ============================================================

/**
 * 支持的工作流类型
 */
export type WorkflowType =
  | "feature_spec"
  | "bugfix_spec"
  | "feature_spec_design_first"
  | "quick_change"
  | "change_request"
  | "refactor"
  | "ops_task"
  | "investigation"

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
// Transition Tables
// ============================================================

/**
 * Feature Spec（Requirements-First）合法状态流转表
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

/**
 * Bugfix Spec 工作流合法状态流转表
 */
export const BUGFIX_SPEC_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["bugfix_analysis"]],
    ["bugfix_analysis", ["bugfix_gate"]],
    ["bugfix_gate", ["fix_design", "bugfix_analysis", "blocked"]],
    ["fix_design", ["design_gate"]],
    ["design_gate", ["tasks", "fix_design", "blocked"]],
    ["tasks", ["tasks_gate"]],
    ["tasks_gate", ["development", "tasks", "blocked"]],
    ["development", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

/**
 * Feature Spec Design-First 工作流合法状态流转表
 */
export const DESIGN_FIRST_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["design"]],
    ["design", ["design_gate"]],
    ["design_gate", ["requirements", "design", "blocked"]],
    ["requirements", ["requirements_gate"]],
    ["requirements_gate", ["tasks", "requirements", "blocked"]],
    ["tasks", ["tasks_gate"]],
    ["tasks_gate", ["development", "tasks", "blocked"]],
    ["development", ["review"]],
    ["review", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

/**
 * Quick Change 工作流合法状态流转表
 */
export const QUICK_CHANGE_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["quick_tasks"]],
    ["quick_tasks", ["development"]],
    ["development", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

/**
 * Change Request 工作流合法状态流转表
 */
export const CHANGE_REQUEST_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["impact_analysis"]],
    ["impact_analysis", ["impact_analysis_gate"]],
    ["impact_analysis_gate", ["design_delta", "impact_analysis", "blocked"]],
    ["design_delta", ["design_gate"]],
    ["design_gate", ["tasks", "design_delta", "blocked"]],
    ["tasks", ["tasks_gate"]],
    ["tasks_gate", ["development", "tasks", "blocked"]],
    ["development", ["review"]],
    ["review", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

/**
 * Refactor 工作流合法状态流转表
 */
export const REFACTOR_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["refactor_analysis"]],
    ["refactor_analysis", ["refactor_analysis_gate"]],
    ["refactor_analysis_gate", ["refactor_plan", "refactor_analysis", "blocked"]],
    ["refactor_plan", ["refactor_plan_gate"]],
    ["refactor_plan_gate", ["development", "refactor_plan", "blocked"]],
    ["development", ["review", "verification"]],
    ["review", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "development", "blocked"]],
  ])

/**
 * Ops Task 工作流合法状态流转表
 */
export const OPS_TASK_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["ops_plan"]],
    ["ops_plan", ["ops_plan_gate"]],
    ["ops_plan_gate", ["tasks", "ops_plan", "blocked"]],
    ["tasks", ["tasks_gate"]],
    ["tasks_gate", ["execution", "tasks", "blocked"]],
    ["execution", ["verification"]],
    ["verification", ["verification_gate"]],
    ["verification_gate", ["completed", "execution", "blocked"]],
  ])

/**
 * Investigation 工作流合法状态流转表
 */
export const INVESTIGATION_TRANSITIONS: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ["intake", ["investigation_plan"]],
    ["investigation_plan", ["investigation_plan_gate"]],
    ["investigation_plan_gate", ["research", "investigation_plan", "blocked"]],
    ["research", ["findings_report"]],
    ["findings_report", ["findings_report_gate"]],
    ["findings_report_gate", ["completed", "research", "findings_report", "blocked"]],
  ])

// ============================================================
// Transition Table Lookup
// ============================================================

/**
 * 根据工作流类型获取对应的状态流转表
 * @param workflowType 工作流类型
 * @returns 对应的状态流转表
 */
export function getTransitionTable(
  workflowType: WorkflowType
): ReadonlyMap<string, readonly string[]> {
  switch (workflowType) {
    case "feature_spec":
      return VALID_TRANSITIONS
    case "bugfix_spec":
      return BUGFIX_SPEC_TRANSITIONS
    case "feature_spec_design_first":
      return DESIGN_FIRST_TRANSITIONS
    case "quick_change":
      return QUICK_CHANGE_TRANSITIONS
    case "change_request":
      return CHANGE_REQUEST_TRANSITIONS
    case "refactor":
      return REFACTOR_TRANSITIONS
    case "ops_task":
      return OPS_TASK_TRANSITIONS
    case "investigation":
      return INVESTIGATION_TRANSITIONS
  }
}

// ============================================================
// Validation
// ============================================================

/**
 * 验证状态流转是否合法
 * @param from 当前状态
 * @param to 目标状态
 * @param workflowType 工作流类型（默认 "feature_spec"，保持向后兼容）
 * @returns 如果流转合法返回 true，否则返回 false
 */
export function isValidTransition(
  from: string,
  to: string,
  workflowType: WorkflowType = "feature_spec"
): boolean {
  const table = getTransitionTable(workflowType)
  const validTargets = table.get(from)
  if (!validTargets) {
    return false
  }
  return validTargets.includes(to)
}
