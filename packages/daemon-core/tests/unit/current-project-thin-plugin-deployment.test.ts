import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureProjectThinPlugin } from '../../src/tools/lib/sf_project_init_core';

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('current project Thin Plugin deployment', () => {
  it('projects the installed integration source into the project .opencode plugin boundary', async () => {
    const projectRoot = await tempRoot('specforge-project-plugin-');
    const userRoot = await tempRoot('specforge-user-plugin-');
    const source = join(userRoot, 'integrations', 'opencode', 'sf_specforge.ts');
    await mkdir(join(source, '..'), { recursive: true });
    await writeFile(source, 'export default async function sf_specforge() {}\n', 'utf8');

    const first = await ensureProjectThinPlugin(projectRoot, userRoot);
    const second = await ensureProjectThinPlugin(projectRoot, userRoot);
    const target = join(projectRoot, '.opencode', 'plugins', 'sf_specforge.ts');

    expect(first).toEqual({ status: 'installed', targetPath: target });
    expect(second).toEqual({ status: 'unchanged', targetPath: target });
    expect(await readFile(target, 'utf8')).toBe(await readFile(source, 'utf8'));
  });

  it('fails before creating project integration paths when the installed source is missing', async () => {
    const projectRoot = await tempRoot('specforge-project-plugin-missing-');
    const userRoot = await tempRoot('specforge-user-plugin-missing-');

    await expect(ensureProjectThinPlugin(projectRoot, userRoot)).rejects.toThrow(
      'SPECFORGE_THIN_PLUGIN_SOURCE_MISSING',
    );
    await expect(stat(join(projectRoot, '.opencode'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
