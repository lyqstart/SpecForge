import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')

describe('current release migration authority boundary', () => {
  it('requires a release-bound, fail-closed and write-free migration precheck', async () => {
    const authorityFiles = await Promise.all(
      [
        '.kiro/specs/v6-architecture-overview/requirements.md',
        '.kiro/specs/v6-architecture-overview/design.md',
        '.kiro/specs/migration/requirements.md',
        '.kiro/specs/migration/design.md',
      ].map((relativePath) =>
        readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8'),
      ),
    )

    for (const authority of authorityFiles) {
      expect(authority).toContain(
        'MIGRATION_SCRIPT_TRUST=RELEASE_MANIFEST_HASH_BOUND',
      )
      expect(authority).toContain('MIGRATION_FAILURE_POLICY=FAIL_CLOSED')
      expect(authority).toContain('MIGRATION_PRECHECK_WRITE=FORBIDDEN')
      expect(authority).toContain('MIGRATION_CHAIN_GAP=FAIL_CLOSED')
      expect(authority).toContain('SCHEMA_VERSION_AUTHORITY=PER_FILE_CONTRACT')
    }
  })

  it('freezes the current config, project registry, and runtime schema owners', async () => {
    const v6Requirements = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/v6-architecture-overview/requirements.md'),
      'utf8',
    )
    const v6Design = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/v6-architecture-overview/design.md'),
      'utf8',
    )
    const configurationRequirements = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/configuration/requirements.md'),
      'utf8',
    )
    const configurationDesign = await readFile(
      resolve(REPOSITORY_ROOT, '.kiro/specs/configuration/design.md'),
      'utf8',
    )

    for (const authority of [
      v6Requirements,
      v6Design,
      configurationRequirements,
      configurationDesign,
    ]) {
      expect(authority).toContain(
        'PROJECT_CONFIG_AUTHORITY=.specforge/config/project.json',
      )
      expect(authority).toContain(
        'PROJECT_CONFIG_COMPATIBILITY_ALIAS=UNSUPPORTED',
      )
    }

    for (const authority of [v6Requirements, v6Design]) {
      expect(authority).toContain(
        'PROJECT_REGISTRY_AUTHORITY=.specforge/project/extension_registry.json',
      )
      expect(authority).toContain('PROJECT_REGISTRY_SCHEMA=1.0')
      expect(authority).toContain(
        'PROJECT_REGISTRY_OWNER=DAEMON_GOVERNED_PROJECT_SPEC_MERGE',
      )
      expect(authority).toContain('RUNTIME_SCHEMA_FIELD=schema_version')
      expect(authority).toContain('RUNTIME_CORRUPT_INPUT_POLICY=FAIL_CLOSED')
      expect(authority).toContain('EMPTY_WAL_PERSISTENCE=FORBIDDEN')
    }
  })

  it('does not expose filesystem script discovery or an unapproved sample chain', async () => {
    const packageRoot = resolve(REPOSITORY_ROOT, 'packages/migration')
    const index = await readFile(resolve(packageRoot, 'src/index.ts'), 'utf8')
    const registry = await readFile(
      resolve(packageRoot, 'src/schema-descriptor-registry.ts'),
      'utf8',
    )
    const sourceFiles = await readdir(resolve(packageRoot, 'src'))
    const migrationFiles = await readdir(resolve(packageRoot, 'src/migrations')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      },
    )

    expect(sourceFiles).not.toContain('apply.ts')
    expect(sourceFiles).not.toContain('discovery.ts')
    expect(sourceFiles).not.toContain('daemon-startup-integration.ts')
    expect(migrationFiles).toEqual([])
    expect(index).not.toContain('discoverMigrationScripts')
    expect(index).toContain("export * from './schema-descriptor-registry'")
    expect(registry).not.toContain('compareVersions')
    expect(registry).not.toContain('discoverMigrationScripts')
  })

  it('cleans package output before compiling so removed migration surfaces cannot remain', async () => {
    const packageRoot = resolve(REPOSITORY_ROOT, 'packages/migration')
    const packageJson = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as { scripts: { build: string } }

    expect(packageJson.scripts.build).toBe('rm -rf dist && tsc')

    const distFiles = await readdir(resolve(packageRoot, 'dist'), {
      recursive: true,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const removedOutput of [
      'apply.js',
      'discovery.js',
      'migration-config.js',
      'daemon-startup-integration.js',
      'migrations/v1.0.0-to-v1.1.0.js',
    ]) {
      expect(distFiles).not.toContain(removedOutput)
    }
  })

})
