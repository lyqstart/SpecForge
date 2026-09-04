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

  it('assigns current schema migration to per-file schema_version without a project aggregate manifest', async () => {
    const v6Requirements = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/v6-architecture-overview/requirements.md'),
      'utf8',
    );
    const v6Design = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/v6-architecture-overview/design.md'),
      'utf8',
    );
    const moduleRequirements = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/version-unification/requirements.md'),
      'utf8',
    );
    const moduleDesign = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/version-unification/design.md'),
      'utf8',
    );
    const dispositionMatrix = await readFile(
      resolve(
        REPOSITORY_ROOT,
        'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
      ),
      'utf8',
    );

    for (const authority of [v6Requirements, v6Design]) {
      expect(authority).toContain('NO_PROJECT_AGGREGATE_SCHEMA_MANIFEST');
      expect(authority).toContain('.specforge/project/spec_manifest.json');
      expect(authority).toContain('@specforge/migration');
    }
    for (const moduleSpec of [moduleRequirements, moduleDesign]) {
      expect(moduleSpec).toContain('PROJECT_SCHEMA_MIGRATION_OWNER=@specforge/migration');
      expect(moduleSpec).toContain('PROJECT_AGGREGATE_DATA_SCHEMA_VERSION=UNSUPPORTED');
    }
    expect(v6Design).toContain(
      '| `@specforge/version-unification` | `CURRENT_RELEASE_SUPPORTING` | 仓库代码版本唯一读取入口',
    );
    expect(dispositionMatrix).toContain(
      '| `@specforge/version-unification` | 仓库代码版本唯一读取入口',
    );
    expect(v6Design).toContain('getCodeVersion()');
    expect(dispositionMatrix).toContain('getCodeVersion()');
  });
});
