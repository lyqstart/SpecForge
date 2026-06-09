/**
 * CloseGate.ts — SpecForge v1.1 Close Gate
 *
 * Validates all conditions are met before closing a work item.
 * 10 checks with not_applicable support.
 *
 * Requirements: 7.1-7.14
 */

// ---- Types ----

export interface CloseCheck {
  name: string;
  passed: boolean;
  reason?: string | undefined;
  notApplicable?: boolean;
}

export interface CloseValidationResult {
  canClose: boolean;
  failedChecks: string[];
  checks: CloseCheck[];
}

/**
 * CloseGate — validates all close conditions.
 *
 * Requirements: 7.1-7.14
 */
export class CloseGate {
  /**
   * Validate all close conditions.
   * Requirements: 7.1-7.10
   */
  validateClose(params: {
    currentState: string;
    gatesAllPassed: boolean;
    userDecisionExists: boolean;
    mergeReportExists: boolean;
    mergeReportAllSuccess: boolean;
    specVersionIncremented: boolean;
    evidenceManifestExists?: boolean;
    verificationReportExists?: boolean;
    traceMatrixUpdated?: boolean;
    hasUnprocessedExtensionRequest: boolean;
    hasUnresolvedEscapedWriteIncident: boolean;
    notApplicableFlags?: Set<string>;
  }): CloseValidationResult {
    const checks: CloseCheck[] = [];
    const failedChecks: string[] = [];
    const naFlags = params.notApplicableFlags ?? new Set<string>();

    // Check 1: State is verification_done (Requirement 7.1)
    const check1: CloseCheck = {
      name: 'state_check',
      passed: params.currentState === 'verification_done',
      reason: params.currentState !== 'verification_done'
        ? `Expected state 'verification_done', got '${params.currentState}'`
        : undefined,
    };
    checks.push(check1);

    // Check 2: All gates passed (Requirement 7.2)
    const check2: CloseCheck = {
      name: 'gates_check',
      passed: params.gatesAllPassed,
      reason: !params.gatesAllPassed ? 'Not all gates passed' : undefined,
    };
    checks.push(check2);

    // Check 3: user_decision.json exists and valid (Requirement 7.3)
    const check3: CloseCheck = {
      name: 'user_decision_check',
      passed: params.userDecisionExists,
      reason: !params.userDecisionExists ? 'user_decision.json not found or invalid' : undefined,
    };
    checks.push(check3);

    // Check 4: merge_report.md exists and all operations successful (Requirement 7.4)
    const check4: CloseCheck = {
      name: 'merge_report_check',
      passed: params.mergeReportExists && params.mergeReportAllSuccess,
      reason: !params.mergeReportExists
        ? 'merge_report.md not found'
        : !params.mergeReportAllSuccess
          ? 'Not all merge operations succeeded'
          : undefined,
    };
    checks.push(check4);

    // Check 5: Project spec version incremented (Requirement 7.5)
    const check5: CloseCheck = {
      name: 'spec_version_check',
      passed: params.specVersionIncremented,
      reason: !params.specVersionIncremented ? 'Project spec version not incremented' : undefined,
    };
    checks.push(check5);

    // Check 6: evidence_manifest.json exists (Requirement 7.6) — can be skipped with not_applicable
    const check6NA = naFlags.has('evidence_check');
    const check6: CloseCheck = {
      name: 'evidence_check',
      passed: check6NA || (params.evidenceManifestExists ?? false),
      notApplicable: check6NA,
      reason: !check6NA && !params.evidenceManifestExists
        ? 'evidence_manifest.json not found'
        : undefined,
    };
    checks.push(check6);

    // Check 7: verification_report.md exists (Requirement 7.7) — can be skipped
    const check7NA = naFlags.has('verification_check');
    const check7: CloseCheck = {
      name: 'verification_check',
      passed: check7NA || (params.verificationReportExists ?? false),
      notApplicable: check7NA,
      reason: !check7NA && !params.verificationReportExists
        ? 'verification_report.md not found'
        : undefined,
    };
    checks.push(check7);

    // Check 8: trace_matrix.md or trace_delta.md updated (Requirement 7.8) — can be skipped
    const check8NA = naFlags.has('trace_matrix_check');
    const check8: CloseCheck = {
      name: 'trace_matrix_check',
      passed: check8NA || (params.traceMatrixUpdated ?? false),
      notApplicable: check8NA,
      reason: !check8NA && !params.traceMatrixUpdated
        ? 'trace_matrix.md or trace_delta.md not updated'
        : undefined,
    };
    checks.push(check8);

    // Check 9: No unprocessed extension_request.json (Requirement 7.9)
    const check9: CloseCheck = {
      name: 'extension_check',
      passed: !params.hasUnprocessedExtensionRequest,
      reason: params.hasUnprocessedExtensionRequest
        ? 'Unprocessed extension_request.json exists'
        : undefined,
    };
    checks.push(check9);

    // Check 10: No unresolved escaped_write_incident (Requirement 7.10)
    const check10: CloseCheck = {
      name: 'write_audit_check',
      passed: !params.hasUnresolvedEscapedWriteIncident,
      reason: params.hasUnresolvedEscapedWriteIncident
        ? 'Unresolved escaped_write_incident exists'
        : undefined,
    };
    checks.push(check10);

    // Collect failures
    for (const check of checks) {
      if (!check.passed && !check.notApplicable) {
        failedChecks.push(check.name);
      }
    }

    return {
      canClose: failedChecks.length === 0,
      failedChecks,
      checks,
    };
  }
}
