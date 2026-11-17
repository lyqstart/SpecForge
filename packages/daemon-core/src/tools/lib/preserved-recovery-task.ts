import path from 'node:path';
import { createHash } from 'node:crypto';
import { readVerificationFile } from '../../verification/owner-store';
import { PreimplementationRecoveryRecordSchema } from './preimplementation-recovery-contract';

/** All writers and Candidate consumers share the same durable D32 Task boundary. */
export async function assertPreservedRecoveryTask(workItemDir: string, proposed?: string) {
  let raw: Buffer;
  try {
    raw = await readVerificationFile(
      path.join(workItemDir, 'preimplementation_spec_recovery.json')
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const record = PreimplementationRecoveryRecordSchema.parse(JSON.parse(raw.toString('utf8')));
  if (
    record.schema_version !== 'preimplementation-recovery/v1' ||
    record.work_item_id !== path.basename(workItemDir) ||
    !['prepared', 'applied'].includes(record.status) ||
    !/^[a-f0-9]{64}$/.test(record.proof?.task_sha256)
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_TASK_BINDING_INVALID');
  const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
  const bytes = await readVerificationFile(path.join(workItemDir, 'candidates/tasks.md'));
  if (
    hash(bytes) !== record.proof.task_sha256 ||
    (proposed !== undefined && hash(proposed) !== record.proof.task_sha256)
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_FROZEN_TASK_CHANGED');
}
