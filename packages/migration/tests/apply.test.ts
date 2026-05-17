/**
 * Unit tests for the legacy migration apply module (`src/apply.ts`).
 *
 * NOTE: The strict, Result-based discovery API lives in `src/discovery.ts`
 * and is tested in `discovery.test.ts`. This file preserves coverage of the
 * older, lenient parser/finder still used by execution-plan code paths.
 *
 * Requirements: REQ-21
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseMigrationFilename,
  parseMigrationMetadata,
  discoverMigrationScripts,
  filterMigrationsForUpgrade,
  buildExecutionPlan,
  type MigrationScriptInfo,
} from '../src/apply'
import { join } from 'path'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'

describe('parseMigrationFilename', () => {
  it('should parse standard version format v1.0.0-to-v1.1.0.ts', () => {
    const result = parseMigrationFilename('v1.0.0-to-v1.1.0.ts')
    expect(result).not.toBeNull()
    expect(result?.fromVersion).toBe('1.0.0')
    expect(result?.toVersion).toBe('1.1.0')
    expect(result?.filename).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('should parse short version format v1.0-to-v2.0.ts', () => {
    const result = parseMigrationFilename('v1.0-to-v2.0.ts')
    expect(result).not.toBeNull()
    expect(result?.fromVersion).toBe('1.0')
    expect(result?.toVersion).toBe('2.0')
  })

  it('should parse .tsx extension', () => {
    const result = parseMigrationFilename('v1.0.0-to-v1.1.0.tsx')
    expect(result).not.toBeNull()
    expect(result?.fromVersion).toBe('1.0.0')
    expect(result?.toVersion).toBe('1.1.0')
  })

  it('should return null for non-migration files', () => {
    expect(parseMigrationFilename('README.md')).toBeNull()
    expect(parseMigrationFilename('index.ts')).toBeNull()
    expect(parseMigrationFilename('v1.0.0.js')).toBeNull()
    expect(parseMigrationFilename('invalid-name.ts')).toBeNull()
  })

  it('should handle case-insensitive extensions', () => {
    const result = parseMigrationFilename('V1.0.0-TO-V1.1.0.TS')
    expect(result).not.toBeNull()
    expect(result?.fromVersion).toBe('1.0.0')
    expect(result?.toVersion).toBe('1.1.0')
  })

  it('should handle pre-release versions', () => {
    const result = parseMigrationFilename('v1.0.0-alpha-to-v1.1.0.ts')
    expect(result?.fromVersion).toBe('1.0.0-alpha')
    expect(result?.toVersion).toBe('1.1.0')
  })
})

describe('apply.discoverMigrationScripts (legacy)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'apply-discovery-'))
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('should discover migration scripts in directory', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    await writeFile(join(tempDir, 'v1.1.0-to-v1.2.0.ts'), '// migration')

    const scripts = await discoverMigrationScripts(tempDir)
    expect(scripts).toHaveLength(2)
    expect(scripts[0].filename).toBe('v1.0.0-to-v1.1.0.ts')
    expect(scripts[1].filename).toBe('v1.1.0-to-v1.2.0.ts')
  })

  it('should return empty array when no migration scripts exist', async () => {
    await writeFile(join(tempDir, 'README.md'), '# Readme')
    const scripts = await discoverMigrationScripts(tempDir)
    expect(scripts).toHaveLength(0)
  })

  it('should ignore non-migration files', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    await writeFile(join(tempDir, 'index.ts'), '// index')
    await writeFile(join(tempDir, '.DS_Store'), '')

    const scripts = await discoverMigrationScripts(tempDir)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].filename).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('should set full path for each script', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    const scripts = await discoverMigrationScripts(tempDir)
    expect(scripts[0].path).toContain('v1.0.0-to-v1.1.0.ts')
  })
})

describe('filterMigrationsForUpgrade', () => {
  const scripts: MigrationScriptInfo[] = [
    { path: '', filename: 'v1.0.0-to-v1.1.0.ts', fromVersion: '1.0.0', toVersion: '1.1.0' },
    { path: '', filename: 'v1.1.0-to-v1.2.0.ts', fromVersion: '1.1.0', toVersion: '1.2.0' },
    { path: '', filename: 'v1.2.0-to-v2.0.0.ts', fromVersion: '1.2.0', toVersion: '2.0.0' },
    { path: '', filename: 'v2.0.0-to-v2.1.0.ts', fromVersion: '2.0.0', toVersion: '2.1.0' },
  ]

  it('should find consecutive migrations for upgrade', () => {
    const result = filterMigrationsForUpgrade(scripts, '1.0.0', '1.2.0')
    expect(result).toHaveLength(2)
    expect(result[0].fromVersion).toBe('1.0.0')
    expect(result[1].toVersion).toBe('1.2.0')
  })

  it('should return empty array when no upgrade needed', () => {
    expect(filterMigrationsForUpgrade(scripts, '1.1.0', '1.1.0')).toHaveLength(0)
  })

  it('should return empty array when no scripts match', () => {
    expect(filterMigrationsForUpgrade(scripts, '3.0.0', '4.0.0')).toHaveLength(0)
  })

  it('should return single migration for minor version bump', () => {
    const result = filterMigrationsForUpgrade(scripts, '1.0.0', '1.1.0')
    expect(result).toHaveLength(1)
    expect(result[0].fromVersion).toBe('1.0.0')
    expect(result[0].toVersion).toBe('1.1.0')
  })

  it('should handle multiple consecutive upgrades', () => {
    const result = filterMigrationsForUpgrade(scripts, '1.0.0', '2.1.0')
    expect(result).toHaveLength(4)
    expect(result[3].toVersion).toBe('2.1.0')
  })

  it('should stop at available scripts even if target not reached', () => {
    const result = filterMigrationsForUpgrade(scripts, '1.0.0', '5.0.0')
    expect(result).toHaveLength(4)
    expect(result[3].toVersion).toBe('2.1.0')
  })
})

describe('buildExecutionPlan', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'plan-test-'))
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('should build execution plan with scripts in order', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration 1')
    await writeFile(join(tempDir, 'v1.1.0-to-v1.2.0.ts'), '// migration 2')

    const plan = await buildExecutionPlan(tempDir, '1.0.0', '1.2.0')
    expect(plan.totalSteps).toBe(2)
    expect(plan.scripts).toHaveLength(2)
    expect(plan.willUpgradeFrom).toBe('1.0.0')
    expect(plan.willUpgradeTo).toBe('1.2.0')
  })

  it('should return empty plan when no migrations needed', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    const plan = await buildExecutionPlan(tempDir, '1.1.0', '1.1.0')
    expect(plan.totalSteps).toBe(0)
    expect(plan.scripts).toHaveLength(0)
  })

  it('should throw when migration path does not reach target', async () => {
    await writeFile(join(tempDir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    await expect(
      buildExecutionPlan(tempDir, '1.0.0', '2.0.0')
    ).rejects.toThrow('does not reach target version')
  })

  it('should calculate estimated duration', async () => {
    await writeFile(
      join(tempDir, 'v1.0.0-to-v1.1.0.ts'),
      `// migration\n/**\n * @estimatedDuration 500\n */\n`
    )
    const plan = await buildExecutionPlan(tempDir, '1.0.0', '1.1.0')
    expect(plan.estimatedDurationMs).toBeGreaterThan(0)
  })
})

describe('parseMigrationMetadata', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'meta-test-'))
  })

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('should parse @dependsOn metadata', async () => {
    const scriptPath = join(tempDir, 'v1.1.0-to-v1.2.0.ts')
    await writeFile(scriptPath, `/**\n * @dependsOn v1.0.0-to-v1.1.0\n */\n`)
    const result = await parseMigrationMetadata(scriptPath, {
      path: scriptPath,
      filename: 'v1.1.0-to-v1.2.0.ts',
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
    })
    expect(result.dependencies).toContain('v1.0.0-to-v1.1.0')
  })

  it('should parse @author metadata', async () => {
    const scriptPath = join(tempDir, 'v1.1.0-to-v1.2.0.ts')
    await writeFile(scriptPath, `/**\n * @author John Doe\n */\n`)
    const result = await parseMigrationMetadata(scriptPath, {
      path: scriptPath,
      filename: 'v1.1.0-to-v1.2.0.ts',
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
    })
    expect(result.author).toBe('John Doe')
  })

  it('should handle missing file gracefully', async () => {
    const result = await parseMigrationMetadata('/nonexistent/path.ts', {
      path: '/nonexistent/path.ts',
      filename: 'v1.1.0-to-v1.2.0.ts',
      fromVersion: '1.1.0',
      toVersion: '1.2.0',
    })
    expect(result.fromVersion).toBe('1.1.0')
    expect(result.toVersion).toBe('1.2.0')
  })
})
