import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readTrustedAtomicSpecMergeProjectWrites,
  recordAtomicSpecMergeProjectWrites,
} from '../../src/tools/lib/atomic-spec-merge-write-provenance';
import { runChangedFilesAudit } from '../../src/tools/lib/changed-files-audit';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

describe('Atomic Spec Merge write provenance', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('records hash-current Merge Runner writes and changed-files audit trusts them', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-atomic-merge-provenance-'));
    roots.push(root);
    const manifestPath = path.join(root, '.specforge', 'project', 'spec_manifest.json');
    await writeJson(manifestPath, {
      project_spec_version: 'PSV-0003',
      last_merged_work_item: 'WI-0002',
      last_merged_targets: [],
    });

    recordAtomicSpecMergeProjectWrites({
      projectRoot: root,
      workItemId: 'WI-0002',
      projectSpecVersion: 'PSV-0003',
      relativePaths: ['.specforge/project/spec_manifest.json'],
    });

    const trusted = readTrustedAtomicSpecMergeProjectWrites(root);
    expect(trusted).toEqual([
      expect.objectContaining({
        path: '.specforge/project/spec_manifest.json',
        producer: 'sf_v11_merge',
        work_item_id: 'WI-0002',
        project_spec_version: 'PSV-0003',
      }),
    ]);

    const audit = runChangedFilesAudit(
      [{ path: '.specforge/project/spec_manifest.json', operation: 'modify' }],
      [],
      'agent',
      trusted,
    );
    expect(audit.passed, audit.violations.join('; ')).toBe(true);
    expect(audit.trusted_control_plane_files).toBe(1);

    await writeJson(manifestPath, {
      project_spec_version: 'PSV-9999',
      last_merged_work_item: 'WI-0002',
      last_merged_targets: [],
    });
    expect(readTrustedAtomicSpecMergeProjectWrites(root)).toEqual([]);
  });

  it('reconstructs only a strictly matched legacy spec_manifest Merge Runner write', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-legacy-merge-provenance-'));
    roots.push(root);
    const wiDir = path.join(root, '.specforge', 'work-items', 'WI-0002');
    await fs.mkdir(wiDir, { recursive: true });
    await writeJson(path.join(root, '.specforge', 'project', 'spec_manifest.json'), {
      project_spec_version: 'PSV-0003',
      last_merged_work_item: 'WI-0002',
      last_merged_at: '2026-08-16T00:00:00.000Z',
      last_merged_targets: ['.specforge/project/modules/CORE/module.json'],
    });
    await writeJson(path.join(wiDir, 'candidate_manifest.json'), {
      work_item_id: 'WI-0002',
      entries: [],
    });
    await writeJson(path.join(wiDir, 'user_decision.json'), {
      work_item_id: 'WI-0002',
      decision_status: 'approved',
    });
    await fs.writeFile(
      path.join(wiDir, 'merge_report.md'),
      [
        '# Merge Report',
        '',
        'Work Item: WI-0002',
        'Status: success',
        '',
        '## Summary',
        '',
        '- Spec Manifest Updated: true',
        '- Project Spec Version: PSV-0003',
        '',
        '## Merged Files',
        '',
        '| Status | Operation | Candidate | Target | Hash Match |',
        '|--------|-----------|-----------|--------|------------|',
        '| success | replace | candidates/module.json | .specforge/project/modules/CORE/module.json | true |',
        '',
      ].join('\n'),
      'utf-8',
    );

    const trusted = readTrustedAtomicSpecMergeProjectWrites(root);
    expect(trusted).toEqual([
      expect.objectContaining({
        path: '.specforge/project/spec_manifest.json',
        producer: 'sf_v11_merge:legacy_reconstructed',
        work_item_id: 'WI-0002',
        project_spec_version: 'PSV-0003',
      }),
    ]);

    await writeJson(path.join(wiDir, 'user_decision.json'), {
      work_item_id: 'WI-0002',
      decision_status: 'rejected',
    });
    expect(readTrustedAtomicSpecMergeProjectWrites(root)).toEqual([]);
  });

  it('refuses provenance paths outside the formal Project Spec root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-atomic-merge-provenance-scope-'));
    roots.push(root);
    expect(() =>
      recordAtomicSpecMergeProjectWrites({
        projectRoot: root,
        workItemId: 'WI-0002',
        projectSpecVersion: 'PSV-0003',
        relativePaths: ['src/index.ts'],
      }),
    ).toThrow('ATOMIC_SPEC_MERGE_PROVENANCE_PATH_FORBIDDEN');
  });
});
