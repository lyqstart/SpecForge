import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSpecStore, type CandidateManifestV12 } from '../src/project/ProjectSpecStore';

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-v12-candidate-merge-'));
}

describe('v1.2 Candidate Merge Contract', () => {
  it('merges an approved candidate into .specforge/project and bumps the project spec version', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({
      projectRoot: root,
      now: () => new Date('2026-06-21T00:00:00.000Z'),
    });

    await store.initializeProjectSpec('WI-0001');

    const candidatePath = '.specforge/work-items/WI-0001/candidates/requirements.md';
    await fs.mkdir(path.dirname(path.join(root, candidatePath)), { recursive: true });
    await fs.writeFile(path.join(root, candidatePath), '# Requirements\n\n- REQ-1: stable project spec store\n', 'utf8');

    const manifest: CandidateManifestV12 = {
      schema_version: '1.2',
      work_item_id: 'WI-0001',
      workflow_type: 'feature_spec',
      base_project_spec_version: 'PSV-0001',
      entries: [
        {
          candidate_path: candidatePath,
          target_project_path: '.specforge/project/requirements_index.md',
          merge_mode: 'replace_file',
        },
      ],
    };

    const result = await store.mergeCandidateManifest(manifest);

    expect(result.merged).toBe(true);
    expect(result.previous_project_spec_version).toBe('PSV-0001');
    expect(result.project_spec_version).toBe('PSV-0002');
    expect(await fs.readFile(path.join(root, '.specforge/project/requirements_index.md'), 'utf8')).toContain('REQ-1');
    expect(await fs.readFile(path.join(root, '.specforge/project/spec_manifest.json'), 'utf8')).toContain('PSV-0002');
    expect(await fs.readFile(path.join(root, '.specforge/project/versions/spec_versions.jsonl'), 'utf8')).toContain('candidate_manifest_merge');
  });

  it('fails closed for stale base_project_spec_version', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({ projectRoot: root });

    await store.initializeProjectSpec('WI-0001');

    const manifest: CandidateManifestV12 = {
      schema_version: '1.2',
      work_item_id: 'WI-0002',
      workflow_type: 'feature_spec',
      base_project_spec_version: 'PSV-9999',
      entries: [
        {
          candidate_path: '.specforge/work-items/WI-0002/candidates/requirements.md',
          target_project_path: '.specforge/project/requirements_index.md',
          merge_mode: 'replace_file',
        },
      ],
    };

    await expect(store.mergeCandidateManifest(manifest)).rejects.toMatchObject({
      code: 'CANDIDATE_MANIFEST_INVALID',
      details: expect.arrayContaining(['base_project_spec_version_stale']),
    });
  });

  it('fails closed when candidate entries omit target_project_path', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({ projectRoot: root });

    await store.initializeProjectSpec('WI-0001');

    const validation = store.validateCandidateManifest(
      {
        schema_version: '1.2',
        work_item_id: 'WI-0002',
        base_project_spec_version: 'PSV-0001',
        entries: [
          {
            candidate_path: '.specforge/work-items/WI-0002/candidates/requirements.md',
            target_project_path: '',
            merge_mode: 'replace_file',
          },
        ],
      },
      'PSV-0001',
    );

    expect(validation.valid).toBe(false);
    expect(validation.violations).toContain('entries[0].target_project_path_required');
  });
});
