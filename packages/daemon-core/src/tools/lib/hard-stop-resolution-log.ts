import * as fs from 'node:fs';
import * as path from 'node:path';

export type HardStopAuditResolutionType =
  | 'false_positive'
  | 'scope_expanded'
  | 'user_authorized_retry'
  | 'repaired'
  | 'risk_accepted'
  | 'superseded'
  | string;

export interface HardStopResolutionLogEntry {
  schema_version?: string;
  resolved_at?: string;
  work_item_id?: string;
  hard_stop_id?: string | null;
  resolution_type?: HardStopAuditResolutionType;
  user_response_quote?: string;
  reason?: string;
  scope?: string;
  allowed_next_action?: string;
  evidence?: unknown[];
  resolved_by?: string;
  decision_source?: string;
  original_hard_stop?: {
    hard_stop_id?: string | null;
    work_item_id?: string;
    reason?: string;
    source_tool?: string;
    blocked?: boolean;
    path?: string;
  };
}

export function readHardStopResolutionLog(workItemDir: string): HardStopResolutionLogEntry[] {
  const logPath = path.join(workItemDir, 'hard_stop_resolution.jsonl');
  try {
    if (!fs.existsSync(logPath)) return [];
    return fs
      .readFileSync(logPath, 'utf-8')
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as HardStopResolutionLogEntry);
  } catch {
    return [];
  }
}

export function resolutionText(entry: HardStopResolutionLogEntry): string {
  return [
    entry.hard_stop_id,
    entry.resolution_type,
    entry.reason,
    entry.user_response_quote,
    entry.allowed_next_action,
    entry.original_hard_stop?.hard_stop_id,
    entry.original_hard_stop?.reason,
    entry.original_hard_stop?.source_tool,
    entry.original_hard_stop?.path,
  ]
    .filter(value => typeof value === 'string' && value.length > 0)
    .join('\n');
}

export function isAuditResolvingResolutionType(value: unknown): boolean {
  const type = String(value ?? '').toLowerCase();
  return (
    type === 'false_positive' ||
    type === 'scope_expanded' ||
    type === 'repaired' ||
    type === 'superseded' ||
    type === 'user_authorized_retry' ||
    type === 'risk_accepted'
  );
}
