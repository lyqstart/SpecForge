/**
 * Unit tests for migration script discovery.
 *
 * Covers the strict, Result-based API in `src/discovery.ts` (task 2.2):
 * - Filename parsing & naming convention validation
 * - Skipping `_`-prefixed templates
 * - DAG / linear-chain validation (branches, merges, duplicates, self-loops,
 *   backward edges)
 * - Sorting from-version -> to-version
 * - Malformed filenames produce errors but do not throw
 *
 * Requirements: REQ-21
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  discoverMigrationScripts,
  parseScriptFilename,
  isSkippedFile,
  validateMigrationGraph,
  compareScriptVersions,
  type MigrationScript,
} from '../src/discovery'

// ---------------------------------------------------------------------------
// parseScriptFilename
// ---------------------------------------------------------------------------

describe('parseScriptFilename', () => {
  it('parses canonical vX.Y.Z-to-vA.B.C.ts', () => {
    const r = parseScriptFilename('v1.0.0-to-v1.1.0.ts')
    expect(r).not.toBeNull()
    expect(r?.fromVersion).toBe('1.0.0')
    expect(r?.toVersion).toBe('1.1.0')
    expect(r?.scriptName).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('accepts .js, .mjs, .cjs, .tsx extensions', () => {
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.js')).not.toBeNull()
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.mjs')).not.toBeNull()
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.cjs')).not.toBeNull()
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.tsx')).not.toBeNull()
  })

  it('rejects two-part versions (vX.Y-to-vA.B)', () => {
    expect(parseScriptFilename('v1.0-to-v1.1.ts')).toBeNull()
  })

  it('rejects leading zeros (v01.0.0-to-v1.1.0)', () => {
    expect(parseScriptFilename('v01.0.0-to-v1.1.0.ts')).toBeNull()
  })

  it('rejects pre-release suffixes (v1.0.0-alpha-to-v1.1.0)', () => {
    expect(parseScriptFilename('v1.0.0-alpha-to-v1.1.0.ts')).toBeNull()
  })

  it('rejects non-migration filenames', () => {
    expect(parseScriptFilename('README.md')).toBeNull()
    expect(parseScriptFilename('index.ts')).toBeNull()
    expect(parseScriptFilename('v1.0.0.ts')).toBeNull()
    expect(parseScriptFilename('migration.ts')).toBeNull()
  })

  it('rejects unknown extensions (.txt, .json)', () => {
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.txt')).toBeNull()
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.json')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isSkippedFile
// ---------------------------------------------------------------------------

describe('isSkippedFile', () => {
  it('skips files starting with _', () => {
    expect(isSkippedFile('_template.ts')).toBe(true)
    expect(isSkippedFile('_v1.0.0-to-v1.1.0.ts')).toBe(true)
  })

  it('does not skip normal files', () => {
    expect(isSkippedFile('v1.0.0-to-v1.1.0.ts')).toBe(false)
    expect(isSkippedFile('index.ts')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// compareScriptVersions
// ---------------------------------------------------------------------------

describe('compareScriptVersions', () => {
  it('orders by major then minor then patch', () => {
    expect(compareScriptVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareScriptVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareScriptVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareScriptVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareScriptVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('handles double-digit version components without lexical bug', () => {
    // String compare would say '1.10.0' < '1.2.0'; numeric must say >.
    expect(compareScriptVersions('1.10.0', '1.2.0')).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// validateMigrationGraph (pure, no fs)
// ---------------------------------------------------------------------------

const mk = (from: string, to: string, name?: string): MigrationScript => ({
  fromVersion: from,
  toVersion: to,
  scriptName: name ?? `v${from}-to-v${to}.ts`,
  filePath: name ?? `v${from}-to-v${to}.ts`,
})

describe('validateMigrationGraph', () => {
  it('accepts a valid linear chain', () => {
    const errors = validateMigrationGraph([
      mk('1.0.0', '1.1.0'),
      mk('1.1.0', '1.2.0'),
      mk('1.2.0', '2.0.0'),
    ])
    expect(errors).toEqual([])
  })

  it('accepts two disconnected linear chains (orphan subgraphs allowed)', () => {
    const errors = validateMigrationGraph([
      mk('1.0.0', '1.1.0'),
      mk('3.0.0', '3.1.0'),
    ])
    expect(errors).toEqual([])
  })

  it('flags self-loops (from == to)', () => {
    const errors = validateMigrationGraph([mk('1.0.0', '1.0.0')])
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('SELF_LOOP')
  })

  it('flags backward edges (to < from)', () => {
    const errors = validateMigrationGraph([mk('2.0.0', '1.9.0')])
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('BACKWARD_EDGE')
  })

  it('flags duplicate edges (same from, same to, two scripts)', () => {
    const errors = validateMigrationGraph([
      mk('1.0.0', '1.1.0', 'v1.0.0-to-v1.1.0.ts'),
      mk('1.0.0', '1.1.0', 'v1.0.0-to-v1.1.0.js'),
    ])
    const dup = errors.filter((e) => e.code === 'DUPLICATE_EDGE')
    expect(dup).toHaveLength(1)
    expect(dup[0].related).toEqual(
      expect.arrayContaining(['v1.0.0-to-v1.1.0.ts', 'v1.0.0-to-v1.1.0.js'])
    )
  })

  it('flags branches (same from, different to)', () => {
    const errors = validateMigrationGraph([
      mk('1.0.0', '1.1.0'),
      mk('1.0.0', '2.0.0'),
    ])
    const branch = errors.filter((e) => e.code === 'BRANCH')
    expect(branch).toHaveLength(1)
    expect(branch[0].related).toHaveLength(2)
  })

  it('flags merges (same to, different from)', () => {
    const errors = validateMigrationGraph([
      mk('1.0.0', '2.0.0'),
      mk('1.5.0', '2.0.0'),
    ])
    const merge = errors.filter((e) => e.code === 'MERGE')
    expect(merge).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// discoverMigrationScripts (filesystem)
// ---------------------------------------------------------------------------

describe('discoverMigrationScripts', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-discovery-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('returns ok=true and empty scripts for an empty directory', async () => {
    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toEqual([])
    expect(r.errors).toEqual([])
  })

  it('discovers a single migration script', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '// migration')
    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toHaveLength(1)
    expect(r.scripts[0].fromVersion).toBe('1.0.0')
    expect(r.scripts[0].toVersion).toBe('1.1.0')
    expect(r.scripts[0].scriptName).toBe('v1.0.0-to-v1.1.0.ts')
    expect(r.scripts[0].filePath).toContain('v1.0.0-to-v1.1.0.ts')
  })

  it('discovers and sorts a linear chain v1->v2->v3', async () => {
    // Write in random order to verify sort.
    await writeFile(join(dir, 'v1.2.0-to-v2.0.0.ts'), '')
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v1.1.0-to-v1.2.0.ts'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts.map((s) => s.fromVersion)).toEqual(['1.0.0', '1.1.0', '1.2.0'])
    expect(r.scripts.map((s) => s.toVersion)).toEqual(['1.1.0', '1.2.0', '2.0.0'])
  })

  it('detects branches (two scripts from same version) and reports BRANCH', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v1.0.0-to-v2.0.0.ts'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(false)
    const branch = r.errors.filter((e) => e.code === 'BRANCH')
    expect(branch).toHaveLength(1)
    expect(branch[0].related).toHaveLength(2)
  })

  it('skips files starting with _ (e.g. _template.ts)', async () => {
    await writeFile(join(dir, '_template.ts'), '')
    await writeFile(join(dir, '_v1.0.0-to-v1.1.0.ts'), '') // also skipped
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toHaveLength(1)
    expect(r.scripts[0].scriptName).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('reports MALFORMED_FILENAME for ts/js files with bad names', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '') // good
    await writeFile(join(dir, 'v1-to-v2.ts'), '') // bad: missing minor/patch
    await writeFile(join(dir, 'invalid-name.ts'), '') // bad
    await writeFile(join(dir, 'v1.0.0-alpha-to-v1.1.0.ts'), '') // bad: pre-release

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(false)
    const malformed = r.errors.filter((e) => e.code === 'MALFORMED_FILENAME')
    expect(malformed).toHaveLength(3)
    expect(r.scripts).toHaveLength(1)
  })

  it('ignores non-script files (README.md, .DS_Store) without errors', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'README.md'), '# readme')
    await writeFile(join(dir, '.DS_Store'), '')
    await writeFile(join(dir, 'notes.txt'), 'notes')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toHaveLength(1)
    expect(r.errors).toEqual([])
  })

  it('skips subdirectories', async () => {
    await mkdir(join(dir, 'subdir'))
    await writeFile(join(dir, 'subdir', 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v2.0.0-to-v2.1.0.ts'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toHaveLength(1)
    expect(r.scripts[0].fromVersion).toBe('2.0.0')
  })

  it('returns IO_ERROR for non-existent directory (does not throw)', async () => {
    const missing = join(dir, 'does-not-exist')
    const r = await discoverMigrationScripts(missing)
    expect(r.ok).toBe(false)
    expect(r.scripts).toEqual([])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].code).toBe('IO_ERROR')
  })

  it('detects duplicate edges across different extensions', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.js'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(false)
    const dup = r.errors.filter((e) => e.code === 'DUPLICATE_EDGE')
    expect(dup).toHaveLength(1)
  })

  it('detects merges (two scripts converging on same toVersion)', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v2.0.0.ts'), '')
    await writeFile(join(dir, 'v1.5.0-to-v2.0.0.ts'), '')

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.code === 'MERGE')).toBe(true)
  })

  it('combines multiple errors into a single result without throwing', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v1.0.0-to-v2.0.0.ts'), '') // BRANCH from 1.0.0
    await writeFile(join(dir, 'totally-broken.ts'), '') // MALFORMED
    await writeFile(join(dir, 'v3.0.0-to-v3.0.0.ts'), '') // SELF_LOOP

    const r = await discoverMigrationScripts(dir)
    expect(r.ok).toBe(false)
    const codes = r.errors.map((e) => e.code).sort()
    expect(codes).toEqual(
      expect.arrayContaining(['BRANCH', 'MALFORMED_FILENAME', 'SELF_LOOP'])
    )
  })
})
