import { z } from 'zod';

export const HARD_STOP_SCHEMA_VERSION = '1.2' as const;
export const HARD_STOP_RESOLUTION_SCHEMA_VERSION = '1.3.0' as const;

export const HardStopScopeSchema = z.enum(['work_item', 'project']);

export const HardStopRecordSchema = z.object({
  schema_version: z.literal(HARD_STOP_SCHEMA_VERSION),
  hard_stop_id: z.string().min(1),
  scope: HardStopScopeSchema,
  work_item_id: z.string().min(1),
  blocked: z.literal(true),
  reason: z.string().min(1),
  source_tool: z.string().min(1),
  created_at: z.string().min(1),
  resolved: z.literal(false),
  recovery_status: z.literal('pending'),
  triggering_agent: z.string().min(1).optional(),
  blocked_action: z.string().min(1).optional(),
  blocked_target: z.string().min(1).optional(),
  policy_code: z.string().min(1).optional(),
  last_successful_step: z.string().min(1).optional(),
  blocked_step: z.string().min(1).optional(),
  resume_step: z.string().min(1).optional(),
  retry_original_action: z.boolean().optional(),
  safe_alternative_tool: z.string().min(1).optional(),
}).strict();

const HardStopResolutionTypeSchema = z.enum([
  'operator_error',
  'false_positive',
  'policy_corrected',
  'scope_expanded',
  'user_authorized_retry',
  'repaired',
  'prohibited_action_replaced',
  'risk_accepted',
  'superseded',
]);

const OriginalHardStopRecordSchema = HardStopRecordSchema.extend({
  path: z.string().min(1).optional(),
}).strict();

export const HardStopResolutionRecordSchema = z.object({
  schema_version: z.literal(HARD_STOP_RESOLUTION_SCHEMA_VERSION),
  resolved_at: z.string().min(1),
  work_item_id: z.string().min(1),
  hard_stop_id: z.string().min(1),
  resolution_type: HardStopResolutionTypeSchema,
  user_decision_required: z.boolean(),
  user_response_quote: z.string().min(1).optional(),
  reason: z.string(),
  scope: HardStopScopeSchema,
  blocked_action_disposition: z.enum([
    'abandon',
    'retry_after_repair',
    'retry_after_authorization',
    'supersede',
  ]).nullable(),
  allowed_next_action: z.string(),
  last_successful_step: z.string().nullable(),
  resume_from_step: z.string().nullable(),
  retry_original_action: z.boolean(),
  safe_alternative_tool: z.string().nullable(),
  authoritative_state_at_resolution: z.string().nullable(),
  evidence: z.array(z.unknown()),
  resolved_by: z.string().min(1),
  decision_source: z.enum([
    'sf-orchestrator_user_context',
    'sf-orchestrator_system_safe_recovery',
  ]),
  original_hard_stop: OriginalHardStopRecordSchema,
}).strict();

export type HardStopScope = z.infer<typeof HardStopScopeSchema>;
export type HardStopRecord = z.infer<typeof HardStopRecordSchema>;
export type HardStopResolutionRecord = z.infer<typeof HardStopResolutionRecordSchema>;

export interface HardStopContractValidationResult<T> {
  valid: boolean;
  errors: string[];
  value?: T;
}

function validate<T>(schema: z.ZodType<T>, value: unknown): HardStopContractValidationResult<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { valid: true, errors: [], value: parsed.data };
  return {
    valid: false,
    errors: parsed.error.issues.map(issue => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'hard_stop';
      return `${field}: ${issue.message}`;
    }),
  };
}

export function validateCurrentHardStopRecordValue(
  value: unknown,
): HardStopContractValidationResult<HardStopRecord> {
  return validate(HardStopRecordSchema, value);
}

export function validateCurrentHardStopResolutionRecordValue(
  value: unknown,
): HardStopContractValidationResult<HardStopResolutionRecord> {
  return validate(HardStopResolutionRecordSchema, value);
}
