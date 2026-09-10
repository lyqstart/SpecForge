import { z } from 'zod';

export const WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION = '1.2.8' as const;

export const WriteGuardAuthorizationScopeSchema = z.enum([
  'command',
  'task',
  'work_item',
  'project',
]);

export const WriteGuardAuthorizationTypeSchema = z.enum([
  'user_accepted_external_ops',
  'user_authorized_retry',
  'false_positive_pattern',
  'expected_negative_test',
]);

export const WriteGuardAuthorizationRecordSchema = z.object({
  schema_version: z.literal(WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION),
  authorization_id: z.string().min(1),
  created_at: z.string().min(1),
  created_by: z.string().min(1),
  source_hard_stop_id: z.string().min(1),
  work_item_id: z.string().min(1),
  authorization_type: WriteGuardAuthorizationTypeSchema,
  scope: WriteGuardAuthorizationScopeSchema,
  tool: z.literal('sf_safe_bash'),
  intent: z.string().min(1).optional(),
  command_family: z.string().min(1).optional(),
  host_path_prefix: z.string().min(1).optional(),
  container_targets: z.array(z.string().min(1)).min(1).optional(),
  image: z.string().min(1).optional(),
  allowed_pattern: z.record(z.unknown()).optional(),
  expires_when: z.string().min(1),
  max_uses: z.number().int().positive().optional(),
  user_response_quote: z.string().min(8),
  reason: z.string().min(8),
}).strict();

export type WriteGuardAuthorizationScope = z.infer<typeof WriteGuardAuthorizationScopeSchema>;
export type WriteGuardAuthorizationType = z.infer<typeof WriteGuardAuthorizationTypeSchema>;
export type WriteGuardAuthorizationRecord = z.infer<typeof WriteGuardAuthorizationRecordSchema>;

export function validateCurrentWriteGuardAuthorizationRecordValue(value: unknown): {
  valid: boolean;
  errors: string[];
  value?: WriteGuardAuthorizationRecord;
} {
  const parsed = WriteGuardAuthorizationRecordSchema.safeParse(value);
  if (parsed.success) return { valid: true, errors: [], value: parsed.data };
  return {
    valid: false,
    errors: parsed.error.issues.map(issue => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'write_guard_authorization';
      return `${field}: ${issue.message}`;
    }),
  };
}
