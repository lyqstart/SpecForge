/**
 * close-gate.ts — §15.2 Close Gate implementation
 *
 * Extracted from gate-runner-v11.ts (TASK-3).
 *
 * Imports: gate-report (makeReport, types), evidence-manifest (for context).
 * Consumers: gate-runner-v11.ts (registerGate wrapper), verification-evidence-v11.ts (re-export).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type GateContext,
  type GateReportCheck,
  type GateReportV11,
  makeReport,
} from './gate-report.js';

// ---------------------------------------------------------------------------
// CloseGateResult
// ---------------------------------------------------------------------------

export interface CloseGateResult {
  report: GateReportV11;
  allChecksPassed: boolean;
}

// ---------------------------------------------------------------------------
// runCloseGate
// ---------------------------------------------------------------------------

/**
 * 运行 Close Gate 检查（§15.2）。
 */
export async function runCloseGate(ctx: GateContext): Promise<CloseGateResult> {
  const checks: GateReportCheck[] = [];
  const requiredFiles = [
    'work_item.json', 'intake.md', 'change_classification.md',
    'impact_analysis.md', 'trigger_result.json', 'tasks.md',
    'trace_delta.md', 'candidate_manifest.json', 'gate_summary.md',
    'verification_report.md', 'merge_report.md',
    'evidence/evidence_manifest.json',
  ];

  // §15.2 Check 1: required_files 存在
  for (const file of requiredFiles) {
    const fullPath = path.join(ctx.workItemDir, file);
    let exists = false;
    try { await fs.access(fullPath); exists = true; } catch { exists = false; }
    checks.push({
      check_id: `close_file_${file.replace(/[^a-z0-9]/gi, '_')}`,
      description: `Required file exists: ${file}`,
      passed: exists,
      severity: exists ? undefined : 'error',
    });
  }

  // §15.2 Check 2: verification_report 非空且引用 Evidence
  try {
    const vr = await fs.readFile(path.join(ctx.workItemDir, 'verification_report.md'), 'utf-8');
    checks.push({
      check_id: 'close_verification_nonempty',
      description: 'verification_report is not empty',
      passed: vr.trim().length > 0,
    });
    const lower = vr.toLowerCase();
    checks.push({
      check_id: 'close_verification_refs_evidence',
      description: 'verification_report references Evidence (§13.3)',
      passed: lower.includes('evidence') || lower.includes('证据'),
      severity: undefined,
    });
  } catch {
    checks.push({ check_id: 'close_verification_exists', description: 'verification_report exists', passed: false, severity: 'error' });
  }

  // §15.2 Check 3: user_decision 合法
  try {
    const udRaw = await fs.readFile(path.join(ctx.workItemDir, 'user_decision.json'), 'utf-8');
    const ud = JSON.parse(udRaw);
    const validDecision = ud.decision_status === 'approved' || ud.decision_status === 'waived';
    checks.push({
      check_id: 'close_user_decision_valid',
      description: 'User Decision is approved or waived (§10)',
      passed: validDecision,
      severity: validDecision ? undefined : 'error',
    });
  } catch {
    checks.push({ check_id: 'close_user_decision_exists', description: 'user_decision.json exists and is valid', passed: false, severity: 'error' });
  }

  // §15.2 Check 4: workflow_path 合法
  try {
    const content = await fs.readFile(path.join(ctx.workItemDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(content);
    const validPaths = [
      'requirement_change_path', 'design_change_path', 'architecture_change_path',
      'task_change_path', 'code_only_fast_path', 'spec_migration_path', 'rollback_path',
    ];
    checks.push({
      check_id: 'close_workflow_path_valid',
      description: 'workflow_path is valid (§6.4)',
      passed: validPaths.includes(wi.workflow_path),
      severity: undefined,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 5: code_permission 已撤销 + allowed_write_files 为空
  try {
    const content = await fs.readFile(path.join(ctx.workItemDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(content);
    checks.push({
      check_id: 'close_code_permission_revoked',
      description: 'code_change_allowed is false (§12)',
      passed: wi.code_change_allowed === false,
      severity: undefined,
    });
    checks.push({
      check_id: 'close_allowed_write_empty',
      description: 'allowed_write_files is empty (§15.2.13-14)',
      passed: (wi.allowed_write_files ?? []).length === 0,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 6: Write Guard 无未处理 violation
  try {
    const content = await fs.readFile(path.join(ctx.workItemDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(content);
    checks.push({
      check_id: 'close_no_write_guard_violations',
      description: 'No unresolved Write Guard violations (§15.2.12)',
      passed: !wi.write_guard_violations || wi.write_guard_violations.length === 0,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 7: trace_delta 存在且非空
  try {
    const td = await fs.readFile(path.join(ctx.workItemDir, 'trace_delta.md'), 'utf-8');
    checks.push({
      check_id: 'close_trace_delta_valid',
      description: 'trace_delta.md is not empty (§13.1)',
      passed: td.trim().length > 0,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 8: evidence_manifest 存在且有 entries
  try {
    const emRaw = await fs.readFile(path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json'), 'utf-8');
    const em = JSON.parse(emRaw);
    checks.push({
      check_id: 'close_evidence_manifest_has_entries',
      description: 'evidence_manifest has entries (§13.4)',
      passed: Array.isArray(em.entries) && em.entries.length > 0,
      severity: undefined,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 9: merge_report 存在且合法
  try {
    const mr = await fs.readFile(path.join(ctx.workItemDir, 'merge_report.md'), 'utf-8');
    const lower = mr.toLowerCase();
    const validStatus = lower.includes('success') || lower.includes('not_applicable') || lower.includes('merged');
    checks.push({
      check_id: 'close_merge_report_valid',
      description: 'merge_report has valid status (§11)',
      passed: validStatus,
      severity: undefined,
    });
  } catch {
    // covered by required_files
  }

  const report = makeReport(ctx.workItemId, 'close_gate', 'hard_gate', true, checks);
  const allChecksPassed = report.status === 'passed';

  return { report, allChecksPassed };
}
