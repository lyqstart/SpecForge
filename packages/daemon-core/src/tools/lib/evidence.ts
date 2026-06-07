/**
 * evidence — §13.1/13.5 Core trace types
 *
 * Extracted from verification-evidence-v11.ts (TASK-6).
 */

// ── Core Trace Types ──

export interface TraceEntry {
  req_id: string;
  ac_ids: string[];
  dd_ids: string[];
  task_ids: string[];
  file_paths: string[];
  test_ids: string[];
  evidence_ids: string[];
}

export interface TraceDelta {
  /** WI ID */
  work_item_id: string;
  /** Trace 影响类型 */
  impact: 'new' | 'modified' | 'deleted' | 'none';
  /** 影响说明 */
  reason: string;
  /** 受影响的 Trace 条目 */
  entries: TraceEntry[];
  /** 是否需要更新 module trace */
  needsModuleTraceUpdate: boolean;
  /** 是否需要更新 project trace_matrix */
  needsProjectTraceUpdate: boolean;
}

// ── Shared Validation Result ──

export interface TraceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
