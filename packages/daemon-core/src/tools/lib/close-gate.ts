/**
 * close-gate.ts — §15.2 Close Gate implementation
 *
 * R2 changes:
 * - code_permission check accepts daemon-synchronized code_permission_revoked=true.
 * - allowed_write_files must be empty; allowed_write_files_snapshot is preserved for audit.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type GateContext,
  type GateReportCheck,
  type GateReportV11,
  makeReport,
} from './gate-report.js';
import { validateApprovedUserDecisionForClose } from './governance-invariants-v11.js';

export interface CloseGateResult {
  report: GateReportV11;
  allChecksPassed: boolean;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function runCloseGate(ctx: GateContext): Promise<CloseGateResult> {
  const checks: GateReportCheck[] = [];
  const requiredFiles = [
    'work_item.json',
    'intake.md',
    'change_classification.md',
    'impact_analysis.md',
    'trigger_result.json',
    'tasks.md',
    'trace_delta.md',
    'candidate_manifest.json',
    'gate_summary.md',
    'verification_report.md',
    'merge_report.md',
    'changed_files_audit.md',
    'evidence/evidence_manifest.json',
  ];

  for (const file of requiredFiles) {
    const ok = await exists(path.join(ctx.workItemDir, file));
    checks.push({
      check_id: `close_file_${file.replace(/[^a-z0-9]/gi, '_')}`,
      description: `Required file exists: ${file}`,
      passed: ok,
      severity: ok ? undefined : 'error',
    });
  }

  try {
    const vr = await fs.readFile(path.join(ctx.workItemDir, 'verification_report.md'), 'utf-8');
    checks.push({ check_id: 'close_verification_nonempty', description: 'verification_report is not empty', passed: vr.trim().length > 0 });
    const lower = vr.toLowerCase();
    checks.push({
      check_id: 'close_verification_refs_evidence',
      description: 'verification_report references Evidence (§13.3)',
      passed: lower.includes('evidence') || lower.includes('证据'),
    });
  } catch {
    checks.push({ check_id: 'close_verification_exists', description: 'verification_report exists', passed: false, severity: 'error' });
  }

  const ud = await readJson(path.join(ctx.workItemDir, 'user_decision.json'));
  if (ud) {
    const validDecision = ud.decision_status === 'approved' || ud.decision_status === 'waived';
    checks.push({
      check_id: 'close_user_decision_valid',
      description: 'User Decision is approved or waived (§10)',
      passed: validDecision,
      severity: validDecision ? undefined : 'error',
    });
  } else {
    checks.push({
      check_id: 'close_user_decision_exists',
      description: 'user_decision.json exists and is valid',
      passed: false,
      severity: 'error'
    });
  }
  const governance = await validateApprovedUserDecisionForClose({
    projectRoot: ctx.projectRoot,
    workItemDir: ctx.workItemDir,
    workItemId: ctx.workItemId,
    candidateManifestPath: path.join(ctx.workItemDir, 'candidate_manifest.json'),
    userDecisionPath: path.join(ctx.workItemDir, 'user_decision.json'),
  });
  checks.push({
    check_id: 'close_user_decision_semantic_valid',
    description: governance.valid ? 'User Decision is semantically valid: actor, workflow_path, Gate hash, manifest hash, candidate hash' : `User Decision semantic validation failed: ${governance.errors.join('; ')}`,
    passed: governance.valid,
    severity: governance.valid ? undefined : 'error',
  });

  const wi = await readJson(path.join(ctx.workItemDir, 'work_item.json'));
  if (wi) {
    const validPaths = [
      'requirement_change_path',
      'design_change_path',
      'architecture_change_path',
      'task_change_path',
      'code_only_fast_path',
      'spec_migration_path',
      'rollback_path',
    ];
    checks.push({
      check_id: 'close_workflow_path_valid',
      description: 'workflow_path is valid (§6.4)',
      passed: validPaths.includes(wi.workflow_path),
    });

    const allowedWriteFiles = Array.isArray(wi.allowed_write_files) ? wi.allowed_write_files : [];
    const permissionRevoked = wi.code_permission_revoked === true || wi.code_change_allowed === false;
    checks.push({
      check_id: 'close_code_permission_revoked',
      description: 'code_permission is revoked by daemon fact source (§12)',
      passed: permissionRevoked && allowedWriteFiles.length === 0,
      severity: permissionRevoked && allowedWriteFiles.length === 0 ? undefined : 'error',
    });
    checks.push({
      check_id: 'close_allowed_write_empty',
      description: 'allowed_write_files is empty (§15.2.13-14)',
      passed: allowedWriteFiles.length === 0,
    });
    checks.push({
      check_id: 'close_no_write_guard_violations',
      description: 'No unresolved Write Guard violations (§15.2.12)',
      passed: !wi.write_guard_violations || wi.write_guard_violations.length === 0,
    });

    if (wi.resume_plan) {
      const hasPending = Array.isArray(wi.resume_plan.actions) && wi.resume_plan.actions.some((a: { type: string }) => a.type !== 'continue');
      checks.push({
        check_id: 'close_resume_plan_no_pending',
        description: 'resume_plan has no pending items (§15.2)',
        passed: !hasPending,
        severity: hasPending ? 'error' : undefined,
      });
    } else {
      checks.push({ check_id: 'close_resume_plan_no_pending', description: 'No resume_plan present (not applicable)', passed: true });
    }
  }

  try {
    const td = await fs.readFile(path.join(ctx.workItemDir, 'trace_delta.md'), 'utf-8');
    checks.push({ check_id: 'close_trace_delta_valid', description: 'trace_delta.md is not empty (§13.1)', passed: td.trim().length > 0 });
  } catch {
    // Covered by required files.
  }

  const em = await readJson(path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json'));
  if (em) {
    checks.push({
      check_id: 'close_evidence_manifest_has_entries',
      description: 'evidence_manifest has entries (§13.4)',
      passed: Array.isArray(em.entries) && em.entries.length > 0,
    });
  }

  try {
    const mr = await fs.readFile(path.join(ctx.workItemDir, 'merge_report.md'), 'utf-8');
    const lower = mr.toLowerCase();
    const validStatus = lower.includes('success') || lower.includes('not_applicable') || lower.includes('merged');
    checks.push({ check_id: 'close_merge_report_valid', description: 'merge_report has valid status (§11)', passed: validStatus });
  } catch {
    // Covered by required files.
  }

  try {
    const cfa = await fs.readFile(path.join(ctx.workItemDir, 'changed_files_audit.md'), 'utf-8');
    const cfaLower = cfa.toLowerCase();
    checks.push({
      check_id: 'close_changed_files_audit_passed',
      description: 'changed_files_audit passed (§15.2)',
      passed: cfaLower.includes('pass') || cfaLower.includes('success'),
    });
  } catch {
    // Covered by required files.
  }

  try {
    const gs = await fs.readFile(path.join(ctx.workItemDir, 'gate_summary.md'), 'utf-8');
    const pmgSection = gs.match(/### post_merge_gate[\s\S]*?- Status: (\S+)/);
    if (pmgSection) {
      const status = pmgSection[1];
      checks.push({
        check_id: 'close_post_merge_gate',
        description: 'post_merge_gate passed or not_applicable (§15.2)',
        passed: status === 'passed' || status === 'not_applicable',
      });
    } else {
      checks.push({ check_id: 'close_post_merge_gate', description: 'post_merge_gate not present (assumed not_applicable)', passed: true });
    }

    const blockingMatch = gs.match(/- Blocking Issues:\s*\n((?: - .+\n?)*)/);
    const hasBlocking = blockingMatch !== null && blockingMatch[1].trim().length > 0;
    checks.push({
      check_id: 'close_no_blocking_issues',
      description: 'No unresolved blocking issues (§15.2)',
      passed: !hasBlocking,
      severity: hasBlocking ? 'error' : undefined,
    });

    const hasWaiver = gs.includes('passed_with_waiver_required') || gs.includes('waiver');
    if (hasWaiver && wi) {
      const hasFollowUp = wi.waiver_follow_up_wi ?? wi.follow_up_wi ?? wi.waiver_followups;
      checks.push({
        check_id: 'close_waiver_follow_up',
        description: 'Waiver follow-up WI registered (§15.2)',
        passed: !!hasFollowUp,
        severity: hasFollowUp ? undefined : 'error',
      });
    } else {
      checks.push({ check_id: 'close_waiver_follow_up', description: 'No waivers requiring follow-up', passed: true });
    }
  } catch {
    // Covered by required files.
  }

  try {
    const extReqPath = path.join(ctx.workItemDir, 'extension_request.json');
    await fs.access(extReqPath);
    const extReq = JSON.parse(await fs.readFile(extReqPath, 'utf-8'));
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
      checks.push({ check_id: 'close_extension_request_resolved', description: 'No extension_request.json present (not applicable)', passed: true });
    } else {
      checks.push({ check_id: 'close_extension_request_resolved', description: 'extension_request.json exists but cannot be parsed (fail-closed)', passed: false, severity: 'error' });
    }
  }

  const report = makeReport(ctx.workItemId, 'close_gate', 'hard_gate', true, checks);
  return { report, allChecksPassed: report.status === 'passed' };
}
