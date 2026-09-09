import { z } from 'zod';

import { GATE_IDS, GATE_SUMMARY_STATUSES, GATE_TYPES } from './constants.js';

export const GATE_ATTEMPT_SCHEMA_VERSION = '1.0' as const;

export const GateReportCheckSchema = z.object({
  check_id: z.string().min(1),
  description: z.string().min(1),
  passed: z.boolean(),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  details: z.string().optional(),
}).strict();

export const GateReportSchema = z.object({
  schema_version: z.literal(GATE_ATTEMPT_SCHEMA_VERSION),
  work_item_id: z.string().min(1),
  gate_id: z.enum(GATE_IDS),
  gate_type: z.enum(GATE_TYPES),
  required: z.boolean(),
  status: z.enum(['passed', 'failed', 'skipped', 'waived']),
  input_files: z.array(z.string()),
  checks: z.array(GateReportCheckSchema),
  blocking_issues: z.array(z.string()),
  warnings: z.array(z.string()),
  waiver_allowed: z.boolean(),
  waiver_required: z.boolean(),
  waiver_ids: z.array(z.string()),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  runner: z.string().min(1),
}).strict();

export const GateAttemptStartSchema = z.object({
  schema_version: z.literal(GATE_ATTEMPT_SCHEMA_VERSION),
  attempt_id: z.string().regex(/^attempt-\d{4}$/),
  work_item_id: z.string().min(1),
  source: z.literal('gate_run'),
  started_at: z.string().datetime(),
  requested_gate_ids: z.array(z.enum(GATE_IDS)),
}).strict();

export const GateAttemptInputSnapshotEntrySchema = z.object({
  path: z.string().min(1),
  exists: z.boolean(),
  kind: z.enum(['file', 'directory', 'other', 'missing']),
  sha256: z.string().min(1).optional(),
  size: z.number().nonnegative().optional(),
  mtime_ms: z.number().nonnegative().optional(),
}).strict();

export const GateAttemptInputSnapshotSchema = z.object({
  schema_version: z.literal(GATE_ATTEMPT_SCHEMA_VERSION),
  attempt_id: z.string().regex(/^attempt-\d{4}$/),
  work_item_id: z.string().min(1),
  captured_at: z.string().datetime(),
  inputs: z.array(GateAttemptInputSnapshotEntrySchema),
}).strict();

const GateAttemptResultBaseSchema = z.object({
  schema_version: z.literal(GATE_ATTEMPT_SCHEMA_VERSION),
  attempt_id: z.string().regex(/^attempt-\d{4}$/),
  work_item_id: z.string().min(1),
  source: z.literal('gate_run'),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  requested_gate_ids: z.array(z.enum(GATE_IDS)),
  current_report_gate_ids: z.array(z.enum(GATE_IDS)),
});

export const GateAttemptSuccessResultSchema = GateAttemptResultBaseSchema.extend({
  summary_report_gate_ids: z.array(z.enum(GATE_IDS)),
  summary_status: z.enum(GATE_SUMMARY_STATUSES),
  input_snapshot: z.literal('input-snapshot.json'),
}).strict();

export const GateAttemptErrorResultSchema = GateAttemptResultBaseSchema.extend({
  execution_status: z.literal('error'),
  error: z.string().min(1),
}).strict();

export const GateAttemptResultSchema = z.union([
  GateAttemptSuccessResultSchema,
  GateAttemptErrorResultSchema,
]);

export type GateReportCheck = z.infer<typeof GateReportCheckSchema>;
export type GateReport = z.infer<typeof GateReportSchema>;
export type GateAttemptStart = z.infer<typeof GateAttemptStartSchema>;
export type GateAttemptInputSnapshotEntry = z.infer<typeof GateAttemptInputSnapshotEntrySchema>;
export type GateAttemptInputSnapshot = z.infer<typeof GateAttemptInputSnapshotSchema>;
export type GateAttemptSuccessResult = z.infer<typeof GateAttemptSuccessResultSchema>;
export type GateAttemptErrorResult = z.infer<typeof GateAttemptErrorResultSchema>;
export type GateAttemptResult = z.infer<typeof GateAttemptResultSchema>;

export interface GateAttemptContractValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

function validate<T>(schema: z.ZodType<T>, value: unknown): GateAttemptContractValidationResult<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { valid: true, value: parsed.data, errors: [] };
  return {
    valid: false,
    errors: parsed.error.issues.map(issue => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'document';
      return `${field}: ${issue.message}`;
    }),
  };
}

export function validateCurrentGateReportValue(
  value: unknown,
): GateAttemptContractValidationResult<GateReport> {
  return validate(GateReportSchema, value);
}

export function validateCurrentGateAttemptStartValue(
  value: unknown,
): GateAttemptContractValidationResult<GateAttemptStart> {
  return validate(GateAttemptStartSchema, value);
}

export function validateCurrentGateAttemptInputSnapshotValue(
  value: unknown,
): GateAttemptContractValidationResult<GateAttemptInputSnapshot> {
  return validate(GateAttemptInputSnapshotSchema, value);
}

export function validateCurrentGateAttemptResultValue(
  value: unknown,
): GateAttemptContractValidationResult<GateAttemptResult> {
  return validate(GateAttemptResultSchema, value);
}
