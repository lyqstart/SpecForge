/**
 * verification-governance-contract.ts
 *
 * Deterministic §13.5 verification checks shared by verification_gate tests and
 * the active v1.1 gate runner. This is the enforcement bridge between verifier
 * output, Evidence Manifest, Semantic Closure, and state advancement.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GateReportCheck } from './gate-report.js';
import {
  validateSemanticClosure,
  type SemanticClosureManifest,
  type SemanticEvidence,
} from './semantic-closure-core.js';
import { validateSemanticClosureProvenance } from './semantic-closure-provenance.js';
import { evaluateChangedFilesAuditVerdict } from './changed-files-audit-verdict.js';
import {
  extractStructuredVerificationReport,
  validateVerificationReportContract,
  VERIFICATION_REPORT_CONTRACT_ID,
} from './verification-report-contract.js';

export { extractStructuredVerificationReport } from './verification-report-contract.js';

const PASS_STATUSES = new Set(['pass', 'passed', 'success', 'succeeded']);
const NON_BLOCKING_TEST_STATUSES = new Set([
  ...PASS_STATUSES,
  'skip',
  'skipped',
  'not_applicable',
  'not-applicable',
]);

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function verificationExecutionStatuses(report: Record<string, any> | null): string[] {
  if (!report) return [];
  const commandStatuses = Array.isArray(report.verification_commands)
    ? report.verification_commands
        .filter(isRecord)
        .map(command => normalize(command.status))
        .filter(Boolean)
    : [];
  const matrixStatuses = isRecord(report.test_matrix)
    ? Object.values(report.test_matrix).map(normalize).filter(Boolean)
    : [];
  return [...commandStatuses, ...matrixStatuses];
}

function reportClaims(
  report: Record<string, any> | null,
  field: 'acceptance_criteria' | 'e2e_tests' | 'contract_reviews'
): Record<string, any>[] {
  return Array.isArray(report?.[field]) ? report[field].filter(isRecord) : [];
}

function evidenceEntries(manifest: Record<string, any> | null): Record<string, any>[] {
  if (!manifest) return [];
  if (Array.isArray(manifest.entries)) return manifest.entries.filter(isRecord);
  if (Array.isArray(manifest.evidence)) return manifest.evidence.filter(isRecord);
  return [];
}

function evidenceId(value: Record<string, any>): string {
  return String(value.id ?? value.evidence_id ?? '').trim();
}

function refs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
    : [];
}

function evidenceTargets(value: Record<string, any> | SemanticEvidence): Set<string> {
  return new Set([
    ...refs(value.supports),
    ...refs(value.outcome_refs),
    ...refs(value.requirement_refs),
    ...refs(value.design_refs),
    ...refs(value.task_refs),
  ]);
}

function evidenceManifestAlignment(
  semanticManifest: SemanticClosureManifest | null,
  manifest: Record<string, any> | null
): string[] {
  const errors: string[] = [];
  const entries = evidenceEntries(manifest);
  const byId = new Map(entries.map(entry => [evidenceId(entry), entry]));
  for (const semanticEvidence of Array.isArray(semanticManifest?.evidence)
    ? semanticManifest.evidence
    : []) {
    const entry = byId.get(semanticEvidence.id);
    if (!entry) {
      errors.push(`${semanticEvidence.id} is absent from evidence_manifest entries.`);
      continue;
    }
    if (!PASS_STATUSES.has(normalize(entry.status ?? entry.result))) {
      errors.push(`${semanticEvidence.id} is not passed in evidence_manifest.`);
    }

    const manifestLevel = normalize(entry.level ?? entry.evidence_level);
    const semanticLevel = normalize(semanticEvidence.level);
    if (!manifestLevel || manifestLevel !== semanticLevel) {
      errors.push(`${semanticEvidence.id} level differs from evidence_manifest.`);
    }

    const manifestType = normalize(entry.evidence_type ?? entry.type);
    const semanticType = normalize(semanticEvidence.evidence_type);
    if (!manifestType || manifestType !== semanticType) {
      errors.push(`${semanticEvidence.id} type differs from evidence_manifest.`);
    }

    const declaredTargets = evidenceTargets(entry);
    for (const target of evidenceTargets(semanticEvidence)) {
      if (!declaredTargets.has(target)) {
        errors.push(
          `${semanticEvidence.id} claims target ${target} that evidence_manifest does not declare.`
        );
      }
    }
  }
  return errors;
}

function reportEvidenceAlignment(
  report: Record<string, any> | null,
  manifest: Record<string, any> | null
): string[] {
  const errors: string[] = [];
  const manifestIds = new Set(evidenceEntries(manifest).map(evidenceId).filter(Boolean));
  const claims = [
    ...reportClaims(report, 'acceptance_criteria').map((claim, index) => ({
      label: `acceptance_criteria[${index}]`,
      claim,
    })),
    ...reportClaims(report, 'e2e_tests').map((claim, index) => ({
      label: `e2e_tests[${index}]`,
      claim,
    })),
    ...reportClaims(report, 'contract_reviews').map((claim, index) => ({
      label: `contract_reviews[${index}]`,
      claim,
    })),
  ];

  for (const { label, claim } of claims) {
    const declaredRefs = new Set([
      ...refs(claim.evidence_refs),
      ...refs(claim.evidence),
      ...(typeof claim.evidence === 'string'
        ? [...manifestIds].filter(id => claim.evidence.includes(id))
        : []),
    ]);
    if (declaredRefs.size === 0) {
      errors.push(`${label} has no registered Evidence reference.`);
      continue;
    }
    for (const ref of declaredRefs) {
      if (!manifestIds.has(ref)) {
        errors.push(`${label} references unknown Evidence ${ref}.`);
      }
    }
  }
  return errors;
}

export async function evaluateVerificationGovernanceContract(input: {
  workItemDir: string;
  workflowType?: string;
}): Promise<{ checks: GateReportCheck[]; inputFiles: string[] }> {
  const reportPath = path.join(input.workItemDir, 'verification_report.md');
  const evidencePath = path.join(input.workItemDir, 'evidence', 'evidence_manifest.json');
  const auditPath = path.join(input.workItemDir, 'changed_files_audit.md');
  const closurePath = path.join(input.workItemDir, '.semantic_closure.json');
  const reportText = await readText(reportPath);
  const structuredReport = reportText ? extractStructuredVerificationReport(reportText) : null;
  const evidenceManifest = await readJson<Record<string, any>>(evidencePath);
  const auditText = await readText(auditPath);
  const contractWorkflow = input.workflowType === 'contract_change';
  const semanticManifest = contractWorkflow
    ? null
    : await readJson<SemanticClosureManifest>(closurePath);

  const checks: GateReportCheck[] = [];
  const reportContract = validateVerificationReportContract(structuredReport);
  const conclusion = normalize(structuredReport?.conclusion);
  checks.push({
    check_id: 'verification_report_contract_valid',
    description: `verification_report satisfies the shared ${VERIFICATION_REPORT_CONTRACT_ID} contract`,
    passed: reportContract.valid,
    severity: reportContract.valid ? undefined : 'error',
    details: reportContract.errors.join('; ') || undefined,
  });
  checks.push({
    check_id: 'verification_report_conclusion_pass',
    description: 'verification_report conclusion is pass',
    passed: conclusion === 'pass',
    severity: conclusion === 'pass' ? undefined : 'error',
    details: conclusion || 'missing',
  });

  const testStatuses = verificationExecutionStatuses(structuredReport);
  const testsComplete =
    testStatuses.length > 0 && testStatuses.every(status => NON_BLOCKING_TEST_STATUSES.has(status));
  checks.push({
    check_id: 'verification_required_tests_complete',
    description: 'required tests were executed or explicitly marked not_applicable',
    passed: testsComplete,
    severity: testsComplete ? undefined : 'error',
    details:
      testStatuses.length > 0 ? `statuses=${testStatuses.join(',')}` : 'no structured test status',
  });

  const acceptanceStatuses = reportClaims(structuredReport, 'acceptance_criteria').map(claim =>
    normalize(claim.status)
  );
  const acceptancePassed =
    acceptanceStatuses.length > 0 && acceptanceStatuses.every(status => PASS_STATUSES.has(status));
  checks.push({
    check_id: 'verification_acceptance_criteria_passed',
    description: 'acceptance criteria are present and passed',
    passed: acceptancePassed,
    severity: acceptancePassed ? undefined : 'error',
    details:
      acceptanceStatuses.length > 0
        ? `statuses=${acceptanceStatuses.join(',')}`
        : 'no structured acceptance criteria',
  });

  const e2eStatuses = reportClaims(structuredReport, 'e2e_tests').map(claim =>
    normalize(claim.status)
  );
  const e2eComplete =
    e2eStatuses.length > 0 && e2eStatuses.every(status => NON_BLOCKING_TEST_STATUSES.has(status));
  checks.push({
    check_id: 'verification_e2e_complete',
    description: 'end-to-end verification passed or is explicitly not_applicable',
    passed: e2eComplete,
    severity: e2eComplete ? undefined : 'error',
    details:
      e2eStatuses.length > 0
        ? `statuses=${e2eStatuses.join(',')}`
        : 'no structured end-to-end status',
  });

  const entries = evidenceEntries(evidenceManifest);
  checks.push({
    check_id: 'verification_evidence_manifest_nonempty',
    description: 'evidence_manifest exists and has registered entries',
    passed: entries.length > 0,
    severity: entries.length > 0 ? undefined : 'error',
  });

  const reportAlignmentErrors = reportEvidenceAlignment(structuredReport, evidenceManifest);
  checks.push({
    check_id: 'verification_report_claims_have_registered_evidence',
    description: 'acceptance and end-to-end claims reference registered Evidence',
    passed: reportAlignmentErrors.length === 0,
    severity: reportAlignmentErrors.length === 0 ? undefined : 'error',
    details: reportAlignmentErrors.join('; ') || undefined,
  });

  const sideEffectsDeclared =
    typeof structuredReport?.side_effects === 'string' &&
    structuredReport.side_effects.trim().length > 0;
  checks.push({
    check_id: 'verification_side_effects_declared',
    description: 'verification side effects are explicitly declared',
    passed: sideEffectsDeclared,
    severity: sideEffectsDeclared ? undefined : 'error',
  });

  const auditVerdict = evaluateChangedFilesAuditVerdict(auditText ?? '');
  checks.push({
    check_id: 'verification_changed_files_audit_passed',
    description: 'changed_files_audit is complete and passed',
    passed: auditVerdict.passed,
    severity: auditVerdict.passed ? undefined : 'error',
    details: auditVerdict.reason,
  });

  if (!contractWorkflow) {
    const semanticValidation = validateSemanticClosure(semanticManifest);
    checks.push({
      check_id: 'verification_semantic_closure_valid',
      description: 'semantic closure proves the user outcome to evidence chain',
      passed: semanticValidation.passed,
      severity: semanticValidation.passed ? undefined : 'error',
      details: semanticValidation.errors.map(issue => issue.check_id).join(', ') || undefined,
    });

    const provenanceValidation = await validateSemanticClosureProvenance(
      input.workItemDir,
      semanticManifest
    );
    checks.push({
      check_id: 'verification_semantic_closure_provenance_current',
      description: 'semantic closure is bound to the current verification artifacts',
      passed: provenanceValidation.passed,
      severity: provenanceValidation.passed ? undefined : 'error',
      details: provenanceValidation.errors.join('; ') || undefined,
    });

    const alignmentErrors = evidenceManifestAlignment(semanticManifest, evidenceManifest);
    checks.push({
      check_id: 'verification_claims_match_evidence_manifest',
      description: 'semantic evidence claims match registered Evidence Manifest entries',
      passed: alignmentErrors.length === 0,
      severity: alignmentErrors.length === 0 ? undefined : 'error',
      details: alignmentErrors.join('; ') || undefined,
    });
  }

  return {
    checks,
    inputFiles: [reportPath, evidencePath, auditPath, ...(contractWorkflow ? [] : [closurePath])],
  };
}
