import { z } from 'zod';
import { RequiredVerificationSourceSchema } from '@specforge/types/required-verification-contract';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z
  .object({
    sha256,
    size: z
      .number()
      .int()
      .nonnegative()
      .max(16 * 1024 * 1024),
  })
  .strict();
const plan = z
  .object({ before: z.string().max(16 * 1024 * 1024), after: z.string().max(16 * 1024 * 1024) })
  .strict();
export const PreimplementationRecoveryProofSchema = z
  .object({
    schema_version: z.literal('preimplementation-recovery/v1'),
    work_item_id: z.string().regex(/^WI-\d{4,}$/),
    blocked_event_id: z.string().min(1),
    blocked_at: z.number().int().nonnegative(),
    history_sha256: sha256,
    state_history: z.array(z.unknown()).min(1).max(20000),
    project_spec_version: z.string().regex(/^PSV-\d{4,}$/),
    spec_sha256: sha256,
    baseline_id: z.string().min(1),
    task_sha256: sha256,
    invalidity: z.array(z.string().min(1)).min(1),
    inputs: z.record(z.string().min(1), bytes).refine(value => {
      const entries = Object.values(value);
      return (
        entries.length > 0 &&
        entries.length <= 4096 &&
        entries.reduce((sum, entry) => sum + entry.size, 0) <= 128 * 1024 * 1024
      );
    }, 'PREIMPLEMENTATION_RECOVERY_INPUT_BUDGET'),
    binding_sha256: sha256,
  })
  .strict();
export const PreimplementationRecoveryRecordSchema = z
  .object({
    schema_version: z.literal('preimplementation-recovery/v1'),
    status: z.enum(['prepared', 'applied']),
    work_item_id: z.string().regex(/^WI-\d{4,}$/),
    proof: PreimplementationRecoveryProofSchema,
    archive: z.string().regex(/^recovery_generations\/preimplementation-[a-f0-9-]+$/),
    archive_manifest_sha256: sha256,
    decision: plan,
    manifest: plan,
    source: z
      .unknown()
      .refine(
        value => RequiredVerificationSourceSchema.safeParse(value).success,
        'PREIMPLEMENTATION_RECOVERY_SOURCE_INVALID'
      ),
    authorization_line: z.string().min(1).max(1024),
  })
  .strict();
export type PreimplementationRecoveryProof = z.infer<typeof PreimplementationRecoveryProofSchema>;
export type PreimplementationRecoveryRecord = z.infer<typeof PreimplementationRecoveryRecordSchema>;
