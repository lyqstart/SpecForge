import {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestJson,
} from '@specforge/types';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertVerificationPath, readVerificationFile } from '../../verification/owner-store';
import {
  createCandidateManifestSchemaDescriptor,
  precheckSchemaDescriptors,
  type SchemaDescriptorPrecheckResult,
} from '@specforge/types/schema-contract';

export {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestJson,
} from '@specforge/types';
export { createCandidateManifestSchemaDescriptor } from '@specforge/types/schema-contract';

export async function precheckCandidateManifestSchema(
  workItemDir: string,
  workItemId: string
): Promise<SchemaDescriptorPrecheckResult> {
  return precheckSchemaDescriptors(workItemDir, [
    createCandidateManifestSchemaDescriptor(workItemId),
  ]);
}

export function candidateManifestSchemaBlockCode(
  result: SchemaDescriptorPrecheckResult
): string | undefined {
  if (result.ok) return undefined;
  return result.checks[0]?.errorCode ?? 'SCHEMA_VERSION_MISMATCH';
}

export function candidateManifestContentBlockCode(
  content: string,
  workItemId: string
): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return 'INVALID_JSON';
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'SCHEMA_INVALID';
  const schemaVersion = (parsed as Record<string, unknown>).schema_version;
  if (schemaVersion === undefined) return 'SCHEMA_ID_MISSING';
  if (schemaVersion !== CANDIDATE_MANIFEST_SCHEMA_VERSION) return 'SCHEMA_VERSION_MISMATCH';
  return validateCurrentCandidateManifestJson(content, workItemId).valid
    ? undefined
    : 'SCHEMA_INVALID';
}

/** Recovery changes only the current formal base; Candidate content and Task bytes stay owned. */
export async function commitPreparedCandidateRebase(
  workItemDir: string,
  plan: { before: string; after: string }
) {
  const target = path.join(workItemDir, 'candidate_manifest.json');
  const current = (await readVerificationFile(target)).toString('utf8');
  if (current !== plan.before && current !== plan.after)
    throw new Error('CANDIDATE_REBASE_INPUT_CHANGED');
  const workItemId = path.basename(workItemDir);
  if (
    candidateManifestContentBlockCode(plan.before, workItemId) ||
    candidateManifestContentBlockCode(plan.after, workItemId)
  )
    throw new Error('CANDIDATE_REBASE_SCHEMA_INVALID');
  const before = JSON.parse(plan.before) as Record<string, unknown>,
    after = JSON.parse(plan.after);
  const preserved = {
    ...after,
    base_spec_version: before.base_spec_version,
    project_spec_precondition_sha256: before.project_spec_precondition_sha256,
  };
  if (!Object.hasOwn(before, 'project_spec_precondition_sha256'))
    delete preserved.project_spec_precondition_sha256;
  if (JSON.stringify(preserved) !== JSON.stringify(before))
    throw new Error('CANDIDATE_REBASE_SCOPE_CHANGED');
  if (current === plan.after) return;
  const pending = path.join(workItemDir, 'recovery_generations');
  await assertVerificationPath(pending, true);
  await fs.mkdir(pending, { recursive: true });
  const temporary = path.join(pending, '.rebasing-' + randomUUID());
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(plan.after);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await assertVerificationPath(target);
  await fs.rename(temporary, target);
}
