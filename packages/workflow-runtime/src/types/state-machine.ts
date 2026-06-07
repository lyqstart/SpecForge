/**
 * State Machine Interface — v1.1 标准
 *
 * 依据：SpecForge 最终融合标准 v1.1（§5 状态机）
 *
 * 定义：
 * - §5.1 主状态枚举
 * - §5.2 禁止跳转规则
 * - §5.3 状态推进主体
 * - §5.4 恢复机制
 */

import type { GateDefinition } from './gate-definition';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// ---------------------------------------------------------------------------
// §5.1 主状态枚举
// ---------------------------------------------------------------------------

/**
 * v1.1 标准 WI 主状态枚举。
 */
export const WI_STATUSES_V11 = [
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

export type WIStatusV11 = (typeof WI_STATUSES_V11)[number];

// ---------------------------------------------------------------------------
// §5.2 禁止跳转
// ---------------------------------------------------------------------------

/**
 * §5.2 禁止的状态跳转列表。
 * 任何实现必须在状态推进前校验跳转不在本列表中。
 */
export const FORBIDDEN_TRANSITIONS: ReadonlyArray<readonly [WIStatusV11, string]> = [
  ['created', 'implementation_running'],
  ['intake_ready', 'implementation_running'],
  ['impact_analyzing', 'implementation_running'],
  ['impact_analyzed', 'implementation_running'],
  ['workflow_selected', 'implementation_running'],
  ['candidate_prepared', 'merging'],
  ['approval_required', 'merging'],
  ['approval_required', 'closed'],
  ['merged', 'closed'],
  ['blocked', 'closed'],
  ['rejected', 'closed'],
] as const;

/**
 * 校验状态跳转是否被禁止。
 * 注意：closed → any 也是禁止的，需要特殊处理。
 */
export function isForbiddenTransitionV11(from: WIStatusV11, to: string): boolean {
  // closed → any 禁止
  if (from === 'closed') return true;
  return FORBIDDEN_TRANSITIONS.some(
    ([f, t]) => f === from && t === to,
  );
}

// ---------------------------------------------------------------------------
// §5.3 状态推进主体
// ---------------------------------------------------------------------------

/**
 * 允许推进 WI 状态的主体枚举。
 */
export const STATE_ADVANCEMENT_SUBJECTS = [
  ACTOR_ROLES.orchestrator,
  'Runtime State Machine',
  ACTOR_ROLES.gateRunner,
  ACTOR_ROLES.userDecisionRecorder,
  ACTOR_ROLES.mergeRunner,
  ACTOR_ROLES.codePermissionService,
  ACTOR_ROLES.closeGate,
] as const;

export type StateAdvancementSubject = (typeof STATE_ADVANCEMENT_SUBJECTS)[number];

// ---------------------------------------------------------------------------
// State Machine 接口
// ---------------------------------------------------------------------------

/**
 * State transition definition
 */
export interface StateTransition {
  from: string;
  event: string;
  to: string;
  condition?: string;
}

/**
 * Workflow state event handler
 */
export interface StateEvent {
  name: string;
  handler: string;
  payload?: Record<string, unknown>;
}

/**
 * Workflow state definition
 */
export interface WorkflowState {
  schema_version: "1.0";
  /** 允许推进此状态的主体 */
  advancementSubject?: StateAdvancementSubject;
  agent: string;
  gate: GateDefinition;
  skills: string[];
  next?: string | Record<string, string>;
  events?: StateEvent[];
}

/**
 * State machine definition
 * Contains all necessary components for workflow state management
 */
export interface StateMachine {
  schema_version: "1.0";
  /** Initial state identifier */
  initial: string;
  /** Collection of states, keyed by state ID */
  states: Record<string, WorkflowState>;
  /** Transition rules defining valid state changes */
  transitions?: StateTransition[];
  /** Event handlers for state machine events */
  events?: StateEvent[];
}

// ---------------------------------------------------------------------------
// §5.4 恢复机制
// ---------------------------------------------------------------------------

/**
 * 恢复检查项（§5.4）。
 */
export interface ResumeCheck {
  /** 当前 WI 状态 */
  currentStatus: WIStatusV11;
  /** 必需文件是否存在 */
  requiredFilesExist: boolean;
  /** 文件 hash 是否匹配 */
  fileHashesMatch: boolean;
  /** Candidate / Gate / User Decision 是否失效 */
  artifactsValid: boolean;
  /** code_permission 是否仍有效 */
  codePermissionValid: boolean;
  /** 是否存在越界写入 */
  noOutOfBoundsWrites: boolean;
  /** 是否需要回退到更早状态 */
  needsRollback: boolean;
  /** 建议回退到的状态（如果 needsRollback=true） */
  rollbackTarget?: WIStatusV11;
}

/**
 * 恢复计划（§5.4）。
 */
export interface ResumePlan {
  /** 恢复检查结果 */
  check: ResumeCheck;
  /** 是否可以恢复 */
  canResume: boolean;
  /** 恢复动作 */
  actions: Array<{
    type: 'rollback' | 'regenerate' | 'revalidate' | 'continue';
    targetState?: WIStatusV11;
    description: string;
  }>;
}
