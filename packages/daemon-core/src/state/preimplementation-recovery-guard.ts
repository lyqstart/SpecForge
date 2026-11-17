import path from 'node:path';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { canonicalVerificationJson, readVerificationFile } from '../verification/owner-store';
import { PreimplementationRecoveryRecordSchema } from '../tools/lib/preimplementation-recovery-contract';
import { RequiredVerificationSourceSchema } from '@specforge/types/required-verification-contract';

/** WAL commit boundary: caller strings are insufficient without the prepared owner transaction. */
export async function assertPreimplementationRecoveryCommit(
  projectRoot: string,
  workItemId: string,
  binding: Record<string, unknown>
) {
  const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
  const wi = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
  const record = PreimplementationRecoveryRecordSchema.parse(
    JSON.parse(
      (await readVerificationFile(path.join(wi, 'preimplementation_spec_recovery.json'))).toString(
        'utf8'
      )
    )
  );
  if (
    record.schema_version !== 'preimplementation-recovery/v1' ||
    record.status !== 'prepared' ||
    record.work_item_id !== workItemId ||
    record.proof?.blocked_event_id !== binding.blocked_event_id ||
    record.proof?.binding_sha256 !== binding.binding_sha256 ||
    record.archive_manifest_sha256 !== binding.archive_manifest_sha256 ||
    !/^recovery_generations\/preimplementation-[a-f0-9-]+$/.test(record.archive)
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_PREPARED_TRANSACTION_REQUIRED');
  const { binding_sha256: proofHash, ...proofBody } = record.proof;
  if (hash(canonicalVerificationJson(proofBody)) !== proofHash)
    throw new Error('PREIMPLEMENTATION_RECOVERY_PROOF_CHANGED');
  const archive = path.join(wi, record.archive);
  const manifest = await readVerificationFile(path.join(archive, 'manifest.json'));
  if (
    hash(manifest) !== record.archive_manifest_sha256 ||
    canonicalVerificationJson(JSON.parse(manifest.toString('utf8'))) !==
      canonicalVerificationJson(record.proof)
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_ARCHIVE_CHANGED');
  const source = RequiredVerificationSourceSchema.parse(record.source);
  if (
    source?.source !== 'required-verification-source/v1' ||
    source.agent !== 'sf-orchestrator' ||
    source.tool !== 'sf_state_transition' ||
    source.userCreatedAt < record.proof.blocked_at ||
    !/^[a-f0-9]{64}$/.test(source.userTextSha256 ?? '') ||
    record.authorization_line !==
      `SPECFORGE_PREIMPLEMENTATION_RECOVERY_V1 ${workItemId} ${binding.blocked_event_id} ${binding.binding_sha256}`
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_SOURCE_INVALID');
  const oldDecision = JSON.parse(record.decision.before) as Record<string, unknown>,
    newDecision = JSON.parse(record.decision.after) as Record<string, unknown>;
  const preservedDecision: Record<string, unknown> = {
    ...newDecision,
    decision_status: oldDecision.decision_status,
  };
  delete preservedDecision.previous_decision_status;
  delete preservedDecision.invalidated_at;
  delete preservedDecision.invalidation_reason;
  const oldManifest = JSON.parse(record.manifest.before) as Record<string, unknown>,
    newManifest = JSON.parse(record.manifest.after);
  const preservedManifest = {
    ...newManifest,
    base_spec_version: oldManifest.base_spec_version,
    project_spec_precondition_sha256: oldManifest.project_spec_precondition_sha256,
  };
  if (!Object.hasOwn(oldManifest, 'project_spec_precondition_sha256'))
    delete preservedManifest.project_spec_precondition_sha256;
  if (
    newDecision.decision_status !== 'invalidated' ||
    (oldDecision.decision_status !== 'approved' && oldDecision.decision_status !== 'waived') ||
    newDecision.previous_decision_status !== oldDecision.decision_status ||
    typeof newDecision.invalidated_at !== 'string' ||
    !Number.isFinite(Date.parse(newDecision.invalidated_at)) ||
    canonicalVerificationJson(preservedDecision) !== canonicalVerificationJson(oldDecision) ||
    newManifest.base_spec_version !== record.proof.project_spec_version ||
    newManifest.project_spec_precondition_sha256 !== 'sha256:' + record.proof.spec_sha256 ||
    canonicalVerificationJson(preservedManifest) !== canonicalVerificationJson(oldManifest)
  )
    throw new Error('PREIMPLEMENTATION_RECOVERY_COMMIT_PLAN_INVALID');
  const entries = Object.entries(record.proof.inputs);
  if (entries.length === 0 || entries.length > 4096)
    throw new Error('PREIMPLEMENTATION_RECOVERY_INPUT_BUDGET');
  for (const [name, expected] of entries) {
    if (
      !name.startsWith(SPEC_DIR_NAME + '/') ||
      name.split('/').includes('..') ||
      name.includes('\\') ||
      path.isAbsolute(name)
    )
      throw new Error('PREIMPLEMENTATION_RECOVERY_INPUT_PATH_INVALID');
    const archived = await readVerificationFile(path.join(archive, 'snapshot', name));
    if (hash(archived) !== expected.sha256 || archived.length !== expected.size)
      throw new Error('PREIMPLEMENTATION_RECOVERY_ARCHIVE_BYTES_CHANGED');
    const current = await readVerificationFile(path.join(projectRoot, name));
    const prefix = `${SPEC_DIR_NAME}/work-items/${workItemId}/`;
    const target =
      name === prefix + 'user_decision.json'
        ? record.decision
        : name === prefix + 'candidate_manifest.json'
          ? record.manifest
          : null;
    if (
      target
        ? current.toString('utf8') !== target.after || archived.toString('utf8') !== target.before
        : hash(current) !== expected.sha256
    )
      throw new Error('PREIMPLEMENTATION_RECOVERY_COMMIT_INPUT_CHANGED:' + name);
  }
}
