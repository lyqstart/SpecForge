import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { releaseCodePermission } from '../../src/tools/lib/code-permission-service-v11';
import { createWorkItem } from '../../src/tools/lib/work-item-lifecycle-v11';

describe('planned-scope revision governance', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('requires a reason and persists the exact extension chain', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-scope-revision-'));
    roots.push(projectRoot);
    const workItemId = 'WI-0001';
    const workItemDir = await createWorkItem({
      projectRoot,
      workItemId,
      userRequest: 'exercise controlled scope revision',
    });

    await releaseCodePermission({
      workItemDir,
      workItemId,
      allowedWriteFiles: [{ path: 'src/main.ts', operation: 'create' }],
    });

    await expect(
      releaseCodePermission({
        workItemDir,
        workItemId,
        allowedWriteFiles: [{ path: 'src/helper.ts', operation: 'create' }],
      }),
    ).rejects.toThrow('SCOPE_REVISION_REASON_REQUIRED');

    const result = await releaseCodePermission({
      workItemDir,
      workItemId,
      allowedWriteFiles: [{ path: 'src/helper.ts', operation: 'create' }],
      revisionReason: 'implementation discovered a same-module helper requirement',
    });
    expect(result.scope_revision).toEqual(
      expect.objectContaining({
        schema_version: 'planned-scope-revision/v1',
        revision_id: 'SR-WI-0001-0001',
        reason: 'implementation discovered a same-module helper requirement',
        added_allowed_write_files: [
          expect.objectContaining({ path: 'src/helper.ts', operation: 'create' }),
        ],
      }),
    );

    const workItem = JSON.parse(
      await readFile(path.join(workItemDir, 'work_item.json'), 'utf-8'),
    );
    expect(workItem.allowed_write_files).toEqual(
      expect.arrayContaining([
        { path: 'src/main.ts', operation: 'create' },
        { path: 'src/helper.ts', operation: 'create' },
      ]),
    );
    expect(workItem.scope_revision_history).toHaveLength(1);
    expect(workItem.allowed_write_files_history.at(-1)).toEqual(
      expect.objectContaining({
        mode: 'extend',
        revision_reason: 'implementation discovered a same-module helper requirement',
        requested_allowed_write_files: [
          expect.objectContaining({ path: 'src/helper.ts', operation: 'create' }),
        ],
      }),
    );
  });
});
