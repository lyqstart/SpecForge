import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  HARD_STOP_RESOLUTION_SCHEMA_VERSION,
  type HardStopResolutionRecord,
} from '@specforge/types';
import { createHardStopResolutionLogSchemaDescriptor } from '@specforge/types/schema-contract';

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

export type HardStopResolutionLogEntry = HardStopResolutionRecord;

export function readHardStopResolutionLog(workItemDir: string): HardStopResolutionLogEntry[] {
  const logPath = path.join(workItemDir, 'hard_stop_resolution.jsonl');
  if (!fs.existsSync(logPath)) return [];
  try {
    const entries = fs
      .readFileSync(logPath, 'utf-8')
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as unknown);
    if (entries.length === 0) {
      throw new Error('FILE_PARSE_FAILED: JSONL file is empty');
    }
    const workItemId = path.basename(workItemDir);
    const descriptor = createHardStopResolutionLogSchemaDescriptor(workItemId);
    for (const entry of entries) {
      const observed = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).schema_version
        : undefined;
      if (observed !== HARD_STOP_RESOLUTION_SCHEMA_VERSION) {
        throw new Error('SCHEMA_VERSION_MISMATCH: unsupported hard_stop_resolution schema_version');
      }
      if (!descriptor.validateCurrent(entry)) {
        throw new Error('VALIDATION_FAILED: invalid hard_stop_resolution record');
      }
    }
    return entries as HardStopResolutionLogEntry[];
  } catch (error) {
    throw new Error(
      `HARD_STOP_RESOLUTION_LOG_INVALID: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
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
