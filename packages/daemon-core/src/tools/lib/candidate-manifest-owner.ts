import {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestJson,
} from '@specforge/types';
import {
  createCandidateManifestSchemaDescriptor,
  precheckSchemaDescriptors,
  type SchemaDescriptorPrecheckResult,
} from '@specforge/migration';

export {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestJson,
} from '@specforge/types';
export { createCandidateManifestSchemaDescriptor } from '@specforge/migration';

export async function precheckCandidateManifestSchema(
  workItemDir: string,
  workItemId: string,
): Promise<SchemaDescriptorPrecheckResult> {
  return precheckSchemaDescriptors(workItemDir, [
    createCandidateManifestSchemaDescriptor(workItemId),
  ]);
}

export function candidateManifestSchemaBlockCode(
  result: SchemaDescriptorPrecheckResult,
): string | undefined {
  if (result.ok && !result.needsMigration) return undefined;
  return result.checks[0]?.errorCode ?? 'MIGRATION_REQUIRED';
}

export function candidateManifestContentBlockCode(
  content: string,
  workItemId: string,
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
  if (schemaVersion !== CANDIDATE_MANIFEST_SCHEMA_VERSION) return 'CHAIN_GAP';
  return validateCurrentCandidateManifestJson(content, workItemId).valid
    ? undefined
    : 'SCHEMA_INVALID';
}
