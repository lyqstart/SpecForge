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

/**
 * v1.1 Standard Workflow Paths (§7)
 * These are the canonical workflow path names per v1.1 standard.
 *
 * Legacy WorkflowType values are mapped to these paths.
 */
export type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'rollback_path';

/**
 * Maps legacy WorkflowType to v1.1 WorkflowPath.
 * Used during bootstrap period for backward compatibility.
 */
export const WORKFLOW_TYPE_TO_PATH: Readonly<Record<WorkflowType, WorkflowPath>> = {
  feature_spec: 'requirement_change_path',
  bugfix_spec: 'requirement_change_path',
  feature_spec_design_first: 'design_change_path',
  quick_change: 'code_only_fast_path',
  change_request: 'requirement_change_path',
  refactor: 'task_change_path',
  ops_task: 'task_change_path',
  investigation: 'requirement_change_path',
};

/**
 * Maps v1.1 WorkflowPath to a default legacy WorkflowType.
 * This is only a default when the caller did not provide a compatible workflow_type.
 *
 * Important:
 * - requirement_change_path can host feature_spec, bugfix_spec, change_request, investigation.
 * - task_change_path can host refactor or ops_task.
 * - Therefore callers must not blindly overwrite a compatible raw workflow_type with this default.
 */
export const WORKFLOW_PATH_TO_TYPE: Readonly<Record<WorkflowPath, WorkflowType>> = {
  requirement_change_path: 'feature_spec',
  design_change_path: 'feature_spec_design_first',
  architecture_change_path: 'feature_spec',
  task_change_path: 'refactor',
  code_only_fast_path: 'quick_change',
  spec_migration_path: 'feature_spec',
  rollback_path: 'feature_spec',
};

/**
 * A path is a coarse route; a workflow_type is the concrete workflow skill/identity.
 * A caller-provided workflow_type must be preserved when it is compatible with the selected path.
 */
export function isWorkflowTypeCompatibleWithPath(
  workflowType: string | undefined,
  workflowPath: string | undefined,
): workflowType is WorkflowType {
  if (!workflowType || !workflowPath) return false;
  if (!(workflowType in WORKFLOW_TYPE_TO_PATH)) return false;
  return WORKFLOW_TYPE_TO_PATH[workflowType as WorkflowType] === workflowPath;
}

export function resolveWorkflowTypeForPath(
  workflowPath: WorkflowPath | undefined,
  requestedWorkflowType?: string,
  existingWorkflowType?: string,
): WorkflowType | undefined {
  const candidate = requestedWorkflowType ?? existingWorkflowType;
  if (isWorkflowTypeCompatibleWithPath(candidate, workflowPath)) {
    return candidate;
  }
  if (workflowPath) return WORKFLOW_PATH_TO_TYPE[workflowPath];
  if (candidate && candidate in WORKFLOW_TYPE_TO_PATH) return candidate as WorkflowType;
  return undefined;
}

// ============================================================
// States
// ============================================================

/**
 * 所有工作流的合法状态（单一权威来源）
 */
export const ALL_STATES = [
  // ── Feature Spec 标准状态 ──
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
  "closed",
  "blocked",

  // ── Bugfix Spec ──
  "bugfix_analysis",
  "bugfix_gate",
  "fix_design",

  // ── Change Request ──
  "impact_analysis",
  "impact_analysis_gate",
  "design_delta",

  // ── Refactor ──
  "refactor_analysis",
  "refactor_analysis_gate",
  "refactor_plan",
  "refactor_plan_gate",

  // ── Ops Task ──
  "ops_plan",
  "ops_plan_gate",
  "execution",

  // ── Investigation ──
  "investigation_plan",
  "investigation_plan_gate",
  "research",
  "findings_report",
  "findings_report_gate",
] as const

export type WorkflowState = (typeof ALL_STATES)[number]

// ============================================================
// Transition Tables
// ============================================================

/**
 * Feature Spec（Requirements-First）合法状态流转表
 */
export const VALID_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
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
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Bugfix Spec 工作流合法状态流转表
 */
export const BUGFIX_SPEC_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["intake", ["bugfix_analysis"]],
  ["bugfix_analysis", ["bugfix_gate"]],
  ["bugfix_gate", ["fix_design", "bugfix_analysis", "blocked"]],
  ["fix_design", ["design_gate"]],
  ["design_gate", ["tasks", "fix_design", "blocked"]],
  ["tasks", ["tasks_gate"]],
  ["tasks_gate", ["development", "tasks", "blocked"]],
  ["development", ["verification"]],
  ["verification", ["verification_gate"]],
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Feature Spec Design-First 工作流合法状态流转表
 */
export const DESIGN_FIRST_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
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
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Quick Change 工作流合法状态流转表
 */
export const QUICK_CHANGE_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["intake", ["development"]],
  ["development", ["verification"]],
  ["verification", ["verification_gate"]],
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Change Request 工作流合法状态流转表
 */
export const CHANGE_REQUEST_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
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
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Refactor 工作流合法状态流转表
 */
export const REFACTOR_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["intake", ["refactor_analysis"]],
  ["refactor_analysis", ["refactor_analysis_gate"]],
  ["refactor_analysis_gate", ["refactor_plan", "refactor_analysis", "blocked"]],
  ["refactor_plan", ["refactor_plan_gate"]],
  ["refactor_plan_gate", ["development", "refactor_plan", "blocked"]],
  ["development", ["review", "verification"]],
  ["review", ["verification"]],
  ["verification", ["verification_gate"]],
  ["verification_gate", ["closed", "development", "blocked"]],
])

/**
 * Ops Task 工作流合法状态流转表
 */
export const OPS_TASK_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["intake", ["ops_plan"]],
  ["ops_plan", ["ops_plan_gate"]],
  ["ops_plan_gate", ["tasks", "ops_plan", "blocked"]],
  ["tasks", ["tasks_gate"]],
  ["tasks_gate", ["execution", "tasks", "blocked"]],
  ["execution", ["verification"]],
  ["verification", ["verification_gate"]],
  ["verification_gate", ["closed", "execution", "blocked"]],
])

/**
 * Investigation 工作流合法状态流转表
 */
export const INVESTIGATION_TRANSITIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["intake", ["investigation_plan"]],
  ["investigation_plan", ["investigation_plan_gate"]],
  ["investigation_plan_gate", ["research", "investigation_plan", "blocked"]],
  ["research", ["findings_report"]],
  ["findings_report", ["findings_report_gate"]],
  ["findings_report_gate", ["closed", "research", "findings_report", "blocked"]],
])

// ============================================================
// Transition Table Lookup
// ============================================================

/**
 * 根据工作流类型获取对应的状态流转表
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

// ============================================================
// Completeness Verification
// ============================================================

/**
 * 收集所有 8 种工作流转换表中引用的全部状态名
 */
export function getAllReferencedStates(): Set<string> {
  const tables = [
    VALID_TRANSITIONS,
    BUGFIX_SPEC_TRANSITIONS,
    DESIGN_FIRST_TRANSITIONS,
    QUICK_CHANGE_TRANSITIONS,
    CHANGE_REQUEST_TRANSITIONS,
    REFACTOR_TRANSITIONS,
    OPS_TASK_TRANSITIONS,
    INVESTIGATION_TRANSITIONS,
  ]

  const states = new Set<string>()
  for (const table of tables) {
    for (const [from, targets] of table) {
      states.add(from)
      for (const t of targets) states.add(t)
    }
  }
  return states
}
