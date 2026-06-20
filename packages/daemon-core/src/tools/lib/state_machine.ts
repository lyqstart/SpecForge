/**
 * SpecForge Final Governance Alignment 状态机定义
 *
 * 本文件是运行主链路状态的唯一导出点。
 * 旧状态（intake / requirements_gate / development / review / bugfix_gate / fix_design 等）
 * 不再作为运行主链路状态出现；历史产物只允许通过 legacy reader 做只读迁移。
 */

// ============================================================
// Workflow Types / Paths
// ============================================================

/**
 * workflow_type 是具体工作流身份。
 * 保留若干历史 type 仅用于调用方类型兼容；运行治理路径由 workflow_path 决定。
 */
export type WorkflowType =
  | "feature_spec"
  | "bugfix_spec"
  | "quick_change"
  | "change_request"
  | "feature_spec_design_first"
  | "refactor"
  | "ops_task"
  | "investigation"

/** workflow_path 是治理路径，不得反向覆盖已兼容的 workflow_type。 */
export type WorkflowPath =
  | "requirement_change_path"
  | "design_change_path"
  | "architecture_change_path"
  | "task_change_path"
  | "code_only_fast_path"
  | "spec_migration_path"
  | "rollback_path"

/** workflow_type 到 workflow_path 的兼容矩阵。 */
export const WORKFLOW_TYPE_TO_PATH: Readonly<Record<WorkflowType, WorkflowPath>> = {
  feature_spec: "requirement_change_path",
  bugfix_spec: "requirement_change_path",
  change_request: "requirement_change_path",
  investigation: "requirement_change_path",
  feature_spec_design_first: "design_change_path",
  refactor: "task_change_path",
  ops_task: "task_change_path",
  quick_change: "code_only_fast_path",
}

/**
 * 仅当调用方未提供 workflow_type 时才允许使用默认 workflow_type。
 * 禁止把 bugfix_spec + requirement_change_path 静默改成 feature_spec。
 */
export const WORKFLOW_PATH_DEFAULT_TYPE: Readonly<Partial<Record<WorkflowPath, WorkflowType>>> = {
  requirement_change_path: "feature_spec",
  design_change_path: "feature_spec_design_first",
  task_change_path: "refactor",
  code_only_fast_path: "quick_change",
}

/**
 * 兼容旧导出名，但语义已经收紧：只能作为“缺省值”，不能作为覆盖规则。
 */
export const WORKFLOW_PATH_TO_TYPE = WORKFLOW_PATH_DEFAULT_TYPE

export function isWorkflowTypeCompatibleWithPath(
  workflowType: string | undefined,
  workflowPath: string | undefined,
): workflowType is WorkflowType {
  if (!workflowType || !workflowPath) return false
  if (!(workflowType in WORKFLOW_TYPE_TO_PATH)) return false
  return WORKFLOW_TYPE_TO_PATH[workflowType as WorkflowType] === workflowPath
}

/**
 * 解析 workflow_type：
 * 1. requestedWorkflowType 优先；
 * 2. existingWorkflowType 次之；
 * 3. 两者与 workflow_path 兼容时必须原样保留；
 * 4. 两者与 workflow_path 不兼容时返回 undefined，由调用方 fail-closed；
 * 5. 未提供 workflow_type 时才使用 path 默认值。
 */
export function resolveWorkflowTypeForPath(
  workflowPath: WorkflowPath | undefined,
  requestedWorkflowType?: string,
  existingWorkflowType?: string,
): WorkflowType | undefined {
  const candidate = requestedWorkflowType ?? existingWorkflowType
  if (candidate) {
    if (!workflowPath && candidate in WORKFLOW_TYPE_TO_PATH) return candidate as WorkflowType
    if (isWorkflowTypeCompatibleWithPath(candidate, workflowPath)) return candidate
    return undefined
  }
  if (!workflowPath) return undefined
  return WORKFLOW_PATH_DEFAULT_TYPE[workflowPath]
}

// ============================================================
// Final Governance States
// ============================================================

export const FINAL_STATES = [
  "created",
  "intake_ready",
  "impact_analyzing",
  "impact_analyzed",
  "workflow_selected",
  "candidate_preparing",
  "candidate_prepared",
  "gates_running",
  "gates_failed",
  "approval_required",
  "approved",
  "merge_ready",
  "merging",
  "merged",
  "post_merge_verified",
  "implementation_ready",
  "implementation_running",
  "implementation_done",
  "verification_running",
  "verification_done",
  "closed",
  "blocked",
  "rejected",
  "superseded",
] as const

/** 所有运行状态的单一权威来源。 */
export const ALL_STATES = FINAL_STATES
export type WorkflowState = (typeof FINAL_STATES)[number]

export const FINAL_TRANSITIONS: ReadonlyMap<WorkflowState, readonly WorkflowState[]> = new Map([
  ["created", ["intake_ready", "blocked", "rejected", "superseded"]],
  ["intake_ready", ["impact_analyzing", "blocked", "rejected", "superseded"]],
  ["impact_analyzing", ["impact_analyzed", "blocked", "rejected", "superseded"]],
  ["impact_analyzed", ["workflow_selected", "blocked", "rejected", "superseded"]],
  ["workflow_selected", ["candidate_preparing", "implementation_ready", "blocked", "rejected", "superseded"]],
  ["candidate_preparing", ["candidate_prepared", "blocked", "rejected", "superseded"]],
  ["candidate_prepared", ["gates_running", "blocked", "rejected", "superseded"]],
  ["gates_running", ["approval_required", "gates_failed", "blocked", "rejected", "superseded"]],
  ["gates_failed", ["candidate_preparing", "blocked", "rejected", "superseded"]],
  ["approval_required", ["approved", "rejected", "blocked", "superseded"]],
  ["approved", ["merge_ready", "implementation_ready", "blocked", "rejected", "superseded"]],
  ["merge_ready", ["merging", "blocked", "rejected", "superseded"]],
  ["merging", ["merged", "blocked", "rejected", "superseded"]],
  ["merged", ["post_merge_verified", "blocked", "rejected", "superseded"]],
  ["post_merge_verified", ["implementation_ready", "blocked", "rejected", "superseded"]],
  ["implementation_ready", ["implementation_running", "blocked", "rejected", "superseded"]],
  ["implementation_running", ["implementation_done", "blocked", "rejected", "superseded"]],
  ["implementation_done", ["verification_running", "blocked", "rejected", "superseded"]],
  ["verification_running", ["verification_done", "blocked", "rejected", "superseded"]],
  ["verification_done", ["closed", "implementation_ready", "blocked", "rejected", "superseded"]],
  ["closed", []],
  ["blocked", ["intake_ready", "candidate_preparing", "implementation_ready", "rejected", "superseded"]],
  ["rejected", []],
  ["superseded", []],
])

// 兼容旧导出名。所有 workflow_type 共享最终治理状态机。
export const VALID_TRANSITIONS = FINAL_TRANSITIONS
export const BUGFIX_SPEC_TRANSITIONS = FINAL_TRANSITIONS
export const DESIGN_FIRST_TRANSITIONS = FINAL_TRANSITIONS
export const QUICK_CHANGE_TRANSITIONS = FINAL_TRANSITIONS
export const CHANGE_REQUEST_TRANSITIONS = FINAL_TRANSITIONS
export const REFACTOR_TRANSITIONS = FINAL_TRANSITIONS
export const OPS_TASK_TRANSITIONS = FINAL_TRANSITIONS
export const INVESTIGATION_TRANSITIONS = FINAL_TRANSITIONS

export function getTransitionTable(_workflowType: WorkflowType): ReadonlyMap<WorkflowState, readonly WorkflowState[]> {
  return FINAL_TRANSITIONS
}

export function isFinalWorkflowState(state: string): state is WorkflowState {
  return (FINAL_STATES as readonly string[]).includes(state)
}

export function assertFinalWorkflowState(state: string): asserts state is WorkflowState {
  if (!isFinalWorkflowState(state)) {
    throw new Error(`LEGACY_OR_UNKNOWN_STATE_NOT_ALLOWED: ${state}`)
  }
}

export function isValidTransition(
  from: string,
  to: string,
  workflowType: WorkflowType = "feature_spec",
): boolean {
  if (!isFinalWorkflowState(from) || !isFinalWorkflowState(to)) return false
  const table = getTransitionTable(workflowType)
  const validTargets = table.get(from)
  return !!validTargets && validTargets.includes(to)
}

export function getAllReferencedStates(): Set<string> {
  const states = new Set<string>()
  for (const [from, targets] of FINAL_TRANSITIONS) {
    states.add(from)
    for (const target of targets) states.add(target)
  }
  return states
}
