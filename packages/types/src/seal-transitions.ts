/**
 * seal-transitions.ts — Seal Transition 定义
 *
 * Phase 1 RBAC 基座：定义 seal transition 列表和查询函数。
 *
 * 设计决策（P4 §11 Q1）：
 * - sf-orchestrator 不允许执行 seal transitions
 * - seal transitions 必须由独立守卫主体执行
 * - seal transitions 必须基于 evidence 验证后执行
 *
 * Seal transition 定义：需要独立守卫主体 + evidence 验证的状态跳转。
 * Orchestrator 只能 request/coordinate，不能 perform seal transitions。
 */

// ---------------------------------------------------------------------------
// SealTransitionEntry
// ---------------------------------------------------------------------------

/**
 * 单个 seal transition 定义。
 */
export interface SealTransitionEntry {
  /** 起始状态 */
  from: string;
  /** 目标状态 */
  to: string;
  /** 唯一授权执行主体（ActorRole 值） */
  authorizedSubject: string;
  /** 执行前必须存在的 evidence 文件 */
  evidenceRequired: string;
}

// ---------------------------------------------------------------------------
// SEAL_TRANSITIONS — 7 个 seal transitions
// ---------------------------------------------------------------------------

/**
 * Seal transitions 常量列表。
 *
 * 精确 7 个条目，每个条目指定：
 * - 起始/目标状态
 * - 唯一授权执行主体（orchestrator 不在列）
 * - 必须存在的 evidence 文件
 */
export const SEAL_TRANSITIONS: readonly SealTransitionEntry[] = [
  {
    from: 'gates_running',
    to: 'approval_required',
    authorizedSubject: 'gate_runner',
    evidenceRequired: 'gate_summary.md',
  },
  {
    from: 'gates_running',
    to: 'gates_failed',
    authorizedSubject: 'gate_runner',
    evidenceRequired: 'gate_summary.md',
  },
  {
    from: 'approval_required',
    to: 'approved',
    authorizedSubject: 'user_decision_recorder',
    evidenceRequired: 'user_decision.json',
  },
  {
    from: 'approval_required',
    to: 'rejected',
    authorizedSubject: 'user_decision_recorder',
    evidenceRequired: 'user_decision.json',
  },
  {
    from: 'merge_ready',
    to: 'merging',
    authorizedSubject: 'merge_runner',
    evidenceRequired: 'gate_summary.md',
  },
  {
    from: 'merging',
    to: 'merged',
    authorizedSubject: 'merge_runner',
    evidenceRequired: 'merge_report.md',
  },
  {
    from: 'verification_done',
    to: 'closed',
    authorizedSubject: 'close_gate',
    evidenceRequired: 'verification_report.md',
  },
] as const;

// ---------------------------------------------------------------------------
// isSealTransition
// ---------------------------------------------------------------------------

/**
 * 判断给定状态跳转是否为 seal transition。
 *
 * @param from 起始状态
 * @param to 目标状态
 * @returns 是否为 seal transition
 */
export function isSealTransition(from: string, to: string): boolean {
  return SEAL_TRANSITIONS.some((entry) => entry.from === from && entry.to === to);
}

// ---------------------------------------------------------------------------
// getSealTransition
// ---------------------------------------------------------------------------

/**
 * 获取给定状态跳转的 seal transition 定义。
 *
 * @param from 起始状态
 * @param to 目标状态
 * @returns SealTransitionEntry 或 undefined
 */
export function getSealTransition(from: string, to: string): SealTransitionEntry | undefined {
  return SEAL_TRANSITIONS.find((entry) => entry.from === from && entry.to === to);
}

// ---------------------------------------------------------------------------
// REQUESTABLE_TRANSITIONS — orchestrator 可直接执行的跳转
// ---------------------------------------------------------------------------

/**
 * Orchestrator 可直接执行（request + perform）的非 seal 跳转列表。
 *
 * 来源：设计文档 §6.1 Permission Matrix 中 authorizedSubjects 包含
 * sf-orchestrator 的跳转，排除所有 seal transitions。
 *
 * 限制：
 * - 此列表基于 v1.1 标准状态图推导
 * - 未包含所有 workflow type 的分支路径（如 blocked 的回退目标）
 * - Phase 2 在 TransitionAuthorizer 中做完整实现时，此列表可被替换
 */
export const REQUESTABLE_TRANSITIONS: readonly { from: string; to: string }[] = [
  // intake path
  { from: 'created', to: 'intake_ready' },
  { from: 'intake_ready', to: 'impact_analyzing' },
  { from: 'impact_analyzing', to: 'impact_analyzed' },
  { from: 'impact_analyzed', to: 'workflow_selected' },

  // candidate path (non-seal)
  { from: 'workflow_selected', to: 'candidate_preparing' },
  { from: 'workflow_selected', to: 'implementation_ready' },
  { from: 'candidate_preparing', to: 'candidate_prepared' },
  { from: 'candidate_prepared', to: 'gates_running' },
  { from: 'gates_failed', to: 'candidate_preparing' },
  { from: 'gates_failed', to: 'gates_running' },

  // post-approval path (non-seal)
  { from: 'approved', to: 'merge_ready' },

  // post-merge path
  { from: 'merged', to: 'post_merge_verified' },
  { from: 'post_merge_verified', to: 'implementation_ready' },

  // implementation path
  { from: 'implementation_ready', to: 'implementation_running' },
  { from: 'implementation_done', to: 'verification_running' },

  // blocked rollback
  { from: 'blocked', to: 'candidate_preparing' },
  { from: 'blocked', to: 'gates_running' },
  { from: 'blocked', to: 'implementation_ready' },
  { from: 'blocked', to: 'workflow_selected' },
] as const;
