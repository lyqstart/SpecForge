/**
 * Gate Definition Interface — v1.1 标准
 *
 * 依据：SpecForge 最终融合标准 v1.1（§9 Gate、Gate Report 与 Gate Summary）
 *
 * v1.1 新增：
 * - §9.2 Gate 分类枚举
 * - §9.3 hard_gate / soft_gate 类型
 * - §9.4 Gate Report 结构
 * - §9.5 Gate Summary 结构
 * - §9.6 冻结规则
 */

// ---------------------------------------------------------------------------
// §9.2 Gate ID 枚举
// ---------------------------------------------------------------------------

/**
 * v1.1 标准 Gate ID 枚举（§9.2）。
 */
export const GATE_IDS_V11 = [
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

export type GateIdV11 = (typeof GATE_IDS_V11)[number];

// ---------------------------------------------------------------------------
// §9.3 Gate 类型
// ---------------------------------------------------------------------------

/**
 * Gate 严格性类型（§9.3）。
 * - hard_gate: 失败不得进入下一步，不允许 waiver
 * - soft_gate: 可以通过 waiver 继续
 */
export const GATE_STRICTNESS = ['hard_gate', 'soft_gate'] as const;
export type GateStrictness = (typeof GATE_STRICTNESS)[number];

// ---------------------------------------------------------------------------
// §9.4 Gate Report
// ---------------------------------------------------------------------------

/**
 * Gate Report 单个检查项。
 */
export interface GateReportCheck {
  check_id: string;
  description: string;
  passed: boolean;
  severity?: 'error' | 'warning' | 'info';
  details?: string;
}

/**
 * Gate Report 结构（§9.4）。
 * 路径：.specforge/work-items/<WI-ID>/gates/<gate_id>.json
 */
export interface GateReportV11 {
  schema_version: '1.0';
  work_item_id: string;
  gate_id: GateIdV11;
  gate_type: GateStrictness;
  required: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'waived';
  input_files: string[];
  checks: GateReportCheck[];
  blocking_issues: string[];
  warnings: string[];
  waiver_allowed: boolean;
  waiver_required: boolean;
  waiver_ids: string[];
  started_at: string;
  finished_at: string;
  runner: string;
}

// ---------------------------------------------------------------------------
// §9.5 Gate Summary
// ---------------------------------------------------------------------------

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
// 原有 Gate Definition 接口（向后兼容）
// ---------------------------------------------------------------------------

/**
 * Gate execution types (how the gate executes its children)
 */
export type GateType = 'simple' | 'composite';

/**
 * Gate kinds (the workflow stage this gate represents)
 */
export type GateKind = 'requirements' | 'design' | 'tasks' | 'verification';

/**
 * Composite Gate execution modes
 */
export type CompositeGateMode = 'sequential' | 'parallel';

/**
 * Composite Gate failure policies
 */
export type FailPolicy = 'fail_fast' | 'collect_all';

/**
 * Gate configuration
 */
export interface GateConfig {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Gate dependencies
 */
export interface GateDependency {
  gateId: string;
  required: boolean;
}

/**
 * Base Gate definition fields
 */
export interface BaseGateDefinition {
  schema_version: "1.0";
  id: string;
  name: string;
  type: GateType;
  kind?: GateKind;
  config?: GateConfig;
  dependencies?: GateDependency[];
}

/**
 * Simple Gate definition
 */
export interface SimpleGateDefinition extends BaseGateDefinition {
  type: 'simple';
  checkFn?: () => Promise<GateResult> | GateResult;
  /** Whether this gate is required (default: true). Non-required gates auto-waive when no checkFn */
  required?: boolean;
  /** Gate severity — 'soft' gates auto-waive when no checkFn */
  severity?: 'hard' | 'soft';
}

/**
 * Composite Gate definition
 */
export interface CompositeGateDefinition extends BaseGateDefinition {
  type: 'composite';
  mode: CompositeGateMode;
  failPolicy: FailPolicy;
  children: GateDefinition[];
}

/**
 * Gate result interface (forward declaration)
 */
export type GateResult = import('./gate-result').GateResult;

/**
 * Union of all Gate definitions
 */
export type GateDefinition = SimpleGateDefinition | CompositeGateDefinition;
