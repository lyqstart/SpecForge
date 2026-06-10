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
    'verification_report.md', 'merge_report.md', 'changed_files_audit.md',
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

  // §15.2 Check 10: changed_files_audit passed
  try {
    const cfa = await fs.readFile(path.join(ctx.workItemDir, 'changed_files_audit.md'), 'utf-8');
    const cfaLower = cfa.toLowerCase();
    checks.push({
      check_id: 'close_changed_files_audit_passed',
      description: 'changed_files_audit passed (§15.2)',
      passed: cfaLower.includes('pass') || cfaLower.includes('success'),
      severity: undefined,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 11: post_merge_gate passed or not_applicable
  try {
    const gs = await fs.readFile(path.join(ctx.workItemDir, 'gate_summary.md'), 'utf-8');
    const pmgSection = gs.match(/### post_merge_gate[\s\S]*?- Status: (\S+)/);
    if (pmgSection) {
      const status = pmgSection[1];
      checks.push({
        check_id: 'close_post_merge_gate',
        description: 'post_merge_gate passed or not_applicable (§15.2)',
        passed: status === 'passed' || status === 'not_applicable',
        severity: undefined,
      });
    } else {
      checks.push({
        check_id: 'close_post_merge_gate',
        description: 'post_merge_gate not present (assumed not_applicable)',
        passed: true,
      });
    }
  } catch {
    // covered by required_files
  }

  // §15.2 Check 12: no unresolved blocking issues
  try {
    const gsBlocking = await fs.readFile(path.join(ctx.workItemDir, 'gate_summary.md'), 'utf-8');
    const blockingMatch = gsBlocking.match(/- Blocking Issues:\s*\n((?:  - .+\n?)*)/);
    const hasBlocking = blockingMatch !== null && blockingMatch[1].trim().length > 0;
    checks.push({
      check_id: 'close_no_blocking_issues',
      description: 'No unresolved blocking issues (§15.2)',
      passed: !hasBlocking,
      severity: hasBlocking ? 'error' : undefined,
    });
  } catch {
    // covered by required_files
  }

  // §15.2 Check 13: waiver follow-up registered
  try {
    const gsWaiver = await fs.readFile(path.join(ctx.workItemDir, 'gate_summary.md'), 'utf-8');
    const hasWaiver = gsWaiver.includes('passed_with_waiver_required') || gsWaiver.includes('waiver');
    if (hasWaiver) {
      const wiContent = await fs.readFile(path.join(ctx.workItemDir, 'work_item.json'), 'utf-8');
      const wi = JSON.parse(wiContent);
      const hasFollowUp = wi.waiver_follow_up_wi ?? wi.follow_up_wi ?? wi.waiver_followups;
      checks.push({
        check_id: 'close_waiver_follow_up',
        description: 'Waiver follow-up WI registered (§15.2)',
        passed: !!hasFollowUp,
        severity: hasFollowUp ? undefined : 'error',
      });
    } else {
      checks.push({
        check_id: 'close_waiver_follow_up',
        description: 'No waivers requiring follow-up',
        passed: true,
      });
    }
  } catch {
    // covered by required_files
  }

  // §15.2 Check 14: resume_plan has no pending items
  try {
    const wiContent = await fs.readFile(path.join(ctx.workItemDir, 'work_item.json'), 'utf-8');
    const wi = JSON.parse(wiContent);
    if (wi.resume_plan) {
      const hasPending = Array.isArray(wi.resume_plan.actions) &&
        wi.resume_plan.actions.some((a: { type: string }) => a.type !== 'continue');
      checks.push({
        check_id: 'close_resume_plan_no_pending',
        description: 'resume_plan has no pending items (§15.2)',
        passed: !hasPending,
        severity: hasPending ? 'error' : undefined,
      });
    } else {
      checks.push({
        check_id: 'close_resume_plan_no_pending',
        description: 'No resume_plan present (not applicable)',
        passed: true,
      });
    }
  } catch {
    // covered by required_files
  }

  // §15.2 Check 15: No unprocessed extension_request.json (Patch 1 §7.9)
  // Fail-closed strategy: file exists + unresolved/unknown status → blocked.
  try {
    const extReqPath = path.join(ctx.workItemDir, 'extension_request.json');
    await fs.access(extReqPath);
    // File exists — check if resolved
    const extRaw = await fs.readFile(extReqPath, 'utf-8');
    const extReq = JSON.parse(extRaw);
    const status = (extReq.status as string) ?? '';
    const resolvedStatuses = new Set(['resolved', 'merged', 'closed']);
    const isResolved = resolvedStatuses.has(status);
    const isNonBlocking = extReq.blocking_current_flow === false && status === '';
    const passed = isResolved || isNonBlocking;
    checks.push({
      check_id: 'close_extension_request_resolved',
      description: 'extension_request.json resolved or non-blocking (Patch 1 §7.9)',
      passed,
      severity: passed ? undefined : 'error',
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File does not exist — no extension request, pass
      checks.push({
        check_id: 'close_extension_request_resolved',
        description: 'No extension_request.json present (not applicable)',
        passed: true,
      });
    } else {
      // File exists but cannot be parsed — fail-closed
      checks.push({
        check_id: 'close_extension_request_resolved',
        description: 'extension_request.json exists but cannot be parsed (fail-closed)',
        passed: false,
        severity: 'error',
      });
    }
  }

  const report = makeReport(ctx.workItemId, 'close_gate', 'hard_gate', true, checks);
  const allChecksPassed = report.status === 'passed';

  return { report, allChecksPassed };
}
