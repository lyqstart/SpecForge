import { z } from 'zod';

export const USER_DECISION_SCHEMA_VERSION = '1.0' as const;

export const USER_DECISION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'request_changes',
  'waived',
  'expired',
  'invalidated',
] as const;

export type UserDecisionStatus = (typeof USER_DECISION_STATUSES)[number];

export const USER_DECISION_TYPES = [
  'auto_approved',
  'user_approved',
  'waived',
  'rejected',
] as const;

export type UserDecisionType = (typeof USER_DECISION_TYPES)[number];

export const UserDecisionWaiverSchema = z.object({
  waiver_id: z.string().min(1),
  gate_id: z.string().min(1),
  reason: z.string().min(1),
  risk: z.string().min(1),
  expires_at: z.string().datetime().optional(),
  follow_up_wi: z.string().min(1).optional(),
}).strict();

export const UserDecisionSchema = z.object({
  schema_version: z.literal(USER_DECISION_SCHEMA_VERSION),
  decision_id: z.string().min(1),
  work_item_id: z.string().min(1),
  workflow_path: z.string().min(1),
  base_spec_version: z.string().min(1),
  candidate_manifest_path: z.string().min(1),
  manifest_hash: z.string().min(1),
  candidate_hash: z.string().min(1),
  gate_summary_path: z.string().min(1),
  gate_summary_hash: z.string().min(1),
  decision_status: z.enum(USER_DECISION_STATUSES),
  decision_type: z.enum(USER_DECISION_TYPES),
  decided_by: z.string().min(1),
  decided_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  decision_scope: z.string().min(1),
  waivers: z.array(UserDecisionWaiverSchema),
  recorded_by: z.string().min(1).optional(),
  recorder_role: z.literal('user_decision_recorder').optional(),
  recorded_at: z.string().datetime().optional(),
  user_response_quote: z.string().min(1).optional(),
  auto_approval_policy_id: z.string().min(1).optional(),
  previous_decision_status: z.enum(USER_DECISION_STATUSES).optional(),
  invalidated_at: z.string().datetime().optional(),
  invalidation_reason: z.string().min(1).optional(),
}).strict();

export type UserDecision = z.infer<typeof UserDecisionSchema>;

export interface UserDecisionValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCurrentUserDecisionValue(
  value: unknown,
  expectedWorkItemId?: string,
): UserDecisionValidationResult {
  const parsed = UserDecisionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(issue => {
        const field = issue.path.length > 0 ? issue.path.join('.') : 'user_decision';
        return `${field}: ${issue.message}`;
      }),
    };
  }
  if (expectedWorkItemId && parsed.data.work_item_id !== expectedWorkItemId) {
    return {
      valid: false,
      errors: [`work_item_id: expected ${expectedWorkItemId}, got ${parsed.data.work_item_id}`],
    };
  }
  return { valid: true, errors: [] };
}

export function validateCurrentUserDecisionJson(
  content: string,
  expectedWorkItemId?: string,
): UserDecisionValidationResult {
  try {
    return validateCurrentUserDecisionValue(JSON.parse(content), expectedWorkItemId);
  } catch {
    return { valid: false, errors: ['user_decision: invalid JSON'] };
  }
}
