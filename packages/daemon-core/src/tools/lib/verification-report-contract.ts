/**
 * verification-report-contract.ts
 *
 * Single typed producer/consumer contract for verification_report.
 * Invalid reports must be rejected before rendering or semantic-closure
 * generation; later gates reuse the same structural validation.
 */

export const VERIFICATION_REPORT_CONTRACT_ID = 'verification-report/v1' as const;

export const REQUIRED_TEST_MATRIX_KEYS = [
  'L1_unit',
  'L2_integration',
  'L3_pbt',
  'L4_e2e',
  'L5_smoke',
  'L6_regression',
  'L7_performance',
  'L8_security',
  'L9_compatibility',
  'L10_uat',
] as const;

export const VERIFICATION_CONCLUSIONS = ['pass', 'fail', 'blocked'] as const;
export const TEST_MATRIX_STATUSES = ['pass', 'fail', 'skip', 'not_applicable'] as const;
export const VERIFICATION_COMMAND_STATUSES = ['pass', 'fail', 'skipped'] as const;
export const ACCEPTANCE_STATUSES = ['pass', 'fail'] as const;
export const E2E_STATUSES = ['pass', 'fail', 'not_applicable'] as const;
export const CONTRACT_REVIEW_METHODS = ['manual'] as const;
export const CONTRACT_REVIEW_CONCLUSIONS = ['pass', 'fail'] as const;
const EVIDENCE_ID_PATTERN = /^[A-Z][A-Z0-9_]*-[A-Za-z0-9_.-]+$/;

export interface VerificationCommand {
  command: string;
  status: (typeof VERIFICATION_COMMAND_STATUSES)[number];
  output_summary: string;
}

export interface VerificationClaim {
  evidence?: string;
  evidence_refs?: string[];
}

export interface VerificationAcceptanceCriterion extends VerificationClaim {
  req_id: string;
  name: string;
  status: (typeof ACCEPTANCE_STATUSES)[number];
}

export interface VerificationE2ETest extends VerificationClaim {
  name: string;
  status: (typeof E2E_STATUSES)[number];
}

export interface VerificationContractReview extends VerificationClaim {
  contract_id: string;
  files: string[];
  modules: string[];
  review_method: (typeof CONTRACT_REVIEW_METHODS)[number];
  reviewer: string;
  conclusion: (typeof CONTRACT_REVIEW_CONCLUSIONS)[number];
  summary: string;
}

export interface VerificationReportContract {
  conclusion: (typeof VERIFICATION_CONCLUSIONS)[number];
  test_matrix: Record<string, (typeof TEST_MATRIX_STATUSES)[number]>;
  verification_commands: VerificationCommand[];
  acceptance_criteria: VerificationAcceptanceCriterion[];
  e2e_tests: VerificationE2ETest[];
  contract_reviews?: VerificationContractReview[];
  side_effects: string;
  summary: string;
  semantic_closure: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VerificationReportContractValidation {
  valid: boolean;
  errors: string[];
  report: VerificationReportContract | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEnum(
  errors: string[],
  path: string,
  value: unknown,
  allowed: readonly string[]
): void {
  if (!isNonEmptyString(value)) {
    errors.push(`MISSING_FIELD: ${path} must be a non-empty string`);
    return;
  }
  if (!allowed.includes(value)) {
    errors.push(`INVALID_VALUE: ${path} must be one of ${allowed.join(', ')}`);
  }
}

function validateEvidenceReference(
  errors: string[],
  path: string,
  claim: Record<string, unknown>
): void {
  if (Object.prototype.hasOwnProperty.call(claim, 'evidence_ref')) {
    errors.push(
      `FORBIDDEN_FIELD: ${path}.evidence_ref is not part of the contract; use evidence or evidence_refs`
    );
  }

  const singularValid =
    isNonEmptyString(claim.evidence) && EVIDENCE_ID_PATTERN.test(claim.evidence.trim());
  const pluralValid =
    Array.isArray(claim.evidence_refs) &&
    claim.evidence_refs.length > 0 &&
    claim.evidence_refs.every(
      reference => isNonEmptyString(reference) && EVIDENCE_ID_PATTERN.test(reference.trim())
    );
  if (!singularValid && !pluralValid) {
    errors.push(
      `INVALID_EVIDENCE_REFERENCE: ${path} must contain an Evidence ID in evidence or a non-empty evidence_refs array`
    );
  }
}

export function validateVerificationReportContract(
  value: unknown
): VerificationReportContractValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ['INVALID_STRUCTURE: verification report must be a JSON object'],
      report: null,
    };
  }

  validateEnum(errors, 'conclusion', value.conclusion, VERIFICATION_CONCLUSIONS);

  if (!isRecord(value.test_matrix)) {
    errors.push('MISSING_FIELD: test_matrix must be an object');
  } else {
    for (const key of REQUIRED_TEST_MATRIX_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(value.test_matrix, key)) {
        errors.push(`MISSING_FIELD: test_matrix.${key} is required`);
      }
    }
    for (const [key, status] of Object.entries(value.test_matrix)) {
      validateEnum(errors, `test_matrix.${key}`, status, TEST_MATRIX_STATUSES);
    }
  }

  if (!Array.isArray(value.verification_commands) || value.verification_commands.length === 0) {
    errors.push('MISSING_FIELD: verification_commands must be a non-empty array');
  } else {
    for (const [index, command] of value.verification_commands.entries()) {
      const itemPath = `verification_commands[${index}]`;
      if (!isRecord(command)) {
        errors.push(`INVALID_STRUCTURE: ${itemPath} must be an object`);
        continue;
      }
      if (!isNonEmptyString(command.command)) {
        errors.push(`MISSING_FIELD: ${itemPath}.command must be a non-empty string`);
      }
      validateEnum(errors, `${itemPath}.status`, command.status, VERIFICATION_COMMAND_STATUSES);
      if (!isNonEmptyString(command.output_summary)) {
        errors.push(`MISSING_FIELD: ${itemPath}.output_summary must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(value.acceptance_criteria) || value.acceptance_criteria.length === 0) {
    errors.push('MISSING_FIELD: acceptance_criteria must be a non-empty array');
  } else {
    for (const [index, criterion] of value.acceptance_criteria.entries()) {
      const itemPath = `acceptance_criteria[${index}]`;
      if (!isRecord(criterion)) {
        errors.push(`INVALID_STRUCTURE: ${itemPath} must be an object`);
        continue;
      }
      if (!isNonEmptyString(criterion.req_id)) {
        errors.push(`MISSING_FIELD: ${itemPath}.req_id must be a non-empty string`);
      }
      if (!isNonEmptyString(criterion.name)) {
        errors.push(`MISSING_FIELD: ${itemPath}.name must be a non-empty string`);
      }
      validateEnum(errors, `${itemPath}.status`, criterion.status, ACCEPTANCE_STATUSES);
      validateEvidenceReference(errors, itemPath, criterion);
    }
  }

  if (!Array.isArray(value.e2e_tests) || value.e2e_tests.length === 0) {
    errors.push('MISSING_FIELD: e2e_tests must be a non-empty array');
  } else {
    for (const [index, test] of value.e2e_tests.entries()) {
      const itemPath = `e2e_tests[${index}]`;
      if (!isRecord(test)) {
        errors.push(`INVALID_STRUCTURE: ${itemPath} must be an object`);
        continue;
      }
      if (!isNonEmptyString(test.name)) {
        errors.push(`MISSING_FIELD: ${itemPath}.name must be a non-empty string`);
      }
      validateEnum(errors, `${itemPath}.status`, test.status, E2E_STATUSES);
      validateEvidenceReference(errors, itemPath, test);
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'contract_reviews')) {
    if (!Array.isArray(value.contract_reviews)) {
      errors.push('INVALID_STRUCTURE: contract_reviews must be an array when provided');
    } else {
      for (const [index, review] of value.contract_reviews.entries()) {
        const itemPath = `contract_reviews[${index}]`;
        if (!isRecord(review)) {
          errors.push(`INVALID_STRUCTURE: ${itemPath} must be an object`);
          continue;
        }
        if (!isNonEmptyString(review.contract_id)) {
          errors.push(`MISSING_FIELD: ${itemPath}.contract_id must be a non-empty string`);
        }
        if (
          !Array.isArray(review.files) ||
          review.files.length === 0 ||
          !review.files.every(isNonEmptyString)
        ) {
          errors.push(`MISSING_FIELD: ${itemPath}.files must be a non-empty string array`);
        }
        if (
          !Array.isArray(review.modules) ||
          review.modules.length === 0 ||
          !review.modules.every(isNonEmptyString)
        ) {
          errors.push(`MISSING_FIELD: ${itemPath}.modules must be a non-empty string array`);
        }
        validateEnum(
          errors,
          `${itemPath}.review_method`,
          review.review_method,
          CONTRACT_REVIEW_METHODS,
        );
        if (!isNonEmptyString(review.reviewer)) {
          errors.push(`MISSING_FIELD: ${itemPath}.reviewer must be a non-empty string`);
        }
        validateEnum(
          errors,
          `${itemPath}.conclusion`,
          review.conclusion,
          CONTRACT_REVIEW_CONCLUSIONS,
        );
        if (!isNonEmptyString(review.summary)) {
          errors.push(`MISSING_FIELD: ${itemPath}.summary must be a non-empty string`);
        }
        validateEvidenceReference(errors, itemPath, review);
      }
    }
  }

  if (!isNonEmptyString(value.side_effects)) {
    errors.push('MISSING_FIELD: side_effects must be a non-empty string');
  }
  if (!isNonEmptyString(value.summary)) {
    errors.push('MISSING_FIELD: summary must be a non-empty string');
  }
  if (!isRecord(value.semantic_closure)) {
    errors.push('MISSING_FIELD: semantic_closure must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
    report: errors.length === 0 ? (value as VerificationReportContract) : null,
  };
}

export function parseVerificationReportJson(content: string): VerificationReportContractValidation {
  try {
    return validateVerificationReportContract(JSON.parse(content));
  } catch {
    return {
      valid: false,
      errors: ['INVALID_JSON: verification report content is not valid JSON'],
      report: null,
    };
  }
}

export function extractStructuredVerificationReport(
  content: string
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Markdown is the canonical on-disk representation.
  }

  const fenceRe = /```(?:json|verification_report)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(String(match[1] ?? '').trim());
      if (isRecord(parsed)) return parsed;
    } catch {
      // Keep searching later fenced blocks.
    }
  }
  return null;
}
