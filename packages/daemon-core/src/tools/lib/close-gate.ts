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
import {
  resolveWorkItemSpecArtifacts,
  validateApprovedUserDecisionForClose,
} from './governance-invariants-v11.js';
import { validateSemanticClosure, type SemanticClosureManifest } from './semantic-closure-core.js';
import { validateSemanticClosureProvenance } from './semantic-closure-provenance.js';
import { evaluateChangedFilesAuditVerdict } from './changed-files-audit-verdict.js';
import { isWorkItemSpecArtifactPlaceholder } from '@specforge/types/directory-layout';

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

interface WaiverRecordLike {
  waiver_id?: unknown;
  follow_up_wi?: unknown;
}

export interface WaiverFollowUpAssessment {
  waiverUsed: boolean;
  passed: boolean;
  waiverIds: string[];
  missingFollowUpWaiverIds: string[];
  details: string;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function assessWaiverFollowUp(
  userDecision: Record<string, unknown> | null,
  gateReports: Array<Record<string, unknown>>
): WaiverFollowUpAssessment {
  const rawWaivers = Array.isArray(userDecision?.waivers) ? userDecision.waivers : [];
  const decisionWaivers = rawWaivers.filter(
    (entry): entry is WaiverRecordLike => !!entry && typeof entry === 'object'
  );
  const decisionWaiverIds = decisionWaivers
    .map(waiver => nonEmptyString(waiver.waiver_id))
    .filter((value): value is string => value !== undefined);
  const gateWaiverIds = gateReports.flatMap(report =>
    Array.isArray(report.waiver_ids)
      ? report.waiver_ids
          .map(nonEmptyString)
          .filter((value): value is string => value !== undefined)
      : []
  );
  const gateStatusWaived = gateReports.some(report => report.status === 'waived');
  const decisionDeclaresWaiver =
    userDecision?.decision_status === 'waived' || userDecision?.decision_type === 'waived';
  const waiverUsed =
    decisionDeclaresWaiver ||
    decisionWaivers.length > 0 ||
    gateStatusWaived ||
    gateWaiverIds.length > 0;

  const missingDecisionFollowUps = decisionWaivers.flatMap((waiver, index) => {
    if (nonEmptyString(waiver.follow_up_wi)) return [];
    return [nonEmptyString(waiver.waiver_id) ?? `user_decision.waivers[${index}]`];
  });
  const unregisteredGateWaiverIds = gateWaiverIds.filter(
    waiverId => !decisionWaiverIds.includes(waiverId)
  );
  const missingFollowUpWaiverIds = uniqueStrings([
    ...missingDecisionFollowUps,
    ...unregisteredGateWaiverIds,
  ]);
  const waiverIds = uniqueStrings([...decisionWaiverIds, ...gateWaiverIds]);
  const passed =
    !waiverUsed || (decisionWaivers.length > 0 && missingFollowUpWaiverIds.length === 0);

  return {
    waiverUsed,
    passed,
    waiverIds,
    missingFollowUpWaiverIds,
    details: waiverUsed
      ? `waiver_ids=${waiverIds.join(', ') || '(declared without id)'}; missing_follow_up=${
          missingFollowUpWaiverIds.join(', ') || 'none'
        }`
      : 'waiver_ids=[]; waiver_used=false',
  };
}

async function readGateReports(workItemDir: string): Promise<Array<Record<string, unknown>>> {
  const gatesDir = path.join(workItemDir, 'gates');
  try {
    const entries = await fs.readdir(gatesDir, { withFileTypes: true });
    const reports: Array<Record<string, unknown>> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const report = await readJson<Record<string, unknown>>(path.join(gatesDir, entry.name));
      if (report) reports.push(report);
    }
    return reports;
  } catch {
    return [];
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
    'contract_change',
  ]);

  return (
    allowed.has(workflowType) ||
    allowed.has(intent) ||
    workflowPath === 'contract_change_path' ||
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
  const workflowPath = normalizeWorkflowValue(wi?.workflow_path ?? ctx.workflowPath);
  const investigationWorkflow = workflowType === 'investigation';
  const rollbackWorkflow = workflowType === 'rollback' || workflowPath === 'rollback_path';
  const contractWorkflow =
    workflowType === 'contract_change' ||
    workflowPath === 'contract_change_path';
  const [taskArtifacts, traceDeltaArtifacts] =
    investigationWorkflow || contractWorkflow
      ? [[], []]
      : await Promise.all([
          resolveWorkItemSpecArtifacts({
            projectRoot: ctx.projectRoot,
            workItemId: ctx.workItemId,
            kind: 'tasks',
          }),
          resolveWorkItemSpecArtifacts({
            projectRoot: ctx.projectRoot,
            workItemId: ctx.workItemId,
            kind: 'trace_delta',
          }),
        ]);
  const requiredFiles = [
    'work_item.json',
    'intake.md',
    'trigger_result.json',
    ...(!contractWorkflow ? ['change_classification.md', 'impact_analysis.md'] : []),
    ...(contractWorkflow
      ? []
      : investigationWorkflow
        ? ['investigation_plan.md', 'findings_report.md']
        : []),
    'candidate_manifest.json',
    'verification_report.md',
    'merge_report.md',
    'changed_files_audit.md',
    'evidence/evidence_manifest.json',
    ...(!contractWorkflow ? ['.semantic_closure.json'] : []),
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

  if (!investigationWorkflow && !contractWorkflow) {
    const authoritativeArtifacts = [
      { kind: 'tasks' as const, file: 'candidates/tasks.md', artifacts: taskArtifacts },
      {
        kind: 'trace_delta' as const,
        file: 'candidates/trace_delta.md',
        artifacts: traceDeltaArtifacts,
      },
    ];
    for (const artifact of authoritativeArtifacts) {
      const resolved = artifact.artifacts[0];
      const valid = Boolean(
        resolved &&
          !isWorkItemSpecArtifactPlaceholder(artifact.kind, resolved.content),
      );
      checks.push({
        check_id: `close_artifact_${artifact.kind}_authoritative`,
        description:
          `Authoritative ${artifact.kind} artifact is present ` +
          `(Candidate first; authored legacy fallback only)`,
        passed: valid,
        severity: valid ? undefined : 'error',
        details: valid
          ? `path=${path.relative(ctx.projectRoot, resolved!.path).replace(/\\/g, '/')}`
          : `expected=${artifact.file}; reason=${
              resolved
                ? 'resolved artifact is empty or a lifecycle placeholder'
                : 'authoritative artifact not found'
            }`,
      });
    }
  }

  const [formalVersionReport, governanceScope, gitContext, triggerResult] = await Promise.all([
    readJson<Record<string, unknown>>(
      path.join(ctx.workItemDir, 'gates', 'formal_version_gate.json'),
    ),
    readJson<Record<string, unknown>>(path.join(ctx.workItemDir, 'governance_scope.json')),
    readJson<Record<string, unknown>>(path.join(ctx.workItemDir, 'git_context.json')),
    readJson<Record<string, unknown>>(path.join(ctx.workItemDir, 'trigger_result.json')),
  ]);
  const formalVersionRequired =
    !investigationWorkflow &&
    !rollbackWorkflow &&
    (formalVersionReport !== null ||
      governanceScope?.active === true ||
      gitContext?.git_enabled === true ||
      (triggerResult?.impact_scope !== null &&
        typeof triggerResult?.impact_scope === 'object' &&
        !Array.isArray(triggerResult?.impact_scope)));
  checks.push({
    check_id: 'close_formal_version_gate',
    description: formalVersionRequired
      ? 'Formal Version Gate passed before Close'
      : 'Formal Version Gate is not applicable to this legacy/no-code workflow',
    passed: !formalVersionRequired || formalVersionReport?.status === 'passed',
    severity:
      !formalVersionRequired || formalVersionReport?.status === 'passed' ? undefined : 'error',
    details: formalVersionRequired
      ? `status=${String(formalVersionReport?.status ?? 'missing')}`
      : 'not_applicable',
  });

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
      'contract_change_path',
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

  if (!investigationWorkflow && !contractWorkflow) {
    const traceDelta = traceDeltaArtifacts[0];
    if (traceDelta) {
      const valid =
        !isWorkItemSpecArtifactPlaceholder('trace_delta', traceDelta.content) &&
        traceDelta.content.trim().length > 0;
      checks.push({
        check_id: 'close_trace_delta_valid',
        description: 'authoritative trace_delta is not empty or a lifecycle placeholder (§13.1)',
        passed: valid,
        severity: valid ? undefined : 'error',
        details: `path=${path.relative(ctx.projectRoot, traceDelta.path).replace(/\\/g, '/')}`,
      });
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

  if (!contractWorkflow) {
    const semanticManifest = await readJson<SemanticClosureManifest>(
      path.join(ctx.workItemDir, '.semantic_closure.json')
    );
    checks.push(...semanticClosureChecks(semanticManifest, investigationWorkflow));
    const provenanceValidation = await validateSemanticClosureProvenance(
      ctx.workItemDir,
      semanticManifest
    );
    checks.push({
      check_id: 'close_semantic_closure_provenance_current',
      description: 'semantic closure is bound to the current verification artifacts',
      passed: provenanceValidation.passed,
      severity: provenanceValidation.passed ? undefined : 'error',
      details: provenanceValidation.errors.join('; ') || undefined,
    });
  }

  try {
    const mr = await fs.readFile(path.join(ctx.workItemDir, 'merge_report.md'), 'utf-8');
    const statusMatch = mr.match(/^Status:\s*(\S+)/im);
    const mergeStatus = statusMatch ? statusMatch[1].toLowerCase() : '';
    const validMergeStatus = mergeStatus === 'success' || mergeStatus === 'not_applicable';
    checks.push({
      check_id: 'close_merge_report_valid',
      description: 'merge_report has valid Status line (success or not_applicable) (§11)',
      passed: validMergeStatus,
      severity: validMergeStatus ? undefined : 'error',
      details: `status=${mergeStatus || 'missing'}`,
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

  // Read post_merge_gate status from structured JSON report (not gate_summary.md)
  const postMergeReport = await readJson<Record<string, unknown>>(
    path.join(ctx.workItemDir, 'gates', 'post_merge_gate.json')
  );
  const pmgStatus = postMergeReport?.status;
  const pmgPassed =
    pmgStatus === 'passed' ||
    pmgStatus === 'not_applicable' ||
    pmgStatus === undefined ||
    pmgStatus === null;
  checks.push({
    check_id: 'close_post_merge_gate',
    description: 'post_merge_gate passed or not_applicable (§15.2)',
    passed: pmgPassed,
    severity: pmgPassed ? undefined : 'error',
    details: `status=${String(pmgStatus ?? 'not_present')}`,
  });

  // Aggregate blocking issues from structured gates/*.json reports
  const gateReports = await readGateReports(ctx.workItemDir);
  const blockingIssues = gateReports
    .filter(report => {
      const gateId = String(report.gate_id ?? '');
      return gateId !== 'close_gate' && gateId !== 'gate_summary_gate';
    })
    .filter(report => Array.isArray(report.blocking_issues))
    .flatMap(report =>
      (report.blocking_issues as unknown[])
        .map(issue => String(issue ?? '').trim())
        .filter(Boolean)
    );
  const hasBlocking = blockingIssues.length > 0;
  checks.push({
    check_id: 'close_no_blocking_issues',
    description: 'No unresolved blocking issues from gates/*.json (§15.2)',
    passed: !hasBlocking,
    severity: hasBlocking ? 'error' : undefined,
    details: hasBlocking ? `${blockingIssues.length} issue(s): ${blockingIssues.slice(0, 5).join('; ')}` : undefined,
  });

  const waiverAssessment = assessWaiverFollowUp(ud, gateReports);
  checks.push({
    check_id: 'close_waiver_follow_up',
    description: waiverAssessment.waiverUsed
      ? 'Waiver follow-up WI registered (§15.2)'
      : 'No waivers requiring follow-up',
    passed: waiverAssessment.passed,
    severity: waiverAssessment.passed ? undefined : 'error',
    details: waiverAssessment.details,
  });

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

  const artifactInputFiles = [...taskArtifacts, ...traceDeltaArtifacts].map(artifact =>
    path.relative(ctx.workItemDir, artifact.path).replace(/\\/g, '/'),
  );
  const inputFiles = [
    ...requiredFiles,
    ...artifactInputFiles,
    ...(formalVersionRequired ? ['gates/formal_version_gate.json'] : []),
  ];
  const report = makeReport(ctx.workItemId, 'close_gate', 'hard_gate', true, checks, inputFiles);
  return { report, allChecksPassed: report.status === 'passed' };
}
