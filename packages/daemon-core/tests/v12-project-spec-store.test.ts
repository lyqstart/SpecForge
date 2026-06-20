import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSpecStore } from '../src/project/ProjectSpecStore';

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-v12-project-spec-store-'));
}

describe('v1.2 ProjectSpecStore', () => {
  it('initializes .specforge/project without using WI as the long-term spec source', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({
      projectRoot: root,
      now: () => new Date('2026-06-21T00:00:00.000Z'),
    });

    const manifest = await store.initializeProjectSpec('WI-0001');

    expect(manifest.schema_version).toBe('1.2');
    expect(manifest.project_spec_version).toBe('PSV-0001');
    expect(await fs.readFile(path.join(root, '.specforge/project/spec_manifest.json'), 'utf8')).toContain('PSV-0001');
    expect(await fs.readFile(path.join(root, '.specforge/project/requirements_index.md'), 'utf8')).toContain('Requirements Index');
    expect(await fs.readFile(path.join(root, '.specforge/project/versions/spec_versions.jsonl'), 'utf8')).toContain('initialize_project_spec');
  });

  it('rejects direct writes into .specforge/project when they are not performed by the merge tool', async () => {
    const root = await tempProject();
    const store = new ProjectSpecStore({ projectRoot: root });

    expect(() =>
      store.assertProjectSpecWriteAllowed({
        targetPath: '.specforge/project/requirements_index.md',
        viaProjectSpecMergeTool: false,
      }),
    ).toThrow(/Direct project spec write is forbidden/);

    expect(() =>
      store.assertProjectSpecWriteAllowed({
        targetPath: '.specforge/project/requirements_index.md',
        viaProjectSpecMergeTool: true,
      }),
    ).not.toThrow();
  });
});
