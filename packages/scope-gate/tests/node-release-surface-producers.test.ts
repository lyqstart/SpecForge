import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  produceCleanBuildSurfaceReport,
  producePackageExportSurfaceReport,
} from '../src/node-release-surface-producers';

const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-release-candidate-'));
  roots.push(root);
  return root;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, ...relativePath.split('/'));
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function addPackage(
  root: string,
  dir: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  await write(root, `packages/${dir}/package.json`, `${JSON.stringify(manifest)}\n`);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Node release surface producers', () => {
  it('enumerates package exports and production workspace dependencies deterministically', async () => {
    const root = await fixtureRoot();
    await addPackage(root, 'types', {
      name: '@specforge/types',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    });
    await addPackage(root, 'cli', {
      name: '@specforge/cli',
      main: 'dist/cli.js',
      types: 'dist/cli.d.ts',
      dependencies: {
        '@specforge/types': 'workspace:*',
        zod: '^4.0.0',
      },
      devDependencies: {
        '@specforge/test-only': 'workspace:*',
      },
    });

    const result = await producePackageExportSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.errors).toEqual([]);
    expect(result.report.complete).toBe(true);
    expect(result.report.items.map((item) => item.id)).toEqual([
      '@specforge/cli',
      '@specforge/types',
    ]);
    expect(result.report.items[0].dependencies).toEqual(['@specforge/types']);
    expect(result.report.items[0].path).toBe('packages/cli/package.json');
  });

  it('hashes real dist main/types artifacts for the clean-build surface', async () => {
    const root = await fixtureRoot();
    await write(root, 'package.json', `${JSON.stringify({
      name: 'release-candidate',
      specforgeRelease: { cleanBuildFiles: [] },
    })}\n`);
    await addPackage(root, 'types', {
      name: '@specforge/types',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    });
    await write(root, 'packages/types/dist/index.js', 'export {};\n');
    await write(root, 'packages/types/dist/index.d.ts', 'export {};\n');

    const result = await produceCleanBuildSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.errors).toEqual([]);
    expect(result.report.complete).toBe(true);
    expect(result.report.items).toHaveLength(2);
    expect(result.report.items[0].path).toBe('packages/types/dist/index.d.ts');
    expect(result.report.items[1].path).toBe('packages/types/dist/index.js');
    expect(result.report.items[1].sha256).toBe(
      createHash('sha256').update('export {};\n').digest('hex'),
    );
  });

  it('fails closed when the candidate packages directory is absent', async () => {
    const root = await fixtureRoot();
    const result = await producePackageExportSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.report.complete).toBe(false);
    expect(result.errors).toContain('package_export:packages_directory_missing');
  });

  it('fails closed for malformed package manifests', async () => {
    const root = await fixtureRoot();
    await write(root, 'packages/bad/package.json', '{bad\n');
    const result = await producePackageExportSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.report.complete).toBe(false);
    expect(result.errors).toContain('package_export:packages/bad/package.json:json_invalid');
  });

  it('rejects source-tree main/types paths as clean-build artifacts', async () => {
    const root = await fixtureRoot();
    await addPackage(root, 'types', {
      name: '@specforge/types',
      main: 'src/index.ts',
      types: 'src/index.ts',
    });
    await write(root, 'packages/types/src/index.ts', 'export {};\n');
    const result = await produceCleanBuildSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.report.complete).toBe(false);
    expect(result.errors).toContain(
      'clean_build:@specforge/types:main_not_dist:src/index.ts',
    );
    expect(result.errors).toContain(
      'clean_build:@specforge/types:types_not_dist:src/index.ts',
    );
  });

  it('fails closed when a declared dist artifact is missing', async () => {
    const root = await fixtureRoot();
    await addPackage(root, 'types', {
      name: '@specforge/types',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    });
    await write(root, 'packages/types/dist/index.js', 'export {};\n');
    const result = await produceCleanBuildSurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(result.report.complete).toBe(false);
    expect(result.errors).toContain(
      'clean_build:@specforge/types:types_missing:packages/types/dist/index.d.ts',
    );
  });
});
