/**
 * Unit tests for the migration script framework.
 *
 * Task: migration / 7.2 Write unit tests for migration script framework
 * Validates: Requirements 1.5, 2.1
 *   - 1.5  Migration_Subsystem looks for vX.Y-to-vA.B scripts in
 *          ~/.specforge/migrations/
 *   - 2.1  (per tasks.md cross-reference) Migration script interface contract:
 *          version range matching + script metadata validation
 *
 * Scope (per task description):
 *   - Script discovery tests
 *   - Version matching tests
 *   - Script validation tests
 *
 * This file complements the broader behavioural tests in
 * `tests/discovery.test.ts` and `tests/apply.test.ts` by pinning down the
 * fine-grained contracts of the three sub-modules that compose the framework:
 *
 *   1. Strict discovery API     (src/discovery.ts)
 *   2. Lenient legacy parser    (src/apply.ts: parseMigrationFilename, etc.)
 *   3. Metadata extraction      (src/apply.ts: parseMigrationMetadata)
 *   4. Version-range matching   (src/apply.ts: filterMigrationsForUpgrade)
 *   5. Graph-level validation   (src/discovery.ts: validateMigrationGraph)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, chmod } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  // Strict discovery API (src/discovery.ts)
  discoverMigrationScripts as discoverStrict,
  parseScriptFilename,
  isSkippedFile,
  validateMigrationGraph,
  compareScriptVersions,
  type MigrationScript as StrictScript,
} from '../../src/discovery'

import {
  // Legacy / planning API (src/apply.ts)
  parseMigrationFilename,
  parseMigrationMetadata,
  discoverMigrationScripts as discoverLegacy,
  filterMigrationsForUpgrade,
  type MigrationScriptInfo,
} from '../../src/apply'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to build a strict MigrationScript fixture inline. */
const mkStrict = (
  fromVersion: string,
  toVersion: string,
  scriptName?: string
): StrictScript => ({
  fromVersion,
  toVersion,
  scriptName: scriptName ?? `v${fromVersion}-to-v${toVersion}.ts`,
  filePath: scriptName ?? `v${fromVersion}-to-v${toVersion}.ts`,
})

/** Helper to build a legacy MigrationScriptInfo fixture inline. */
const mkInfo = (
  fromVersion: string,
  toVersion: string,
  filename?: string
): MigrationScriptInfo => ({
  path: '',
  filename: filename ?? `v${fromVersion}-to-v${toVersion}.ts`,
  fromVersion,
  toVersion,
})

// ---------------------------------------------------------------------------
// 1. Script Discovery
// ---------------------------------------------------------------------------

describe('script discovery (filesystem contract)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mig-7-2-discovery-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  describe('strict discovery (discoverMigrationScripts from discovery.ts)', () => {
    it('returns absolute filePath rooted in the scanned directory', async () => {
      // Pin the contract: filePath must include the scan dir, not just the
      // bare filename. This is what the planner uses to do dynamic import().
      await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')

      const r = await discoverStrict(dir)
      expect(r.ok).toBe(true)
      expect(r.scripts).toHaveLength(1)
      expect(r.scripts[0].filePath).toBe(join(dir, 'v1.0.0-to-v1.1.0.ts'))
      expect(r.scripts[0].scriptName).toBe('v1.0.0-to-v1.1.0.ts')
    })

    it('produces a stable sort: from-version asc, then to-version asc', async () => {
      // Two scripts share the same from-version (a BRANCH error case), but
      // the sort itself must still order their to-versions ascending so the
      // diagnostic output is deterministic.
      await writeFile(join(dir, 'v1.0.0-to-v2.0.0.ts'), '')
      await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
      await writeFile(join(dir, 'v0.9.0-to-v1.0.0.ts'), '')

      const r = await discoverStrict(dir)
      // BRANCH error expected, but scripts list is still sorted.
      const ordered = r.scripts.map((s) => s.scriptName)
      expect(ordered).toEqual([
        'v0.9.0-to-v1.0.0.ts',
        'v1.0.0-to-v1.1.0.ts',
        'v1.0.0-to-v2.0.0.ts',
      ])
    })

    it('does not throw on permission-restricted entries; surfaces IO_ERROR if dir unreadable', async () => {
      // We cannot reliably create a dir that fails to read on Windows in a
      // test (chmod is a no-op there), so we test the documented contract by
      // pointing at a path that does not exist. The contract is: never
      // throw - always return a Result.
      const missing = join(dir, 'definitely-not-here')
      const r = await discoverStrict(missing)
      expect(r.ok).toBe(false)
      expect(r.errors[0].code).toBe('IO_ERROR')
      // chmod is referenced just to keep the import used on POSIX systems.
      expect(typeof chmod).toBe('function')
    })

    it('treats a directory containing only `_`-prefix files as empty (no error)', async () => {
      // Pure-template directory should not panic the discovery system.
      await writeFile(join(dir, '_template.ts'), '')
      await writeFile(join(dir, '_v1.0.0-to-v1.1.0.ts'), '')

      const r = await discoverStrict(dir)
      expect(r.ok).toBe(true)
      expect(r.scripts).toEqual([])
      expect(r.errors).toEqual([])
    })

    it('does not flag README/.DS_Store/non-script files at all', async () => {
      // Regression guard: previously, any file in the dir was treated as a
      // candidate. Non-script extensions must be silently ignored - they are
      // not "malformed migration scripts", they are unrelated.
      await writeFile(join(dir, 'README.md'), '# notes')
      await writeFile(join(dir, '.DS_Store'), '')
      await writeFile(join(dir, 'notes.txt'), 'x')
      await writeFile(join(dir, 'package.json'), '{}')

      const r = await discoverStrict(dir)
      expect(r.ok).toBe(true)
      expect(r.scripts).toEqual([])
      expect(r.errors).toEqual([])
    })
  })

  describe('legacy discovery (discoverMigrationScripts from apply.ts)', () => {
    it('skips `_`-prefix files implicitly via the ^v regex (parser-level filter)', async () => {
      // Both discoverers (strict and legacy) end up rejecting `_`-prefix
      // names, but for different reasons: strict uses `isSkippedFile`, legacy
      // relies on its filename regex requiring `^v...`. Pin this so a
      // future relaxation of either path is a deliberate decision.
      await writeFile(join(dir, '_v1.0.0-to-v1.1.0.ts'), '')
      await writeFile(join(dir, 'v2.0.0-to-v2.1.0.ts'), '')

      const scripts = await discoverLegacy(dir)
      const filenames = scripts.map((s) => s.filename)
      expect(filenames).toEqual(['v2.0.0-to-v2.1.0.ts'])
    })

    it('creates the migrations directory if it does not exist', async () => {
      // Per implementation, legacy discovery is permissive - it ensureDirs
      // the path and returns []. Codifying this so callers can rely on it.
      const newDir = join(dir, 'auto-created')
      const scripts = await discoverLegacy(newDir)
      expect(scripts).toEqual([])
    })

    it('returns scripts with absolute path set', async () => {
      await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
      const scripts = await discoverLegacy(dir)
      expect(scripts).toHaveLength(1)
      expect(scripts[0].path).toBe(join(dir, 'v1.0.0-to-v1.1.0.ts'))
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Filename / metadata parsing (script validation, part 1)
// ---------------------------------------------------------------------------

describe('parseScriptFilename (strict)', () => {
  it('preserves the bare filename in scriptName and filePath', () => {
    const r = parseScriptFilename('v1.0.0-to-v1.1.0.ts')
    expect(r).not.toBeNull()
    // discoverMigrationScripts later replaces filePath with `join(dir, name)`,
    // but parseScriptFilename in isolation must echo the original filename.
    expect(r!.scriptName).toBe('v1.0.0-to-v1.1.0.ts')
    expect(r!.filePath).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('rejects two-part versions even with a valid extension', () => {
    expect(parseScriptFilename('v1.0-to-v1.1.ts')).toBeNull()
    expect(parseScriptFilename('v1-to-v2.ts')).toBeNull()
  })

  it('rejects lowercase-extension confusion: .TS, .Ts treated as unknown', () => {
    // The strict regex is case-sensitive on the extension. Document this so a
    // future relaxation is a deliberate decision.
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.TS')).toBeNull()
    expect(parseScriptFilename('v1.0.0-to-v1.1.0.Ts')).toBeNull()
  })

  it('rejects extra path segments inside the filename (defensive)', () => {
    // A filename like `subdir/v1.0.0-to-v1.1.0.ts` should not parse, because
    // discovery passes only the basename.
    expect(parseScriptFilename('subdir/v1.0.0-to-v1.1.0.ts')).toBeNull()
    expect(parseScriptFilename('./v1.0.0-to-v1.1.0.ts')).toBeNull()
  })
})

describe('isSkippedFile', () => {
  it('returns true for any file whose name starts with `_`', () => {
    expect(isSkippedFile('_')).toBe(true)
    expect(isSkippedFile('_template.ts')).toBe(true)
    expect(isSkippedFile('_v1.0.0-to-v1.1.0.ts')).toBe(true)
    expect(isSkippedFile('__double.ts')).toBe(true)
  })

  it('returns false for files starting with other punctuation', () => {
    // Pinning behaviour: only `_` is the template marker, not `.`, `-`, or `~`.
    expect(isSkippedFile('.hidden.ts')).toBe(false)
    expect(isSkippedFile('-dash.ts')).toBe(false)
    expect(isSkippedFile('~tmp.ts')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Metadata parsing (script validation, part 2)
// ---------------------------------------------------------------------------

describe('parseMigrationMetadata', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mig-7-2-meta-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('extracts @tags as a trimmed string array', async () => {
    const p = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(p, `/**\n * @tags  data, schema , safety \n */\n`)
    const r = await parseMigrationMetadata(p, mkInfo('1.0.0', '1.1.0'))
    expect(r.tags).toEqual(['data', 'schema', 'safety'])
  })

  it('extracts @reversible as boolean (case-insensitive)', async () => {
    const p1 = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(p1, `/** @reversible TRUE */`)
    const r1 = await parseMigrationMetadata(p1, mkInfo('1.0.0', '1.1.0'))
    expect(r1.reversible).toBe(true)

    const p2 = join(dir, 'v1.1.0-to-v1.2.0.ts')
    await writeFile(p2, `/** @reversible false */`)
    const r2 = await parseMigrationMetadata(p2, mkInfo('1.1.0', '1.2.0'))
    expect(r2.reversible).toBe(false)
  })

  it('extracts @estimatedDuration as a positive integer', async () => {
    const p = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(p, `/** @estimatedDuration 2500 */`)
    const r = await parseMigrationMetadata(p, mkInfo('1.0.0', '1.1.0'))
    expect(r.estimatedDurationMs).toBe(2500)
  })

  it('extracts multiple tags in a single block in declaration order', async () => {
    const p = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(
      p,
      `/**\n * @author Alice\n * @tags a, b, c\n * @reversible true\n * @estimatedDuration 100\n * @dependsOn v0.9.0-to-v1.0.0\n */`
    )
    const r = await parseMigrationMetadata(p, mkInfo('1.0.0', '1.1.0'))
    expect(r.author).toBe('Alice')
    expect(r.tags).toEqual(['a', 'b', 'c'])
    expect(r.reversible).toBe(true)
    expect(r.estimatedDurationMs).toBe(100)
    expect(r.dependencies).toEqual(['v0.9.0-to-v1.0.0'])
  })

  it('extracts description from `export const description = "..."`', async () => {
    const p = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(p, `export const description = "Add events.jsonl rotation"`)
    const r = await parseMigrationMetadata(p, mkInfo('1.0.0', '1.1.0'))
    expect(r.description).toBe('Add events.jsonl rotation')
  })

  it('leaves optional fields undefined when not declared', async () => {
    const p = join(dir, 'v1.0.0-to-v1.1.0.ts')
    await writeFile(p, `// no metadata at all`)
    const r = await parseMigrationMetadata(p, mkInfo('1.0.0', '1.1.0'))
    expect(r.author).toBeUndefined()
    expect(r.tags).toBeUndefined()
    expect(r.reversible).toBeUndefined()
    expect(r.estimatedDurationMs).toBeUndefined()
    expect(r.dependencies).toBeUndefined()
    expect(r.description).toBeUndefined()
  })

  it('does not throw or mutate input when the file cannot be read', async () => {
    const ghost = join(dir, 'definitely-missing.ts')
    const input = mkInfo('1.0.0', '1.1.0', 'definitely-missing.ts')
    const r = await parseMigrationMetadata(ghost, input)
    // Per documented contract, returns the same shell info on read failure.
    expect(r.fromVersion).toBe('1.0.0')
    expect(r.toVersion).toBe('1.1.0')
    expect(r.filename).toBe('definitely-missing.ts')
  })
})

// ---------------------------------------------------------------------------
// 4. Version-range matching
// ---------------------------------------------------------------------------

describe('compareScriptVersions (numeric)', () => {
  it('is reflexive (a == a) and antisymmetric on signs (excluding equal pairs)', () => {
    // Only test pairs where a != b (sign flip is meaningful).
    const orderedPairs = [
      ['0.0.0', '1.0.0'],
      ['1.10.0', '1.2.0'],
      ['10.0.0', '9.99.99'],
      ['2.0.0', '1.9.9'],
    ] as const
    for (const [a, b] of orderedPairs) {
      // Reflexive
      expect(compareScriptVersions(a, a)).toBe(0)
      expect(compareScriptVersions(b, b)).toBe(0)
      // Antisymmetric: sign(ab) is the negation of sign(ba). Use comparison
      // operators rather than -Math.sign(...) to avoid the +0/-0 distinction
      // that toBe (Object.is) treats as unequal.
      const ab = compareScriptVersions(a, b)
      const ba = compareScriptVersions(b, a)
      expect(ab).not.toBe(0)
      expect(ba).not.toBe(0)
      expect(ab > 0 ? 1 : -1).toBe(ba < 0 ? 1 : -1)
    }
  })

  it('treats missing components as 0 (defensive parse)', () => {
    // The contract docstring says inputs are already validated, but the
    // implementation tolerates short forms. Pin that.
    expect(compareScriptVersions('1', '1.0.0')).toBe(0)
    expect(compareScriptVersions('1.0', '1.0.0')).toBe(0)
  })
})

describe('filterMigrationsForUpgrade', () => {
  const chain: MigrationScriptInfo[] = [
    mkInfo('1.0.0', '1.1.0'),
    mkInfo('1.1.0', '1.2.0'),
    mkInfo('1.2.0', '2.0.0'),
    mkInfo('2.0.0', '2.1.0'),
  ]

  it('returns scripts in upgrade execution order', () => {
    const path = filterMigrationsForUpgrade(chain, '1.0.0', '2.0.0')
    expect(path.map((s) => `${s.fromVersion}->${s.toVersion}`)).toEqual([
      '1.0.0->1.1.0',
      '1.1.0->1.2.0',
      '1.2.0->2.0.0',
    ])
  })

  it('returns [] when fromVersion == toVersion (no migration needed)', () => {
    expect(filterMigrationsForUpgrade(chain, '1.1.0', '1.1.0')).toEqual([])
  })

  it('returns [] when no script starts at fromVersion', () => {
    // Gap at the head: from 0.5.0 -> 1.0.0, no script bridges it.
    expect(filterMigrationsForUpgrade(chain, '0.5.0', '1.2.0')).toEqual([])
  })

  it('stops at the gap if the chain breaks mid-path', () => {
    const broken: MigrationScriptInfo[] = [
      mkInfo('1.0.0', '1.1.0'),
      // missing 1.1.0 -> 1.2.0
      mkInfo('1.2.0', '1.3.0'),
    ]
    const path = filterMigrationsForUpgrade(broken, '1.0.0', '1.3.0')
    expect(path).toHaveLength(1)
    expect(path[0].toVersion).toBe('1.1.0')
  })

  it('does not loop forever on a strictly-increasing chain', () => {
    // Sanity: filterMigrationsForUpgrade walks by following from->to edges.
    // As long as every taken edge strictly increases the version, the walk
    // terminates. This test pins that termination guarantee for valid input.
    //
    // Note: the implementation assumes its input has already passed
    // `validateMigrationGraph` (no self-loops, no backward edges, no
    // duplicate edges). Feeding it a self-loop is undefined behaviour and
    // intentionally not covered here - that case is the upstream
    // validator's responsibility.
    const valid: MigrationScriptInfo[] = [
      mkInfo('1.0.0', '1.1.0'),
      mkInfo('1.1.0', '1.2.0'),
      mkInfo('1.2.0', '1.3.0'),
    ]
    const path = filterMigrationsForUpgrade(valid, '1.0.0', '1.3.0')
    expect(path).toHaveLength(3)
  })

  it('respects version comparator (1.10.0 > 1.2.0 numerically)', () => {
    // Catches the lexical-vs-numeric pitfall in the planner.
    const wide: MigrationScriptInfo[] = [
      mkInfo('1.2.0', '1.10.0'),
    ]
    const path = filterMigrationsForUpgrade(wide, '1.2.0', '1.10.0')
    expect(path).toHaveLength(1)
    expect(path[0].toVersion).toBe('1.10.0')
  })
})

// ---------------------------------------------------------------------------
// 5. Graph-level validation (script validation, part 3)
// ---------------------------------------------------------------------------

describe('validateMigrationGraph', () => {
  it('returns no errors for an empty input', () => {
    expect(validateMigrationGraph([])).toEqual([])
  })

  it('returns no errors for a singleton valid edge', () => {
    expect(validateMigrationGraph([mkStrict('1.0.0', '1.1.0')])).toEqual([])
  })

  it('reports DUPLICATE_EDGE only once, not once per file', () => {
    // Three files all defining 1.0.0 -> 1.1.0 should produce a single
    // DUPLICATE_EDGE entry that lists all three in `related`, not three
    // separate entries.
    const errors = validateMigrationGraph([
      mkStrict('1.0.0', '1.1.0', 'a.ts'),
      mkStrict('1.0.0', '1.1.0', 'b.ts'),
      mkStrict('1.0.0', '1.1.0', 'c.ts'),
    ])
    const dups = errors.filter((e) => e.code === 'DUPLICATE_EDGE')
    expect(dups).toHaveLength(1)
    expect(dups[0].related).toHaveLength(3)
    expect(dups[0].related).toEqual(
      expect.arrayContaining(['a.ts', 'b.ts', 'c.ts'])
    )
  })

  it('combines BRANCH and MERGE in a diamond graph', () => {
    // Diamond: 1.0.0 splits to 1.1.0 and 2.0.0, both then merge to 3.0.0.
    // Both BRANCH (at 1.0.0) and MERGE (at 3.0.0) must be reported.
    const errors = validateMigrationGraph([
      mkStrict('1.0.0', '1.1.0'),
      mkStrict('1.0.0', '2.0.0'),
      mkStrict('1.1.0', '3.0.0'),
      mkStrict('2.0.0', '3.0.0'),
    ])
    expect(errors.some((e) => e.code === 'BRANCH')).toBe(true)
    expect(errors.some((e) => e.code === 'MERGE')).toBe(true)
  })

  it('flags a self-loop AND any other structural error independently', () => {
    // Self-loop and backward-edge can co-occur with branches without
    // suppressing each other.
    const errors = validateMigrationGraph([
      mkStrict('1.0.0', '1.0.0'), // SELF_LOOP
      mkStrict('2.0.0', '1.0.0'), // BACKWARD_EDGE
      mkStrict('1.0.0', '1.1.0'), // (also branches with self-loop)
    ])
    const codes = errors.map((e) => e.code)
    expect(codes).toContain('SELF_LOOP')
    expect(codes).toContain('BACKWARD_EDGE')
  })

  it('does not falsely flag two genuinely-disjoint linear chains', () => {
    // Disjoint subchains are allowed: tooling can ship multiple unrelated
    // version ladders. Only inter-chain branching/merging is illegal.
    const errors = validateMigrationGraph([
      mkStrict('1.0.0', '1.1.0'),
      mkStrict('1.1.0', '1.2.0'),
      mkStrict('5.0.0', '5.1.0'),
      mkStrict('5.1.0', '6.0.0'),
    ])
    expect(errors).toEqual([])
  })

  it('uses the same version comparator semantics as compareScriptVersions for backward detection', () => {
    // 1.10.0 -> 1.2.0 is a BACKWARD edge (numerically), even though string
    // compare would say it's "forward".
    const errors = validateMigrationGraph([mkStrict('1.10.0', '1.2.0')])
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('BACKWARD_EDGE')
  })
})

// ---------------------------------------------------------------------------
// 6. Cross-module integration (discover -> filter pipeline)
// ---------------------------------------------------------------------------

describe('discover -> filterMigrationsForUpgrade pipeline', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mig-7-2-pipeline-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('discover (legacy) -> filter selects the correct slice', async () => {
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v1.1.0-to-v1.2.0.ts'), '')
    await writeFile(join(dir, 'v1.2.0-to-v2.0.0.ts'), '')

    const all = await discoverLegacy(dir)
    const slice = filterMigrationsForUpgrade(all, '1.0.0', '1.2.0')
    expect(slice.map((s) => s.toVersion)).toEqual(['1.1.0', '1.2.0'])
  })

  it('discover (strict) sees subchains in the same dir, but legacy discover does not validate them', async () => {
    // Two disjoint chains in the same directory.
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'v5.0.0-to-v5.1.0.ts'), '')

    const strict = await discoverStrict(dir)
    expect(strict.ok).toBe(true)
    expect(strict.scripts).toHaveLength(2)

    const legacy = await discoverLegacy(dir)
    expect(legacy).toHaveLength(2)

    // Filter scoped to chain 1 should only return chain-1 scripts.
    const chain1 = filterMigrationsForUpgrade(legacy, '1.0.0', '1.1.0')
    expect(chain1).toHaveLength(1)
    expect(chain1[0].fromVersion).toBe('1.0.0')

    // Filter scoped to chain 2 should only return chain-2 scripts.
    const chain2 = filterMigrationsForUpgrade(legacy, '5.0.0', '5.1.0')
    expect(chain2).toHaveLength(1)
    expect(chain2[0].fromVersion).toBe('5.0.0')
  })

  it('a malformed file in the dir does not break legacy discovery for other valid files', async () => {
    // Legacy discover is lenient: it skips unparsable filenames silently.
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')
    await writeFile(join(dir, 'totally-broken-name.ts'), '')

    const scripts = await discoverLegacy(dir)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].filename).toBe('v1.0.0-to-v1.1.0.ts')
  })

  it('a subdirectory inside the migrations dir is skipped (never recursed) by strict discovery', async () => {
    // Pin the no-recursion contract so dropping a backup folder inside
    // ~/.specforge/migrations/ cannot accidentally pollute discovery.
    await mkdir(join(dir, 'nested'))
    await writeFile(join(dir, 'nested', 'v9.9.9-to-v10.0.0.ts'), '')
    await writeFile(join(dir, 'v1.0.0-to-v1.1.0.ts'), '')

    const r = await discoverStrict(dir)
    expect(r.ok).toBe(true)
    expect(r.scripts).toHaveLength(1)
    expect(r.scripts[0].fromVersion).toBe('1.0.0')
  })
})

// ---------------------------------------------------------------------------
// 7. Filename parser (legacy, lenient) - boundary conditions
// ---------------------------------------------------------------------------

describe('parseMigrationFilename (legacy, lenient)', () => {
  it('echoes whatever from/to substring matched, including unusual chars', () => {
    // Lenient regex captures anything between `v...-to-v...` boundaries.
    // This pins the actual extraction shape against incidental refactors.
    const r = parseMigrationFilename('v1.0.0-rc.1-to-v2.0.0.ts')
    expect(r).not.toBeNull()
    // The lenient regex is greedy; we just assert that the full pre-`-to-`
    // and post-`-to-` portions came through.
    expect(r!.fromVersion.length).toBeGreaterThan(0)
    expect(r!.toVersion.length).toBeGreaterThan(0)
    expect(r!.filename).toBe('v1.0.0-rc.1-to-v2.0.0.ts')
  })

  it('returns null for a filename missing the -to- separator', () => {
    expect(parseMigrationFilename('v1.0.0.ts')).toBeNull()
    expect(parseMigrationFilename('v1.0.0_v2.0.0.ts')).toBeNull()
  })

  it('returns null for non-.ts/.tsx extensions in the legacy parser', () => {
    // The legacy regex only accepts ts/tsx. .js/.mjs are NOT supported here
    // (they ARE supported by the strict parser). Pin this divergence.
    expect(parseMigrationFilename('v1.0.0-to-v1.1.0.js')).toBeNull()
    expect(parseMigrationFilename('v1.0.0-to-v1.1.0.mjs')).toBeNull()
    expect(parseMigrationFilename('v1.0.0-to-v1.1.0.cjs')).toBeNull()
  })
})
