/**
 * meta-schema.ts — SpecForge v1.1 权威 schema 定义
 *
 * 依据：SpecForge 最终融合标准 v1.1（specforge_final_fused_standard_v1_1_patch1_zh.md）
 *
 * 本模块定义：
 * - v1.1 状态机阶段枚举（§5）
 * - v1.1 workflow_path 枚举（§6.4）
 * - Work Item _meta.json 的权威 zod schema
 * - ID 校验 zod schemas
 *
 * zod schemas 提供运行期校验 + 编译期类型双重防线。
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// v1.1 状态机 — 主状态枚举（§5.1）
// ---------------------------------------------------------------------------

/**
 * SpecForge v1.1 WI 主状态枚举。
 * 这些状态覆盖了标准 §5.1 定义的完整 WI 生命周期。
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

/**
 * v1.1 WI 状态联合类型。
 */
export type WIStatus = (typeof WI_STATUSES)[number];

// ---------------------------------------------------------------------------
// v1.1 workflow_path 枚举（§6.4）
// ---------------------------------------------------------------------------

/**
 * SpecForge v1.1 workflow_path 枚举。
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

/**
 * v1.1 workflow_path 联合类型。
 */
export type WorkflowPath = (typeof WORKFLOW_PATHS)[number];

// ---------------------------------------------------------------------------
// 匹配结果类型（§6.3）
// ---------------------------------------------------------------------------

/**
 * §6.3 匹配结果类型。
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
// §3 ID 校验 zod schemas
// ---------------------------------------------------------------------------

/**
 * MODULE_CODE schema（§3.1）。
 */
export const ModuleCodeSchema = z.string().regex(
  /^[A-Z][A-Z0-9]{1,11}$/,
  'MODULE_CODE must be 2-12 chars, start with uppercase letter, only uppercase+digits',
);

/**
 * WI ID schema（§3.2）。
 */
export const WorkItemIdSchema = z.string().regex(
  /^WI-[0-9]{4}$/,
  'Work Item ID must match WI-NNNN',
);

/**
 * REQ ID schema（§3.2）。
 */
export const RequirementIdSchema = z.string().regex(
  /^REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/,
  'Requirement ID must match REQ-MODULECODE-NNN',
);

/**
 * AC ID schema（§3.2）。
 */
export const AcceptanceCriteriaIdSchema = z.string().regex(
  /^AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}$/,
  'AC ID must match AC-MODULECODE-NNN-NN',
);

/**
 * DD ID schema（§3.2）。
 */
export const DesignDecisionIdSchema = z.string().regex(
  /^DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/,
  'DD ID must match DD-MODULECODE-NNN',
);

/**
 * TASK ID schema（§3.2）。
 */
export const TaskIdSchema = z.string().regex(
  /^TASK-WI-[0-9]{4}-[0-9]{3}$/,
  'Task ID must match TASK-WI-NNNN-NNN',
);

// ---------------------------------------------------------------------------
// §5.2 禁止跳转
// ---------------------------------------------------------------------------

/**
 * §5.2 禁止的状态跳转列表。
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
// WORKFLOW_TYPES — 8 类工作流的合法名称（向后兼容）
// ---------------------------------------------------------------------------

/**
 * SpecForge V6 已部署的全部工作流类型枚举。
 * 保留向后兼容的旧工作流类型。
 */
export const WORKFLOW_TYPES = [
  'feature_spec',
  'bugfix_spec',
  'refactor',
  'investigation',
  'change_request',
  'ops_task',
  'quick_change',
  'feature_spec_design_first',
  'research_investigation',
  'root_cause_investigation',
] as const;

export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

// ---------------------------------------------------------------------------
// STAGE_TYPES — 状态机所有阶段名称（向后兼容）
// ---------------------------------------------------------------------------

/**
 * 旧状态机阶段名称（向后兼容）。
 */
export const STAGE_TYPES = [
  'intake',
  'requirements',
  'design',
  'tasks',
  'development',
  'review',
  'verification',
  'completed',
  'blocked',
  'refactor_analysis',
  'refactor_plan',
  'refactor_analysis_gate',
  'refactor_plan_gate',
  'verification_gate',
] as const;

export type StageType = (typeof STAGE_TYPES)[number];

// ---------------------------------------------------------------------------
// WorkItemMetaSchema — _meta.json 的运行期 zod schema（向后兼容）
// ---------------------------------------------------------------------------

/**
 * Work Item `_meta.json` 文件的权威 zod schema。
 */
export const WorkItemMetaSchema = z.object({
  id: z.string().regex(/^WI-\d+$/, 'Work Item ID must match pattern WI-<digits>'),
  workflow_type: z.enum(WORKFLOW_TYPES),
  title: z.string().min(1, 'title must be non-empty'),
  summary: z.string().max(500, 'summary must be ≤ 500 chars'),
  key_decisions: z.array(z.string()),
  current_stage: z.enum(STAGE_TYPES),
  created_at: z.string().datetime({ message: 'created_at must be ISO 8601 datetime' }),
  completed_at: z
    .string()
    .datetime({ message: 'completed_at must be ISO 8601 datetime' })
    .optional(),
  related_modules: z.array(z.string()).optional(),
  upstream_wis: z.array(z.string()).optional(),
  downstream_wis: z.array(z.string()).optional(),
});

/**
 * `_meta.json` 文件的 TypeScript 类型。
 */
export type WorkItemMeta = z.infer<typeof WorkItemMetaSchema>;
