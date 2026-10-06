import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertWorkspaceVersionAlignment,
  expectedProductTag,
  loadProductIdentity,
} from '../../scripts/lib/product-identity';

const ROOT = resolve(import.meta.dirname, '../..');

describe('current product version contract', () => {
  it('defines the new product epoch from the root package identity', async () => {
    const identity = await loadProductIdentity(ROOT);

    expect(identity).toEqual({
      version: '1.0.5',
      releaseId: 'specforge-current',
      tagPrefix: 'specforge-v',
      versionEpoch: 1,
    });
    expect(expectedProductTag(identity)).toBe('specforge-v1.0.5');
  });

  it('keeps every current workspace package on the product version', async () => {
    const identity = await loadProductIdentity(ROOT);
    await expect(assertWorkspaceVersionAlignment(ROOT, identity.version)).resolves.toBeUndefined();

    const packageDirs = await readdir(resolve(ROOT, 'packages'), { withFileTypes: true });
    const versions = (await Promise.all(
      packageDirs
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const text = await readFile(
              resolve(ROOT, 'packages', entry.name, 'package.json'),
              'utf8',
            );
            return (JSON.parse(text) as { version: string }).version;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
          }
        }),
    )).filter((version): version is string => version !== undefined);
    expect(new Set(versions)).toEqual(new Set(['1.0.5']));
  });

  it('projects the same release identity through current authority and release entrypoints', async () => {
    const paths = [
      'docs/product-specification/specforge-product-specification.md',
      'scripts/build-release-manifest.ts',
      'scripts/run-current-release-precheck.ts',
      'scripts/sf-installer.ts',
    ];
    const contents = await Promise.all(paths.map((path) => readFile(resolve(ROOT, path), 'utf8')));

    expect(contents[0]).toContain('"releaseId": "specforge-current"');
    for (const content of contents) {
      expect(content).not.toContain('specforge-v6-current');
    }
    expect(contents[3]).not.toContain('V3.5');
    expect(contents[3]).not.toContain('Plugin 自动初始化');
  });

  it('removes legacy product branding from current installer projections', async () => {
    const paths = [
      'setup/userlevel-scripts-lib/registry.ts',
      'setup/userlevel-scripts-lib/manifest.ts',
      'setup/userlevel-scripts-lib/errors.ts',
      'setup/userlevel-opencode/plugins/sf_specforge.ts',
      'setup/userlevel-opencode/tools/sf_doctor.ts',
    ];
    const contents = await Promise.all(paths.map((path) => readFile(resolve(ROOT, path), 'utf8')));

    for (const content of contents) {
      expect(content).not.toMatch(/SpecForge V(?:3\.5|6)/);
      expect(content).not.toContain('V3.5 用户级架构');
    }
  });

  it('records all four product-owner version decisions', async () => {
    const registry = await readFile(
      resolve(ROOT, 'docs/product-specification/authority-registry.md'),
      'utf8',
    );
    for (const id of ['VR-DEC-01', 'VR-DEC-02', 'VR-DEC-03', 'VR-DEC-04']) {
      expect(registry).toContain(id);
    }
  });
});
