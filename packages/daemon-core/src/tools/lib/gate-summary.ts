/**
 * gate-summary.ts — §9.5 Gate Summary types and Markdown generation
 *
 * Extracted from gate-runner-v11.ts (TASK-3).
 *
 * Re-exports: nothing (leaf module).
 * Consumers: gate-chain.ts, gate-runner-v11.ts (re-export).
 */

import type { GateReportV11 } from './gate-report.js';

// ---------------------------------------------------------------------------
// §9.5 Gate Summary
// ---------------------------------------------------------------------------

export type GateSummaryStatus =
  | 'passed'
  | 'passed_with_waiver_required'
  | 'failed'
  | 'blocked'
  | 'expired'
  | 'invalidated';

// ---------------------------------------------------------------------------
// Gate Summary Markdown 生成（§9.5）
// ---------------------------------------------------------------------------

export function generateGateSummaryMd(
  workItemId: string,
  reports: GateReportV11[],
  overallStatus: GateSummaryStatus,
): string {
  const lines: string[] = [
    `# Gate Summary`,
    '',
    `Work Item: ${workItemId}`,
    `Overall Status: ${overallStatus}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Gate Reports',
    '',
  ];

  for (const report of reports) {
    lines.push(`### ${report.gate_id}`);
    lines.push(`- Type: ${report.gate_type}`);
    lines.push(`- Status: ${report.status}`);
    lines.push(`- Required: ${report.required}`);
    if (report.blocking_issues.length > 0) {
      lines.push(`- Blocking Issues:`);
      for (const issue of report.blocking_issues) {
        lines.push(`  - ${issue}`);
      }
    }
    if (report.warnings.length > 0) {
      lines.push(`- Warnings:`);
      for (const w of report.warnings) {
        lines.push(`  - ${w}`);
      }
    }
    lines.push('');
  }

  lines.push('## User Decision Required');
  lines.push('');
  if (overallStatus === 'passed') {
    lines.push('All gates passed. User may approve to proceed to merge.');
  } else if (overallStatus === 'passed_with_waiver_required') {
    lines.push('Some soft gates failed with warnings. User may approve with waiver.');
  } else {
    lines.push('Some hard gates failed. User cannot approve until issues are resolved.');
  }

  return lines.join('\n');
}
