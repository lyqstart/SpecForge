/**
 * work-item-types.ts — SpecForge v1.1 Work Item 核心类型定义
 *
 * 涵盖：
 * - §4：Work Item 事务模型
 * - §5：状态机
 * - §6：分类与路径选择
 * - §8：Candidate、Delta 与 Manifest
 * - §9：Gate Report 与 Gate Summary
 * - §10：User Decision
 * - §12：code_permission 与 allowed_write_files
 * - §13：Trace、Verification 与 Evidence
 */

import { z } from 'zod';

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
// §4 work_item.json 最小结构
// ---------------------------------------------------------------------------

/**
 * work_item.json zod schema（§4.4）。
 */
export const WorkItemJsonSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string().regex(/^WI-[0-9]{4}$/, 'Work Item ID must match WI-NNNN'),
  status: z.enum(WI_STATUSES),
  workflow_path: z.enum(WORKFLOW_PATHS).nullable(),
  code_change_allowed: z.boolean(),
  allowed_write_files: z.array(z.object({
    path: z.string(),
    operation: z.enum(['create', 'modify', 'delete']),
  })),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.literal('sf-orchestrator'),
  // 可选扩展字段
  required_files: z.array(z.string()).optional(),
  required_gates: z.array(z.string()).optional(),
  classification: z.string().optional(),
  impact_analysis: z.string().optional(),
  trigger_result: z.string().optional(),
  manifest_hash: z.string().optional(),
  candidate_hash: z.string().optional(),
  gate_summary_hash: z.string().optional(),
  base_spec_version: z.string().optional(),
  merge_status: z.enum(['pending', 'not_applicable', 'merged', 'failed']).optional(),
  verification_status: z.enum(['pending', 'passed', 'failed', 'not_applicable']).optional(),
  close_status: z.enum(['pending', 'passed', 'failed']).optional(),
  blocked_reason: z.string().optional(),
  superseded_by: z.string().optional(),
});

export type WorkItemJson = z.infer<typeof WorkItemJsonSchema>;

// ---------------------------------------------------------------------------
// §8 Candidate Manifest
// ---------------------------------------------------------------------------

/**
 * 单个 Candidate Manifest Entry。
 */
export const CandidateManifestEntrySchema = z.object({
  candidate_path: z.string(),
  target_path: z.string(),
  operation: z.enum(['replace', 'create', 'delete']),
  candidate_hash: z.string(),
  target_base_hash: z.string().optional(),
  spec_type: z.string().optional(),
  module: z.string().nullable().optional(),
});

export type CandidateManifestEntry = z.infer<typeof CandidateManifestEntrySchema>;

/**
 * candidate_manifest.json schema（§8.3）。
 */
export const CandidateManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  workflow_path: z.enum(WORKFLOW_PATHS),
  base_spec_version: z.string(),
  merge_required: z.boolean(),
  entries: z.array(CandidateManifestEntrySchema),
  manifest_hash: z.string().optional(),
});

export type CandidateManifest = z.infer<typeof CandidateManifestSchema>;

// ---------------------------------------------------------------------------
// §9 Gate Report
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
 * Gate Report schema（§9.4）。
 * 路径：.specforge/work-items/<WI-ID>/gates/<gate_id>.json
 */
export const GateReportSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  gate_id: z.enum(GATE_IDS),
  gate_type: z.enum(GATE_TYPES),
  required: z.boolean(),
  status: z.enum(['passed', 'failed', 'skipped', 'waived']),
  input_files: z.array(z.string()),
  checks: z.array(z.object({
    check_id: z.string(),
    description: z.string(),
    passed: z.boolean(),
    severity: z.enum(['error', 'warning', 'info']).optional(),
    details: z.string().optional(),
  })),
  blocking_issues: z.array(z.string()),
  warnings: z.array(z.string()),
  waiver_allowed: z.boolean(),
  waiver_required: z.boolean(),
  waiver_ids: z.array(z.string()),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  runner: z.string(),
});

export type GateReport = z.infer<typeof GateReportSchema>;

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

/**
 * User Decision schema（§10.2）。
 * 路径：.specforge/work-items/<WI-ID>/user_decision.json
 */
export const UserDecisionSchema = z.object({
  schema_version: z.literal('1.0'),
  decision_id: z.string(),
  work_item_id: z.string(),
  workflow_path: z.enum(WORKFLOW_PATHS),
  base_spec_version: z.string(),
  candidate_manifest_path: z.string(),
  manifest_hash: z.string(),
  candidate_hash: z.string(),
  gate_summary_path: z.string(),
  gate_summary_hash: z.string(),
  decision_status: z.enum(USER_DECISION_STATUSES),
  decision_type: z.enum(['auto_approved', 'user_approved', 'waived', 'rejected']),
  decided_by: z.string(),
  decided_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  decision_scope: z.string(),
  waivers: z.array(z.object({
    waiver_id: z.string(),
    gate_id: z.string(),
    reason: z.string(),
    risk: z.string(),
    expires_at: z.string().datetime().optional(),
    follow_up_wi: z.string().optional(),
  })),
});

export type UserDecision = z.infer<typeof UserDecisionSchema>;

// ---------------------------------------------------------------------------
// §2 spec_manifest.json
// ---------------------------------------------------------------------------

/**
 * spec_manifest.json 中的单个模块描述。
 */
export const SpecModuleEntrySchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/, 'Module code must be MODULE_CODE'),
  path: z.string(),
  module_file: z.string(),
  requirements: z.string(),
  design: z.string(),
  trace: z.string(),
});

export type SpecModuleEntry = z.infer<typeof SpecModuleEntrySchema>;

/**
 * spec_manifest.json schema（§2.3）。
 */
export const SpecManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  project_spec_version: z.string(),
  project_name: z.string(),
  project: z.object({
    extension_registry: z.string(),
    requirements_index: z.string(),
    design_index: z.string(),
    architecture: z.string(),
    glossary: z.string(),
    decisions: z.string(),
    trace_matrix: z.string(),
  }),
  modules: z.array(SpecModuleEntrySchema),
  last_merged_work_item: z.string().optional(),
  last_merged_at: z.string().datetime().optional(),
});

export type SpecManifest = z.infer<typeof SpecManifestSchema>;

// ---------------------------------------------------------------------------
// v1.1 Patch 1: extension_registry.json
// ---------------------------------------------------------------------------

/**
 * extension_registry.json schema。
 * 路径：.specforge/project/extension_registry.json
 */
export const ExtensionRegistrySchema = z.object({
  schema_version: z.literal('1.0'),
  project_spec_version: z.string(),
  namespaces: z.object({
    requirement_types: z.array(z.string()),
    design_types: z.array(z.string()),
    task_types: z.array(z.string()),
    verification_types: z.array(z.string()),
    gate_types: z.array(z.string()),
  }),
  updated_by_work_item: z.string().nullable(),
  updated_at: z.string().datetime().nullable(),
});

export type ExtensionRegistry = z.infer<typeof ExtensionRegistrySchema>;

/**
 * extension_request.json schema。
 * 路径：.specforge/work-items/<WI-ID>/extension_request.json
 */
export const ExtensionRequestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  requested_by_agent: z.string(),
  requested_namespace: z.string(),
  requested_key: z.string(),
  reason: z.string(),
  blocking_current_flow: z.boolean(),
  created_at: z.string().datetime(),
});

export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

// ---------------------------------------------------------------------------
// §13 Evidence
// ---------------------------------------------------------------------------

/**
 * Evidence Manifest entry。
 */
export const EvidenceManifestEntrySchema = z.object({
  evidence_id: z.string(),
  type: z.enum([
    'test_output',
    'build_log',
    'review_record',
    'screenshot',
    'command_output',
    'write_guard_log',
    'changed_files_audit',
    'gate_report',
    'merge_report',
    'other',
  ]),
  path: z.string(),
  description: z.string(),
  hash: z.string().optional(),
  created_at: z.string().datetime(),
});

export type EvidenceManifestEntry = z.infer<typeof EvidenceManifestEntrySchema>;

/**
 * evidence_manifest.json schema（§13.4）。
 */
export const EvidenceManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  entries: z.array(EvidenceManifestEntrySchema),
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
