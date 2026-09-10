export const MERGE_REPORT_CONTRACT_ID = 'merge-report/v1' as const;

export type MergeReportStatus = 'pending' | 'success' | 'failed' | 'not_applicable' | 'unknown';

export interface MergeReportVerdict {
  valid: boolean;
  contract_id: string | null;
  work_item_id: string | null;
  status: MergeReportStatus;
  total_entries: number | null;
  successful: number | null;
  failed: number | null;
  reason?: string;
}

function field(text: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)\\s*(?:-\\s*)?${escaped}\\s*:\\s*([^\\r\\n]+)\\s*$`, 'im')
    .exec(text)?.[1]?.trim() ?? null;
}

function count(text: string, name: string): number | null {
  const value = field(text, name);
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

export function evaluateMergeReport(
  reportText: string,
  expectedWorkItemId?: string,
): MergeReportVerdict {
  const text = String(reportText ?? '');
  const contractId = field(text, 'Contract');
  const workItemId = field(text, 'Work Item');
  const rawStatus = field(text, 'Status')?.toLowerCase() ?? 'unknown';
  const status: MergeReportStatus = ['pending', 'success', 'failed', 'not_applicable'].includes(rawStatus)
    ? rawStatus as MergeReportStatus
    : 'unknown';
  const totalEntries = count(text, 'Total entries');
  const successful = count(text, 'Successful');
  const failed = count(text, 'Failed');

  let reason: string | undefined;
  if (contractId !== MERGE_REPORT_CONTRACT_ID) reason = `merge_report Contract must be ${MERGE_REPORT_CONTRACT_ID}`;
  else if (!workItemId) reason = 'merge_report Work Item is missing';
  else if (expectedWorkItemId && workItemId !== expectedWorkItemId) reason = `merge_report Work Item mismatch: expected ${expectedWorkItemId}, got ${workItemId}`;
  else if (status === 'unknown') reason = 'merge_report Status is invalid';
  else if (totalEntries === null || successful === null || failed === null) reason = 'merge_report summary counts are missing';
  else if (totalEntries !== successful + failed) reason = 'merge_report summary counts are inconsistent';
  else if (status === 'success' && (successful ?? 0) <= 0) reason = 'merge_report success has no successful entries';
  else if (status === 'success' && (failed ?? 0) !== 0) reason = 'merge_report success contains failed entries';
  else if (status === 'not_applicable' && ((totalEntries ?? 0) !== 0 || (successful ?? 0) !== 0 || (failed ?? 0) !== 0)) reason = 'merge_report not_applicable must have zero entries';

  return {
    valid: reason === undefined,
    contract_id: contractId,
    work_item_id: workItemId,
    status,
    total_entries: totalEntries,
    successful,
    failed,
    reason,
  };
}
