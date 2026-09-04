import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  produceCleanBuildSurfaceReport,
  producePackageExportSurfaceReport,
} from '../src/node-release-surface-producers';

const candidateRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('current repository package build surfaces', () => {
  it('uses distributable package entrypoints and has every declared main/types artifact', async () => {
    const options = {
      candidateRoot,
      releaseId: 'specforge-v6-current',
      candidateId: 'main-45a0cfee-working-tree',
    };
    const packageExport = await producePackageExportSurfaceReport(options);
    const cleanBuild = await produceCleanBuildSurfaceReport(options);

    expect(packageExport.errors).toEqual([]);
    expect(cleanBuild.errors).toEqual([]);
    expect(packageExport.report.complete).toBe(true);
    expect(cleanBuild.report.complete).toBe(true);
  });

  it('provides require conditions for types subpaths consumed by current CommonJS package builds', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(candidateRoot, 'packages/types/package.json'), 'utf8'),
    ) as { exports: Record<string, { import?: string; require?: string }> };

    for (const subpath of ['./directory-layout', './user-level-paths']) {
      expect(manifest.exports[subpath]?.require).toBe(manifest.exports[subpath]?.import);
      expect(manifest.exports[subpath]?.require).toMatch(/^\.\/dist\/.+\.js$/);
    }
  });
});
