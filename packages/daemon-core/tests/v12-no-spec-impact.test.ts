import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSpecStore, type CandidateManifestV12 } from '../src/project/ProjectSpecStore';

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-v12-no-spec-impact-'));
}

describe('v1.2 no-spec-impact evidence', () => {
  it('records quick_change no-spec-impact evidence instead of modifying .specforge/project', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({
      projectRoot: root,
      now: () => new Date('2026-06-21T00:00:00.000Z'),
    });

    await store.initializeProjectSpec('WI-0001');

    const evidence = await store.writeNoSpecImpactEvidence({
      workItemId: 'WI-0002',
      workflowPath: 'code_only_fast_path',
      reason: 'quick_change changed only implementation files',
    });

    expect(evidence.spec_impact).toBe('none');
    expect(evidence.candidate_entries).toEqual([]);

    const stored = await fs.readFile(
      path.join(root, '.specforge/work-items/WI-0002/no_spec_impact.json'),
      'utf8',
    );
    expect(stored).toContain('code_only_fast_path');
    expect(await store.currentVersion()).toBe('PSV-0001');
  });

  it('allows no_spec_impact candidate manifests only when entries are empty', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({ projectRoot: root });
    await store.initializeProjectSpec('WI-0001');

    const valid: CandidateManifestV12 = {
      schema_version: '1.2',
      work_item_id: 'WI-0002',
      workflow_type: 'quick_change',
      workflow_path: 'code_only_fast_path',
      no_spec_impact: true,
      entries: [],
    };

    expect(store.validateCandidateManifest(valid, 'PSV-0001').valid).toBe(true);

    const invalid: CandidateManifestV12 = {
      ...valid,
      entries: [
        {
          candidate_path: '.specforge/work-items/WI-0002/candidates/requirements.md',
          target_project_path: '.specforge/project/requirements_index.md',
          merge_mode: 'replace_file',
        },
      ],
    };

    expect(store.validateCandidateManifest(invalid, 'PSV-0001').violations).toContain(
      'no_spec_impact_requires_empty_entries',
    );
  });
});
