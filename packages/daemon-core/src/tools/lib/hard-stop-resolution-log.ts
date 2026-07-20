import * as fs from 'node:fs';
import * as path from 'node:path';

export type HardStopAuditResolutionType =
  | 'operator_error'
  | 'false_positive'
  | 'policy_corrected'
  | 'scope_expanded'
  | 'user_authorized_retry'
  | 'repaired'
  | 'prohibited_action_replaced'
  | 'risk_accepted'
  | 'superseded'
  | string;

export interface HardStopResolutionLogEntry {
  schema_version?: string;
  resolved_at?: string;
  work_item_id?: string;
  hard_stop_id?: string | null;
  resolution_type?: HardStopAuditResolutionType;
  user_decision_required?: boolean;
  user_response_quote?: string;
  reason?: string;
  scope?: string;
  blocked_action_disposition?: string | null;
  allowed_next_action?: string;
  last_successful_step?: string | null;
  resume_from_step?: string | null;
  retry_original_action?: boolean;
  safe_alternative_tool?: string | null;
  authoritative_state_at_resolution?: string | null;
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
    triggering_agent?: string;
    blocked_action?: string;
    blocked_target?: string;
    policy_code?: string;
    last_successful_step?: string;
    blocked_step?: string;
    resume_step?: string;
    retry_original_action?: boolean;
    safe_alternative_tool?: string;
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
    entry.blocked_action_disposition,
    entry.allowed_next_action,
    entry.last_successful_step,
    entry.resume_from_step,
    entry.safe_alternative_tool,
    entry.original_hard_stop?.hard_stop_id,
    entry.original_hard_stop?.reason,
    entry.original_hard_stop?.source_tool,
    entry.original_hard_stop?.path,
    entry.original_hard_stop?.triggering_agent,
    entry.original_hard_stop?.blocked_action,
    entry.original_hard_stop?.blocked_target,
    entry.original_hard_stop?.policy_code,
    entry.original_hard_stop?.blocked_step,
    entry.original_hard_stop?.resume_step,
    entry.original_hard_stop?.safe_alternative_tool,
  ]
    .filter(value => typeof value === 'string' && value.length > 0)
    .join('\n');
}

export function isAuditResolvingResolutionType(value: unknown): boolean {
  const type = String(value ?? '').toLowerCase();
  return (
    type === 'operator_error' ||
    type === 'false_positive' ||
    type === 'policy_corrected' ||
    type === 'scope_expanded' ||
    type === 'repaired' ||
    type === 'prohibited_action_replaced' ||
    type === 'superseded' ||
    type === 'user_authorized_retry' ||
    type === 'risk_accepted'
  );
}
