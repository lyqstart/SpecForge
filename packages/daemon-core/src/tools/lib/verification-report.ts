/**
 * verification-report — §13.3 Verification Report types and validation
 *
 * Extracted from verification-evidence-v11.ts (TASK-6).
 */

import { TraceValidationResult } from './evidence.js';

export interface VerificationReport {
  /** WI ID */
  work_item_id: string;
  /** 验证结论 */
  conclusion: 'pass' | 'fail' | 'partial' | 'blocked';
  /** 验证命令 */
  verification_commands: Array<{
    command: string;
    exit_code: number | null;
    output: string;
    passed: boolean;
  }>;
  /** 验收标准覆盖 */
  acceptance_criteria_covered: string[];
  /** Evidence 引用 */
  evidence_refs: string[];
  /** 已知缺口 */
  gaps: string[];
  /** 总结（不得只写"已验证"） */
  summary: string;
}

/**
 * 校验 verification_report.md 内容。
 * §13.3: 不得只写"已验证"，必须引用 Evidence。
 */
export function validateVerificationReport(content: string): TraceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ['verification_report.md must not be empty (§13.3)'], warnings };
  }

  const lower = content.toLowerCase();

  // §13.3: Must not just say "已验证" / "verified"
  const trimmed = content.trim();
  const forbiddenSummaries = [
    '已验证', 'verified', 'verified.', 'all pass', '全部通过', 'pass',
  ];
  if (forbiddenSummaries.some(s => trimmed.toLowerCase() === s)) {
    errors.push('verification_report.md must not contain only "已验证/verified". Must reference Evidence (§13.3)');
  }

  // Must have evidence references
  if (!lower.includes('evidence') && !lower.includes('证据')) {
    warnings.push('verification_report.md should reference Evidence (§13.3)');
  }

  // Must have verification commands or verification method
  if (!lower.includes('command') && !lower.includes('test') && !lower.includes('验证') && !lower.includes('检查')) {
    warnings.push('verification_report.md should describe verification method (§13.3)');
  }

  return { valid: errors.length === 0, errors, warnings };
}
