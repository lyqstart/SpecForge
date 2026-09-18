import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');

describe('current release version-unification boundary', () => {
  it('does not build or publicly export the removed legacy manifest subsystem', async () => {
    const index = await readFile(resolve(PACKAGE_ROOT, 'src/index.ts'), 'utf8');
    const versionGuard = await readFile(
      resolve(REPOSITORY_ROOT, 'scripts/ci/version-guard.ts'),
      'utf8',
    );

    const listFiles = async (relativePath: string): Promise<string[]> =>
      readdir(resolve(PACKAGE_ROOT, relativePath)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        },
      );

    for (const removedDirectory of [
      'src/legacy',
      'src/bootstrap',
      'src/compat',
      'src/degraded-mode',
      'src/manifest',
      'src/migration',
      'tests/integration',
      'tests/property',
    ]) {
      expect(await listFiles(removedDirectory)).toEqual([]);
    }

    expect(await listFiles('tests/unit')).toEqual(['current-release-no-legacy-surface.test.ts']);
    expect(await listFiles('src')).not.toContain('constants.ts');
    expect(index).not.toContain('data_schema_version');
    expect(index).not.toContain('ProjectManifest');
    expect(index).not.toContain('MigrationRunner');
    expect(index).not.toContain('StartupCompatibilityChecker');
    expect(index).not.toContain('UserManifestWriter');

    expect(versionGuard).not.toContain('minSchemaRule');
    expect(versionGuard).not.toContain('dataSchemaWriteRule');
    expect(versionGuard).not.toContain('schemaIntroductionRule');
    for (const removedRule of [
      'min-schema-rule.ts',
      'data-schema-write-rule.ts',
      'schema-introduction-rule.ts',
    ]) {
      expect(
        await readFile(
          resolve(REPOSITORY_ROOT, 'scripts/ci/version-guard', removedRule),
          'utf8',
        ).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return false;
            throw error;
          },
        ),
      ).toBe(false);
    }
  });

  it('takes its current responsibility from SPS-1.0 and stays out of schema migration ownership', async () => {
    const productSpec = await readFile(
      resolve(
        REPOSITORY_ROOT,
        'docs/product-specification/specforge-product-specification.md',
      ),
      'utf8',
    );
    const section = productSpec
      .split('# 16. Version Unification')[1]
      ?.split('# 17. Release Governance / Scope Gate')[0] ?? '';
    const index = await readFile(resolve(PACKAGE_ROOT, 'src/index.ts'), 'utf8');

    expect(section).toContain(
      'Version Unification 当前只负责仓库/运行 artifact 的 code version 单一读取与必要的一致性检查。',
    );
    expect(section).toContain('它不负责：');
    expect(section).toContain('Project schema migration');
    expect(section).toContain('installer manifest ownership');
    expect(section).toContain('release scope ownership');
    expect(index).toContain("export { getCodeVersion } from './code-version.js';");
    expect(index).not.toContain('MigrationRunner');
    expect(index).not.toContain('ProjectManifest');
  });
});
