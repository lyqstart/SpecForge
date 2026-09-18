import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWorkItemMetadataSchemaDescriptor,
  precheckWorkItemMetadataSchema,
  readWorkItemMetadata,
} from '../../src/tools/lib/work-item-metadata';
import { createWorkItem } from '../../src/tools/lib/work-item-lifecycle-v11';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-work-item-schema-'));
  roots.push(root);
  return root;
}

describe('Work Item metadata schema owner', () => {
  it('declares the exact owner, instance path, schema and a current-schema-only contract', () => {
    const descriptor = createWorkItemMetadataSchemaDescriptor('WI-0042');

    expect(descriptor).toMatchObject({
      id: 'work-item-metadata-WI-0042',
      owner: '@specforge/types/work-item-metadata',
      relativePath: 'work_item.json',
      format: 'json',
      required: true,
      currentSchemaId: '1.1',
    });
    expect(descriptor.validateCurrent({
      schema_version: '1.1',
      work_item_id: 'WI-0042',
    })).toBe(true);
    expect(descriptor.validateCurrent({
      schema_version: '1.1',
      work_item_id: 'WI-9999',
    })).toBe(false);
  });

  it('uses the descriptor at the current creation and read boundary', async () => {
    const root = await projectRoot();
    const workItemId = 'WI-0001';
    const workItemDir = await createWorkItem({
      projectRoot: root,
      workItemId,
      userRequest: 'Prove the current Work Item schema owner.',
    });

    const precheck = await precheckWorkItemMetadataSchema(workItemDir, workItemId);
    expect(precheck.ok).toBe(true);
    expect(precheck.checks[0].status).toBe('current');
    await expect(readWorkItemMetadata(workItemDir, workItemId)).resolves.toMatchObject({
      schema_version: '1.1',
      work_item_id: workItemId,
    });
  });

  it('fails closed on an unregistered earlier schema without modifying its bytes', async () => {
    const root = await projectRoot();
    const workItemId = 'WI-0002';
    const workItemDir = join(root, '.specforge', 'work-items', workItemId);
    await mkdir(workItemDir, { recursive: true });
    const historical = JSON.stringify({ schema_version: '1.0', work_item_id: workItemId }) + '\n';
    await writeFile(join(workItemDir, 'work_item.json'), historical, 'utf8');

    const precheck = await precheckWorkItemMetadataSchema(workItemDir, workItemId);
    expect(precheck.ok).toBe(false);
    expect(precheck.checks[0]).toMatchObject({
      status: 'blocked',
      observedSchemaId: '1.0',
      errorCode: 'SCHEMA_VERSION_MISMATCH',
    });
    await expect(readWorkItemMetadata(workItemDir, workItemId))
      .rejects.toThrow('WORK_ITEM_METADATA_SCHEMA_BLOCKED');
    await expect(import('node:fs/promises').then(({ readFile }) =>
      readFile(join(workItemDir, 'work_item.json'), 'utf8'))).resolves.toBe(historical);
  });
});
