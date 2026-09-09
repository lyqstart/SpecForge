import {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestValue,
} from '@specforge/types';

import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

export function createCandidateManifestSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `candidate-manifest-${workItemId}`,
    owner: '@specforge/daemon-core/candidate-prepare-freeze-transaction',
    relativePath: 'candidate_manifest.json',
    format: 'json',
    required: true,
    currentSchemaId: CANDIDATE_MANIFEST_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      validateCurrentCandidateManifestValue(value, workItemId).valid,
    transitions: [],
  };
}
