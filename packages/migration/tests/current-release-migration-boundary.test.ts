import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')
const PRODUCT_SPEC_PATH = resolve(
  REPOSITORY_ROOT,
  'docs/product-specification/specforge-product-specification.md',
)

describe('deferred migration package boundary', () => {
  it('takes current product scope from SPS-1.0 and keeps schema validation separate from Migration', async () => {
    const productSpec = await readFile(PRODUCT_SPEC_PATH, 'utf8')

    expect(productSpec).toContain(
      '| @specforge/migration | REMOVE_CURRENT | Not a current product module |',
    )
    expect(productSpec).toContain('# 15. Persistent Schema Validation')
    expect(productSpec).toContain(
      '当前产品保留 schema validation，但不保留 Migration 产品模块。',
    )
    expect(productSpec).toContain(
      'schema validation contract 可以由中立 foundation 或各 file owner 共享实现，但不得因为复用代码而恢复 Migration 产品责任。',
    )
    expect(productSpec).toContain(
      '"ids": [\n        "@specforge/plugin-loader",\n        "@specforge/self-healing",\n        "@specforge/multimodal",\n        "@specforge/migration"\n      ],\n      "classification": "BUILT_NOT_ENABLED"',
    )
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
