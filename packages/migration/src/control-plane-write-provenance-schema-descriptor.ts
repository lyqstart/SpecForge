import {
  ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION,
  GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION,
  validateAtomicSpecMergeWriteProvenanceValue,
  validateGitGovernanceWriteProvenanceValue,
} from '@specforge/types';
import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

export function createAtomicSpecMergeWriteProvenanceSchemaDescriptor(): PersistentFileSchemaDescriptor {
  return {
    id: 'atomic-spec-merge-write-provenance',
    owner: '@specforge/daemon-core/atomic-spec-merge-write-provenance',
    relativePath: 'atomic_spec_merge_controlled_writes.json',
    format: 'json',
    required: false,
    currentSchemaId: ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION,
    validateCurrent: validateAtomicSpecMergeWriteProvenanceValue,
    transitions: [],
  };
}

export function createGitGovernanceWriteProvenanceSchemaDescriptor(): PersistentFileSchemaDescriptor {
  return {
    id: 'git-governance-write-provenance',
    owner: '@specforge/daemon-core/git-governance-write-provenance',
    relativePath: 'git_governance_controlled_writes.json',
    format: 'json',
    required: false,
    currentSchemaId: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION,
    validateCurrent: validateGitGovernanceWriteProvenanceValue,
    transitions: [],
  };
}
