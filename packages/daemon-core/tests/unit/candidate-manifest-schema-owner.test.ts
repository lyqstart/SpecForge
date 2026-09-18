import { describe, expect, it } from 'vitest';
import {
  candidateManifestContentBlockCode,
  createCandidateManifestSchemaDescriptor,
  validateCurrentCandidateManifestJson,
} from '../../src/tools/lib/candidate-manifest-owner';
import { isCanonicalNoCodeVerificationCandidateManifest } from '../../src/tools/lib/state-coordinator-v11';

function currentManifest(workItemId = 'WI-7002') {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_type: 'spec_migration',
    workflow_path: 'spec_migration_path',
    base_spec_version: 'PSV-0003',
    project_spec_precondition_sha256: `sha256:${'a'.repeat(64)}`,
    repair_evidence_paths: ['.specforge/project/architecture.md'],
    merge_required: true,
    entries: [{
      candidate_path: 'candidates/project/architecture.candidate.md',
      target_path: '.specforge/project/architecture.md',
      operation: 'replace',
      type: 'architecture',
    }],
  };
}

describe('Candidate Manifest persistent-file owner', () => {
  it('exposes one strict current contract bound to schema and Work Item identity', () => {
    expect(validateCurrentCandidateManifestJson(
      JSON.stringify(currentManifest()),
      'WI-7002',
    )).toEqual({ valid: true, errors: [] });
    expect(candidateManifestContentBlockCode(
      JSON.stringify({ ...currentManifest(), schema_version: '1.1' }),
      'WI-7002',
    )).toBe('SCHEMA_VERSION_MISMATCH');
    expect(validateCurrentCandidateManifestJson(
      JSON.stringify({ ...currentManifest(), unsupported_shadow: true }),
      'WI-7002',
    ).valid).toBe(false);
    expect(validateCurrentCandidateManifestJson(
      JSON.stringify(currentManifest('WI-7003')),
      'WI-7002',
    ).valid).toBe(false);
  });

  it('registers schema 1.0 with the freeze transaction and no legacy transition', () => {
    expect(createCandidateManifestSchemaDescriptor('WI-7002')).toMatchObject({
      owner: '@specforge/daemon-core/candidate-prepare-freeze-transaction',
      relativePath: 'candidate_manifest.json',
      required: true,
      currentSchemaId: '1.0',
    });
  });

  it('uses current schema 1.0 for the spec-migration verification path', () => {
    expect(isCanonicalNoCodeVerificationCandidateManifest({
      manifest: currentManifest(),
      workItemId: 'WI-7002',
      workflowType: 'spec_migration',
    })).toBe(true);
    expect(isCanonicalNoCodeVerificationCandidateManifest({
      manifest: { ...currentManifest(), schema_version: '1.1' },
      workItemId: 'WI-7002',
      workflowType: 'spec_migration',
    })).toBe(false);
  });
});
