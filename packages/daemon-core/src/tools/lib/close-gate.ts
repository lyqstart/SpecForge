/**
 * close-gate.ts — §15.2 Close Gate implementation
 *
 * v1.3.2 no-code workflow hotfix:
 * - close_gate accepts a PASS `changed_files_audit.md` with
 *   `Mode: no_code_change / not_applicable` for strictly no-code workflows
 *   such as investigation/review/audit.
 * - For this no-code path, code_permission is allowed to have never been
 *   enabled. Normal implementation Work Items still require revoked
 *   code_permission and empty allowed_write_files.
 *
 * R2 changes:
 * - code_permission check accepts daemon-synchronized code_permission_revoked=true.
 * - allowed_write_files must be empty; allowed_write_files_snapshot is preserved for audit.
 *
 * Semantic closure hardening:
 * - close_gate now requires `.semantic_closure.json`.
 * - `.semantic_closure.json` must prove the user outcome -> requirement -> design -> task -> evidence chain.
 * - file-only / compile-only / weak evidence cannot close a Work Item.
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
import { validateSemanticClosure, type SemanticClosureManifest } from './semantic-closure-core.js';
import { evaluateChangedFilesAuditVerdict } from './changed-files-audit-verdict.js';

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

async function readJson<T = unknown>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function details(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(item => String(item)).join('; ');
  return String(value);
}

function sanitizeCheckId(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeWorkflowValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
}

function isNoCodeWorkflow(wi: Record<string, unknown> | null): boolean {
  if (!wi) return false;
  const workflowType = normalizeWorkflowValue(wi.workflow_type);
  const workflowPath = normalizeWorkflowValue(wi.workflow_path);
  const intent = normalizeWorkflowValue((wi as any).intent ?? (wi as any).change_type);

  const allowed = new Set([
    'investigation',
    'review',
    'audit',
    'analysis',
    'no_code_review',
    'no_code_change',
    'read_only_review',
  ]);

  return (
    allowed.has(workflowType) ||
    allowed.has(intent) ||
    workflowPath === 'investigation_path' ||
    workflowPath === 'review_path'
  );
}

function normalizeAllowedFiles(input: unknown): Array<{ path: string; operation?: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map(entry => {
      if (typeof entry === 'string') return { path: entry, operation: 'modify' };
      if (entry && typeof entry === 'object') {
        return {
          path: String((entry as any).path ?? ''),
          operation: String((entry as any).operation ?? 'modify'),
        };
      }
      return { path: '', operation: 'modify' };
    })
    .filter(entry => entry.path.length > 0);
}

function codePermissionNeverEnabled(wi: Record<string, unknown> | null): boolean {
  if (!wi) return false;
  return (
    wi.code_change_allowed !== true &&
    (wi as any).permission_enabled_at === undefined &&
    (wi as any).code_permission_released !== true &&
    (wi as any).code_permission_revoked !== true &&
    (wi as any).code_permission_revoked_at === undefined &&
    normalizeAllowedFiles((wi as any).allowed_write_files).length === 0 &&
    normalizeAllowedFiles((wi as any).allowed_write_files_snapshot).length === 0
  );
}

function isNoCodeAuditText(auditText: string | null): boolean {
  if (!auditText) return false;
  const lower = auditText.toLowerCase();
  return (
    lower.includes('mode: no_code_change') ||
    lower.includes('mode: not_applicable') ||
    lower.includes('not_applicable / no_code_change') ||
    lower.includes('no_code_change / not_applicable')
  );
}

function isNoCodeAuditAccepted(
  auditText: string | null,
  wi: Record<string, unknown> | null
): boolean {
  if (!auditText || !isNoCodeAuditText(auditText) || !isNoCodeWorkflow(wi)) return false;
  const verdict = evaluateChangedFilesAuditVerdict(auditText);
  return verdict.passed;
}

function semanticClosureChecks(
  manifest: SemanticClosureManifest | null,
  investigationWorkflow: boolean
): GateReportCheck[] {
  if (!manifest) {
    return [
      {
        check_id: 'close_semantic_closure_json_valid',
        description: '.semantic_closure.json exists and is valid JSON',
        passed: false,
        severity: 'error',
      },
    ];
  }

  const validation = validateSemanticClosure(manifest);
  const checks: GateReportCheck[] = [
    {
      check_id: 'close_semantic_closure_valid',
      description: validation.passed
        ? investigationWorkflow
          ? 'Semantic closure proves QUESTION -> PLAN -> FINDING -> EVIDENCE -> VERIFICATION'
          : 'Semantic closure proves OUT -> REQ -> DD -> TASK -> EV'
        : `Semantic closure failed: ${validation.errors.map(issue => issue.check_id).join(', ')}`,
      passed: validation.passed,
      severity: validation.passed ? undefined : 'error',
      details: details(validation.errors.map(issue => `${issue.check_id}: ${issue.message}`)),
    },
  ];

  for (const warning of validation.warnings) {
    checks.push({
      check_id: `close_semantic_closure_warning_${sanitizeCheckId(warning.check_id)}`,
      description: `Semantic closure warning: ${warning.message}`,
      passed: false,
      severity: 'warning',
      details: details(warning.details),
    });
  }

  return checks;
}

export async function runCloseGate(ctx: GateContext): Promise<CloseGateResult> {
  const checks: GateReportCheck[] = [];
  const wi = await readJson<Record<string, unknown>>(path.join(ctx.workItemDir, 'work_item.json'));
  const workflowType = normalizeWorkflowValue(wi?.workflow_type ?? ctx.workflowType);
  const investigationWorkflow = workflowType === 'investigation';
  const requiredFiles = [
    'work_item.json',
    'intake.md',
    'change_classification.md',
    'impact_analysis.md',
    'trigger_result.json',
    ...(investigationWorkflow
      ? ['investigation_plan.md', 'findings_report.md']
      : ['tasks.md', 'trace_delta.md']),
    'candidate_manifest.json',
    'gate_summary.md',
    'verification_report.md',
    'merge_report.md',
    'changed_files_audit.md',
    'evidence/evidence_manifest.json',
    '.semantic_closure.json',
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

  const changedFilesAuditText = await readText(
    path.join(ctx.workItemDir, 'changed_files_audit.md')
  );
  const noCodeAuditAccepted = isNoCodeAuditAccepted(changedFilesAuditText, wi);

  try {
    const vr = await fs.readFile(path.join(ctx.workItemDir, 'verification_report.md'), 'utf-8');
    checks.push({
      check_id: 'close_verification_nonempty',
      description: 'verification_report is not empty',
      passed: vr.trim().length > 0,
      severity: vr.trim().length > 0 ? undefined : 'error',
    });

    const lower = vr.toLowerCase();
    const verificationEvidenceManifest = await readJson<Record<string, unknown>>(
      path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json')
    );
    const verificationEvidenceManifestHasEntries =
      Array.isArray((verificationEvidenceManifest as any)?.entries) &&
      (verificationEvidenceManifest as any).entries.length > 0;
    checks.push({
      check_id: 'close_verification_refs_evidence',
      description: 'verification_report references Evidence (§13.3)',
      passed:
        lower.includes('evidence') ||
        lower.includes('证据') ||
        verificationEvidenceManifestHasEntries,
      severity:
        lower.includes('evidence') ||
        lower.includes('证据') ||
        verificationEvidenceManifestHasEntries
          ? undefined
          : 'error',
    });
  } catch {
    checks.push({
      check_id: 'close_verification_exists',
      description: 'verification_report exists',
      passed: false,
      severity: 'error',
    });
  }

  const ud = await readJson<Record<string, unknown>>(
    path.join(ctx.workItemDir, 'user_decision.json')
  );
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
      severity: 'error',
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
    description: governance.valid
      ? 'User Decision is semantically valid: actor, workflow_path, Gate hash, manifest hash, candidate hash'
      : `User Decision semantic validation failed: ${governance.errors.join('; ')}`,
    passed: governance.valid,
    severity: governance.valid ? undefined : 'error',
  });

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
      passed: validPaths.includes(wi.workflow_path as string),
      severity: validPaths.includes(wi.workflow_path as string) ? undefined : 'error',
    });

    const allowedWriteFiles = normalizeAllowedFiles((wi as any).allowed_write_files);
    const normalPermissionRevoked =
      wi.code_permission_revoked === true || (wi as any).code_permission_released === true;
    const noCodePermissionOk = noCodeAuditAccepted && codePermissionNeverEnabled(wi);
    const permissionCheckPassed =
      allowedWriteFiles.length === 0 && (noCodePermissionOk || normalPermissionRevoked);

    checks.push({
      check_id: 'close_code_permission_revoked',
      description: noCodeAuditAccepted
        ? 'code_permission was never enabled for no-code investigation/review WI (§12 no-code exception)'
        : 'code_permission is revoked by daemon fact source (§12)',
      passed: permissionCheckPassed,
      severity: permissionCheckPassed ? undefined : 'error',
      details: noCodeAuditAccepted
        ? `no_code_audit_accepted=${noCodeAuditAccepted}; code_permission_never_enabled=${codePermissionNeverEnabled(wi)}; allowed_write_files=${allowedWriteFiles.length}`
        : undefined,
    });
    checks.push({
      check_id: 'close_allowed_write_empty',
      description: 'allowed_write_files is empty (§15.2.13-14)',
      passed: allowedWriteFiles.length === 0,
      severity: allowedWriteFiles.length === 0 ? undefined : 'error',
    });
    checks.push({
      check_id: 'close_no_write_guard_violations',
      description: 'No unresolved Write Guard violations (§15.2.12)',
      passed: !wi.write_guard_violations || (wi.write_guard_violations as unknown[]).length === 0,
      severity:
        !wi.write_guard_violations || (wi.write_guard_violations as unknown[]).length === 0
          ? undefined
          : 'error',
    });

    if (wi.resume_plan) {
      const hasPending =
        Array.isArray((wi.resume_plan as any).actions) &&
        (wi.resume_plan as any).actions.some((a: { type: string }) => a.type !== 'continue');
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
  }

  if (!investigationWorkflow) {
    try {
      const td = await fs.readFile(path.join(ctx.workItemDir, 'trace_delta.md'), 'utf-8');
      checks.push({
        check_id: 'close_trace_delta_valid',
        description: 'trace_delta.md is not empty (§13.1)',
        passed: td.trim().length > 0,
        severity: td.trim().length > 0 ? undefined : 'error',
      });
    } catch {
      // Covered by required files.
    }
  }

  if (investigationWorkflow) {
    const plan = await readText(path.join(ctx.workItemDir, 'investigation_plan.md'));
    const findings = await readText(path.join(ctx.workItemDir, 'findings_report.md'));
    const manifest = await readJson<Record<string, unknown>>(
      path.join(ctx.workItemDir, 'candidate_manifest.json')
    );
    const rootStatuses =
      String(findings ?? '').match(
        /\b(ROOT_CAUSE_CONFIRMED|ROOT_CAUSE_PROBABLE|ROOT_CAUSE_UNCONFIRMED|INSUFFICIENT_EVIDENCE)\b/g
      ) ?? [];
    const canonicalEvidenceOnly =
      manifest?.workflow_type === 'investigation' &&
      manifest?.no_project_spec_change === true &&
      normalizeWorkflowValue(manifest?.project_integration_effect) === 'evidence_only' &&
      manifest?.merge_required === false &&
      manifest?.merge_applicable === false &&
      Array.isArray(manifest?.entries) &&
      manifest.entries.length === 0;

    checks.push({
      check_id: 'close_investigation_plan_nonempty',
      description: 'investigation_plan.md is non-empty',
      passed: !!plan?.trim(),
      severity: plan?.trim() ? undefined : 'error',
    });
    checks.push({
      check_id: 'close_findings_report_nonempty',
      description: 'findings_report.md is non-empty',
      passed: !!findings?.trim(),
      severity: findings?.trim() ? undefined : 'error',
    });
    checks.push({
      check_id: 'close_investigation_root_status_unique',
      description: 'findings_report declares exactly one root-cause confidence status',
      passed: new Set(rootStatuses).size === 1,
      severity: new Set(rootStatuses).size === 1 ? undefined : 'error',
    });
    checks.push({
      check_id: 'close_investigation_candidate_evidence_only',
      description: 'Investigation candidate manifest is canonical evidence_only with empty entries',
      passed: canonicalEvidenceOnly,
      severity: canonicalEvidenceOnly ? undefined : 'error',
    });
  }

  const em = await readJson<Record<string, unknown>>(
    path.join(ctx.workItemDir, 'evidence', 'evidence_manifest.json')
  );
  if (em) {
    const hasEntries = Array.isArray((em as any).entries) && (em as any).entries.length > 0;
    checks.push({
      check_id: 'close_evidence_manifest_has_entries',
      description: 'evidence_manifest has entries (§13.4)',
      passed: hasEntries,
      severity: hasEntries ? undefined : 'error',
    });
  }

  const semanticManifest = await readJson<SemanticClosureManifest>(
    path.join(ctx.workItemDir, '.semantic_closure.json')
  );
  checks.push(...semanticClosureChecks(semanticManifest, investigationWorkflow));

  try {
    const mr = await fs.readFile(path.join(ctx.workItemDir, 'merge_report.md'), 'utf-8');
    const lower = mr.toLowerCase();
    const validStatus =
      lower.includes('success') || lower.includes('not_applicable') || lower.includes('merged');
    checks.push({
      check_id: 'close_merge_report_valid',
      description: 'merge_report has valid status (§11)',
      passed: validStatus,
      severity: validStatus ? undefined : 'error',
    });
  } catch {
    // Covered by required files.
  }

  if (changedFilesAuditText !== null) {
    const verdict = evaluateChangedFilesAuditVerdict(changedFilesAuditText);
    checks.push({
      check_id: 'close_changed_files_audit_passed',
      description: noCodeAuditAccepted
        ? 'changed_files_audit passed as not_applicable/no_code_change (§15.2 no-code exception)'
        : 'changed_files_audit passed (§15.2)',
      passed: verdict.passed,
      severity: verdict.passed ? undefined : 'error',
      details: verdict.reason,
    });
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
        severity: status === 'passed' || status === 'not_applicable' ? undefined : 'error',
      });
    } else {
      checks.push({
        check_id: 'close_post_merge_gate',
        description: 'post_merge_gate not present (assumed not_applicable)',
        passed: true,
      });
    }

    const blockingMatches = Array.from(gs.matchAll(/- Blocking Issues:\s*\n((?:\s+- .+\n?)*)/g));
    const blockingIssues = blockingMatches.flatMap(match =>
      String(match[1] ?? '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
    );
    const closeOnlyFailedSummary =
      gs.includes('### close_gate') &&
      !gs.includes('### required_files_gate') &&
      !gs.includes('### candidate_manifest_gate') &&
      !gs.includes('### workflow_selection_gate');
    const hasBlocking = blockingIssues.length > 0 && !closeOnlyFailedSummary;
    checks.push({
      check_id: 'close_no_blocking_issues',
      description: closeOnlyFailedSummary
        ? 'Ignoring stale close_gate-only Gate Summary from previous failed close attempt'
        : 'No unresolved blocking issues (§15.2)',
      passed: !hasBlocking,
      severity: hasBlocking ? 'error' : undefined,
    });

    const hasWaiver = gs.includes('passed_with_waiver_required') || gs.includes('waiver');
    if (hasWaiver && wi) {
      const hasFollowUp =
        (wi as any).waiver_follow_up_wi ?? (wi as any).follow_up_wi ?? (wi as any).waiver_followups;
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
    // Covered by required files.
  }

  try {
    const extReqPath = path.join(ctx.workItemDir, 'extension_request.json');
    await fs.access(extReqPath);
    const extReq = JSON.parse(await fs.readFile(extReqPath, 'utf-8')) as Record<string, unknown>;
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
      checks.push({
        check_id: 'close_extension_request_resolved',
        description: 'No extension_request.json present (not applicable)',
        passed: true,
      });
    } else {
      checks.push({
        check_id: 'close_extension_request_resolved',
        description: 'extension_request.json exists but cannot be parsed (fail-closed)',
        passed: false,
        severity: 'error',
      });
    }
  }

  const report = makeReport(ctx.workItemId, 'close_gate', 'hard_gate', true, checks, requiredFiles);
  return { report, allChecksPassed: report.status === 'passed' };
}
