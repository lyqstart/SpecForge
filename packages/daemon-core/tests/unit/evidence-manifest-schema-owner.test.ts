import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { precheckSchemaDescriptors } from '@specforge/migration';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-artifact-write';
import '../../src/tools/handlers/sf-v11-verification';
import { validateArtifactJson } from '../../src/tools/lib/artifact-schema-validation';
import { createWorkItem } from '../../src/tools/lib/work-item-lifecycle-v11';
import {
  createEvidenceManifestSchemaDescriptor,
  validateCurrentEvidenceManifestJson,
} from '../../src/tools/lib/evidence-manifest';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function currentManifest(workItemId: string) {
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    entries: [{
      evidence_id: 'EV-0001',
      type: 'test_output',
      path: 'evidence/test-output.txt',
      description: 'Target regression output',
      hash: 'sha256:abc123',
      created_at: '2026-09-04T00:00:00.000Z',
    }],
  };
}

async function projectWithWorkItem(workItemId: string) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-evidence-owner-project-'));
  roots.push(projectRoot);
  const workItemDir = await createWorkItem({
    projectRoot,
    workItemId,
    userRequest: 'Verify the Evidence Manifest owner boundary.',
  });
  return { projectRoot, workItemDir };
}

const stateDeps = {
  projectManager: {
    getProjectStateManager: async () => ({
      getState: async () => ({ current_state: 'implementation_ready' }),
    }),
  },
};

describe('Evidence Manifest schema owner', () => {
  it('uses the exact owner contract in the generic artifact validation boundary', () => {
    expect(validateCurrentEvidenceManifestJson(JSON.stringify(currentManifest('WI-0001')), 'WI-0001').valid)
      .toBe(true);
    expect(validateArtifactJson('evidence_manifest.json', JSON.stringify({
      work_item_id: 'WI-0001',
      entries: [{ type: 'test_output', path: 'evidence/test-output.txt' }],
    }), 'WI-0001')).toMatchObject({ valid: false });
    expect(validateArtifactJson('evidence_manifest.json', JSON.stringify({
      ...currentManifest('WI-0001'),
      schema_version: '1.1',
    }), 'WI-0001')).toMatchObject({ valid: false });
  });

  it('declares an optional per-Work-Item descriptor with no guessed transitions', () => {
    expect(createEvidenceManifestSchemaDescriptor('WI-0001')).toMatchObject({
      id: 'evidence-manifest-WI-0001',
      owner: '@specforge/daemon-core/evidence-manifest',
      relativePath: 'evidence/evidence_manifest.json',
      format: 'json',
      required: false,
      currentSchemaId: '1.0',
      transitions: [],
    });
  });

  it('fails closed on schema 1.1 without modifying the existing bytes', async () => {
    const workItemDir = await mkdtemp(join(tmpdir(), 'specforge-evidence-manifest-schema-'));
    roots.push(workItemDir);
    await mkdir(join(workItemDir, 'evidence'), { recursive: true });
    const historical = JSON.stringify({ ...currentManifest('WI-0001'), schema_version: '1.1' }) + '\n';
    const manifestPath = join(workItemDir, 'evidence', 'evidence_manifest.json');
    await writeFile(manifestPath, historical, 'utf8');

    const result = await precheckSchemaDescriptors(workItemDir, [
      createEvidenceManifestSchemaDescriptor('WI-0001'),
    ]);
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({
      status: 'blocked',
      observedSchemaId: '1.1',
      errorCode: 'CHAIN_GAP',
    });
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(historical);
  });

  it('makes the controlled Artifact Writer emit the owner schema 1.0', async () => {
    const workItemId = 'WI-0003';
    const { projectRoot, workItemDir } = await projectWithWorkItem(workItemId);
    const input = currentManifest(workItemId);
    delete (input as { schema_version?: string }).schema_version;
    const result = await getHandler('sf_artifact_write')!(
      { work_item_id: workItemId, file_type: 'evidence_manifest', content: input },
      { directory: projectRoot, agent: 'sf-verifier' },
      stateDeps,
    );
    expect(result.success).toBe(true);
    const content = await readFile(join(workItemDir, 'evidence', 'evidence_manifest.json'), 'utf8');
    expect(JSON.parse(content).schema_version).toBe('1.0');
    expect(validateCurrentEvidenceManifestJson(content, workItemId).valid).toBe(true);
  });

  it('does not overwrite an existing unknown schema through the controlled writer', async () => {
    const workItemId = 'WI-0004';
    const { projectRoot, workItemDir } = await projectWithWorkItem(workItemId);
    await mkdir(join(workItemDir, 'evidence'), { recursive: true });
    const manifestPath = join(workItemDir, 'evidence', 'evidence_manifest.json');
    const original = JSON.stringify({ ...currentManifest(workItemId), schema_version: '1.1' }) + '\n';
    await writeFile(manifestPath, original, 'utf8');

    const result = await getHandler('sf_artifact_write')!(
      {
        work_item_id: workItemId,
        file_type: 'evidence_manifest',
        content: currentManifest(workItemId),
      },
      { directory: projectRoot, agent: 'sf-verifier' },
      stateDeps,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('EVIDENCE_MANIFEST_SCHEMA_BLOCKED: CHAIN_GAP');
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(original);
  });

  it('does not let Verifier overwrite an existing unknown schema with its template', async () => {
    const workItemId = 'WI-0005';
    const { projectRoot, workItemDir } = await projectWithWorkItem(workItemId);
    await mkdir(join(workItemDir, 'evidence'), { recursive: true });
    const manifestPath = join(workItemDir, 'evidence', 'evidence_manifest.json');
    const original = JSON.stringify({ ...currentManifest(workItemId), schema_version: '1.1' }) + '\n';
    await writeFile(manifestPath, original, 'utf8');

    const result = await getHandler('sf_v11_verification')!(
      { action: 'create_evidence_manifest', work_item_id: workItemId },
      { directory: projectRoot },
      stateDeps,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('EVIDENCE_MANIFEST_SCHEMA_BLOCKED: CHAIN_GAP');
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(original);
  });

  it('rejects an unknown persistent schema through the Verifier read boundary', async () => {
    const workItemId = 'WI-0006';
    const { projectRoot, workItemDir } = await projectWithWorkItem(workItemId);
    await mkdir(join(workItemDir, 'evidence'), { recursive: true });
    const manifestPath = join(workItemDir, 'evidence', 'evidence_manifest.json');
    const original = JSON.stringify({ ...currentManifest(workItemId), schema_version: '1.1' }) + '\n';
    await writeFile(manifestPath, original, 'utf8');

    const result = await getHandler('sf_v11_verification')!(
      { action: 'validate_evidence_manifest', work_item_id: workItemId },
      { directory: projectRoot },
      stateDeps,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('EVIDENCE_MANIFEST_SCHEMA_BLOCKED: CHAIN_GAP');
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(original);
  });

  it('rejects a supplied manifest whose Work Item identity does not match the request', async () => {
    const workItemId = 'WI-0007';
    const { projectRoot } = await projectWithWorkItem(workItemId);

    const result = await getHandler('sf_v11_verification')!(
      {
        action: 'validate_evidence_manifest',
        work_item_id: workItemId,
        manifest: currentManifest('WI-DIFFERENT'),
      },
      { directory: projectRoot },
      stateDeps,
    );

    expect(result.success).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`evidence_manifest.work_item_id must be "${workItemId}"`);
  });
});
