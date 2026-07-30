/**
 * verification-report.ts — §13.3 Verification Report types and validation
 *
 * @deprecated Use verification-report-contract.ts instead.
 * This module is kept for backward compatibility with consumers that
 * validate Markdown text. New consumers MUST use
 * `validateVerificationReportContract` from verification-report-contract.ts.
 *
 * The canonical producer/consumer contract lives in verification-report-contract.ts
 * and validates structured JSON, not loose Markdown text.
 */

import type { TraceValidationResult } from './evidence.js';
import {
  validateVerificationReportContract,
  extractStructuredVerificationReport,
} from './verification-report-contract.js';

/**
 * @deprecated Use validateVerificationReportContract from verification-report-contract.ts.
 *
 * Legacy validator that accepts Markdown text. It now delegates to the
 * canonical contract validator by extracting structured JSON from the
 * content. If no structured JSON is found, it falls back to basic
 * non-empty checks for backward compatibility with very old reports.
 */
export function validateVerificationReport(content: string): TraceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['verification_report.md must not be empty (§13.3)'], warnings };
  }

  // Try canonical structured validation first
  const structured = extractStructuredVerificationReport(content);
  if (structured) {
    const contractResult = validateVerificationReportContract(structured);
    if (!contractResult.valid) {
      return {
        valid: false,
        errors: contractResult.errors,
        warnings: [
          'verification_report validated via canonical contract; ' +
            'consider migrating to validateVerificationReportContract directly',
        ],
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: [
        'verification_report validated via canonical contract; ' +
          'consider migrating to validateVerificationReportContract directly',
      ],
    };
  }

  // Fallback for legacy Markdown-only reports without fenced JSON
  const lower = content.toLowerCase();
  const trimmed = content.trim();
  const forbiddenSummaries = [
    '已验证', 'verified', 'verified.', 'all pass', '全部通过', 'pass',
  ];
  if (forbiddenSummaries.some(s => trimmed.toLowerCase() === s)) {
    errors.push('verification_report.md must not contain only "已验证/verified". Must reference Evidence (§13.3)');
  }

  if (!lower.includes('evidence') && !lower.includes('证据')) {
    warnings.push('verification_report.md should reference Evidence (§13.3)');
  }

  if (!lower.includes('command') && !lower.includes('test') && !lower.includes('验证') && !lower.includes('检查')) {
    warnings.push('verification_report.md should describe verification method (§13.3)');
  }

  warnings.push('verification_report does not contain structured JSON; using legacy fallback validation');

  return { valid: errors.length === 0, errors, warnings };
}
