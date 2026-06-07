/**
 * gate-report.ts — §9.4 Gate Report types and helpers
 *
 * Extracted from gate-runner-v11.ts (TASK-3).
 *
 * Re-exports: nothing (leaf module).
 * Consumers: gate-chain.ts, gate-runner-v11.ts (re-export).
 */

import type { GateIdV11, GateStrictness } from './gate-runner-v11.js';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// ---------------------------------------------------------------------------
// §9.4 Gate Report
// ---------------------------------------------------------------------------

export interface GateReportCheck {
  check_id: string;
  description: string;
  passed: boolean;
  severity?: 'error' | 'warning' | 'info';
  details?: string;
}

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
// Gate 检查函数签名
// ---------------------------------------------------------------------------

export interface GateContext {
  workItemId: string;
  workItemDir: string;
  projectRoot: string;
}

export type GateCheckFn = (ctx: GateContext) => Promise<GateReportV11>;

// ---------------------------------------------------------------------------
// Internal: late-bound registry accessor (set by gate-chain.ts)
// ---------------------------------------------------------------------------

interface GateMetaLike {
  gateId: GateIdV11;
  gateType: GateStrictness;
  required: boolean;
  checkFn: GateCheckFn;
}

let _getMeta: ((id: GateIdV11) => GateMetaLike | undefined) | null = null;

/** @internal — called by gate-chain.ts to inject registry accessor */
export function __injectRegistry(getter: (id: GateIdV11) => GateMetaLike | undefined): void {
  _getMeta = getter;
}

// ---------------------------------------------------------------------------
// runGate
// ---------------------------------------------------------------------------

/**
 * 运行单个 Gate 并生成 Gate Report（§9.4）。
 */
export async function runGate(
  gateId: GateIdV11,
  ctx: GateContext,
): Promise<GateReportV11> {
  if (!_getMeta) {
    return makeSkippedReport(ctx.workItemId, gateId, 'Gate chain not initialized');
  }

  const meta = _getMeta(gateId);
  if (!meta) {
    return makeSkippedReport(ctx.workItemId, gateId, 'Gate not registered');
  }

  const startedAt = new Date().toISOString();
  try {
    return await meta.checkFn(ctx);
  } catch (err: any) {
    return {
      schema_version: '1.0',
      work_item_id: ctx.workItemId,
      gate_id: gateId,
      gate_type: meta.gateType,
      required: meta.required,
      status: 'failed',
      input_files: [],
      checks: [],
      blocking_issues: [`Gate execution error: ${err.message}`],
      warnings: [],
      waiver_allowed: false,
      waiver_required: false,
      waiver_ids: [],
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      runner: ACTOR_ROLES.gateRunner,
    };
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

export function makeSkippedReport(workItemId: string, gateId: GateIdV11, reason: string): GateReportV11 {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: gateId,
    gate_type: 'hard_gate',
    required: false,
    status: 'skipped',
    input_files: [],
    checks: [],
    blocking_issues: [],
    warnings: [reason],
    waiver_allowed: false,
    waiver_required: false,
    waiver_ids: [],
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    runner: ACTOR_ROLES.gateRunner,
  };
}

export function makeReport(
  workItemId: string,
  gateId: GateIdV11,
  gateType: GateStrictness,
  required: boolean,
  checks: GateReportCheck[],
  inputFiles: string[] = [],
): GateReportV11 {
  const blocking = checks.filter(c => !c.passed && c.severity !== 'warning').map(c => c.description);
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning').map(c => c.description);
  const allPassed = checks.every(c => c.passed);

  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    gate_id: gateId,
    gate_type: gateType,
    required,
    status: allPassed ? 'passed' : (blocking.length > 0 ? 'failed' : 'passed'),
    input_files: inputFiles,
    checks,
    blocking_issues: blocking,
    warnings,
    waiver_allowed: gateType === 'soft_gate',
    waiver_required: !allPassed && gateType === 'soft_gate',
    waiver_ids: [],
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    runner: ACTOR_ROLES.gateRunner,
  };
}
