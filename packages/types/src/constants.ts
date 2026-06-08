/**
 * constants.ts — SpecForge v1.1 常量、枚举与工具函数
 *
 * 本模块从 work-item-types.ts 中提取出所有常量定义、状态枚举和工具函数，
 * 提供集中化的常量管理。
 *
 * 包含：
 * - 版本常量（SCHEMA_VERSION）
 * - §5：WI 状态枚举（WI_STATUSES）、禁止跳转（FORBIDDEN_TRANSITIONS）
 * - §6：workflow_path 枚举（WORKFLOW_PATHS）、匹配结果类型（MATCH_RESULT_TYPES）
 * - §9：Gate 枚举（GATE_IDS, GATE_TYPES, GATE_SUMMARY_STATUSES）
 * - §10：User Decision 状态枚举（USER_DECISION_STATUSES）
 */

// ---------------------------------------------------------------------------
// 版本常量
// ---------------------------------------------------------------------------

/**
 * SpecForge v1.1 标准 schema 版本号。
 * 所有 v1.1 JSON 文件的 schema_version 字段使用此值。
 */
export const SCHEMA_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// §5 状态机 — 主状态枚举
// ---------------------------------------------------------------------------

/**
 * WI 主状态枚举（§5.1）。
 */
export const WI_STATUSES = [
  'created',
  'intake_ready',
  'impact_analyzing',
  'impact_analyzed',
  'workflow_selected',
  'candidate_preparing',
  'candidate_prepared',
  'gates_running',
  'gates_failed',
  'approval_required',
  'approved',
  'merge_ready',
  'merging',
  'merged',
  'post_merge_verified',
  'implementation_ready',
  'implementation_running',
  'implementation_done',
  'verification_running',
  'verification_done',
  'closed',
  'blocked',
  'rejected',
  'superseded',
] as const;

export type WIStatus = (typeof WI_STATUSES)[number];

/**
 * §5.2 禁止跳转列表。
 * 任何实现必须在状态推进前校验跳转不在本列表中。
 */
export const FORBIDDEN_TRANSITIONS: ReadonlyArray<readonly [string, string]> = [
  ['created', 'implementation_running'],
  ['intake_ready', 'implementation_running'],
  ['impact_analyzing', 'implementation_running'],
  ['impact_analyzed', 'implementation_running'],
  ['workflow_selected', 'implementation_running'],
  ['candidate_prepared', 'merging'],
  ['approval_required', 'merging'],
  ['approval_required', 'closed'],
  ['merged', 'closed'],
  ['closed', 'any'],
  ['blocked', 'closed'],
  ['rejected', 'closed'],
] as const;

/**
 * 校验状态跳转是否被禁止。
 */
export function isForbiddenTransition(from: string, to: string): boolean {
  return FORBIDDEN_TRANSITIONS.some(
    ([f, t]) => (f === from || f === 'any') && (t === to || t === 'any'),
  );
}

// ---------------------------------------------------------------------------
// §6 workflow_path 枚举
// ---------------------------------------------------------------------------

/**
 * workflow_path 枚举（§6.4）。
 */
export const WORKFLOW_PATHS = [
  'requirement_change_path',
  'design_change_path',
  'architecture_change_path',
  'task_change_path',
  'code_only_fast_path',
  'spec_migration_path',
  'rollback_path',
] as const;

export type WorkflowPath = (typeof WORKFLOW_PATHS)[number];

/**
 * 匹配结果类型（§6.3）。
 */
export const MATCH_RESULT_TYPES = [
  'exact_match',
  'partial_match',
  'related_match',
  'conflict_match',
  'no_match',
  'spec_gap_match',
] as const;

export type MatchResultType = (typeof MATCH_RESULT_TYPES)[number];

// ---------------------------------------------------------------------------
// §9 Gate
// ---------------------------------------------------------------------------

/**
 * Gate 类型枚举（§9.2）。
 */
export const GATE_IDS = [
  'entry_gate',
  'workflow_selection_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'schema_gate',
  'spec_consistency_gate',
  'trace_gate',
  'workflow_specific_gate',
  'gate_summary_gate',
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
  'extension_gate',
] as const;

export type GateId = (typeof GATE_IDS)[number];

/**
 * Gate 类型（hard_gate / soft_gate）（§9.3）。
 */
export const GATE_TYPES = ['hard_gate', 'soft_gate'] as const;
export type GateType = (typeof GATE_TYPES)[number];

/**
 * Gate Summary overall_status 枚举（§9.5）。
 */
export const GATE_SUMMARY_STATUSES = [
  'passed',
  'passed_with_waiver_required',
  'failed',
  'blocked',
  'expired',
  'invalidated',
] as const;

export type GateSummaryStatus = (typeof GATE_SUMMARY_STATUSES)[number];

// ---------------------------------------------------------------------------
// §10 User Decision
// ---------------------------------------------------------------------------

/**
 * User Decision 状态枚举（§10.3）。
 */
export const USER_DECISION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'request_changes',
  'waived',
  'expired',
  'invalidated',
] as const;

export type UserDecisionStatus = (typeof USER_DECISION_STATUSES)[number];

// ---------------------------------------------------------------------------
// §5 Evidence-guarded Critical States
// ---------------------------------------------------------------------------

/**
 * v1.1 States that REQUIRE evidence prerequisites before transition.
 *
 * These states control high-consequence actions (approval gates, merge
 * operations, code permission release, verification sign-off, closure).
 * Any production code transitioning INTO one of these states MUST go through
 * `WorkflowEngine.transitionFull()` which enforces evidence checks.
 *
 * Direct `StateManager.transition()` calls targeting these states will emit
 * a development-mode warning.
 *
 * Single source of truth — workflow-runtime, daemon-core, and all other
 * packages MUST import from here to avoid drift.
 */
export const CRITICAL_STATES: ReadonlySet<string> = new Set([
  'approval_required',
  'merge_ready',
  'merging',
  'post_merge_verified',
  'implementation_ready',
  'verification_done',
  'closed',
] as const);

/**
 * Check whether a target state requires transition evidence enforcement.
 */
export function isCriticalState(targetState: string): boolean {
  return CRITICAL_STATES.has(targetState);
}

// ---------------------------------------------------------------------------
// §5 Deletable States (P3 destructive operation guard)
// ---------------------------------------------------------------------------

/**
 * v1.1 States where `deleteInstance()` is ALLOWED without force override.
 *
 * Only terminal or initial states are safe to delete:
 * - Initial states have no significant state or evidence.
 * - Terminal states have completed their lifecycle; history is final.
 * - Failed/stuck states may be cleaned up.
 *
 * All other states (intermediate, running, critical) are non-deletable —
 * `deleteInstance()` must throw unless `force: true` is passed.
 */
export const DELETABLE_STATES: ReadonlySet<string> = new Set([
  'created',
  'intake_ready',
  'closed',
  'rejected',
  'superseded',
  'blocked',
  'gates_failed',
] as const);

/**
 * Check whether an instance in the given state may be deleted.
 */
export function isDeletableState(state: string): boolean {
  return DELETABLE_STATES.has(state);
}
