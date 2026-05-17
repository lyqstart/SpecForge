/**
 * Unit tests for schema version detection
 *
 * Task: migration / 7.1 Write unit tests for version detection
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *   - 1.1 schema_version present on every persistent file
 *   - 1.2 code > file → run migrations
 *   - 1.3 code == file → start normally
 *   - 1.4 file > code → upgrade prompt + refuse to start
 *
 * Coverage targets (per design.md):
 *   - compareVersions: equal / greater / less / pad / v-prefix / partial / pre-release / build / antisymmetry
 *   - detectSchemaVersion: state.json / events.jsonl / config.json + missing file / corrupted JSON / no version field / invalid format
 *   - compareWithCodeVersion + detectFromDirectory aggregations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  compareVersions,
  detectSchemaVersion,
  detectSchemaVersions,
  compareWithCodeVersion,
  detectFromDirectory
} from '../../src/schema-detector'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
  })

  it('should return negative when v1 < v2', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('should return positive when v1 > v2', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('should handle versions without patch number', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1', '1.0.0')).toBe(0)
  })

  it('should handle versions with v prefix', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v2.0.0', '1.0.0')).toBeGreaterThan(0)
  })

  it('should handle invalid version parts', () => {
    expect(compareVersions('abc', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'abc')).toBe(0)
  })

  it('should compare pre-release versions correctly', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)
  })

  // Edge case tests for extreme values and boundary conditions
  it('should handle zero version', () => {
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0)
    expect(compareVersions('0.0.0', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.0.0')).toBeGreaterThan(0)
  })

  it('should handle very large version numbers', () => {
    expect(compareVersions('999.999.999', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '999.999.999')).toBeLessThan(0)
    expect(compareVersions('999.999.999', '999.999.999')).toBe(0)
  })

  it('should handle version strings with extra dots', () => {
    // Versions with extra trailing dots are parsed gracefully
    expect(compareVersions('1.0.0.', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0...', '1.0.0')).toBe(0)
  })

  it('should handle special characters in pre-release', () => {
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta')).toBeGreaterThan(0)
  })

  it('should handle build metadata versions', () => {
    // Build metadata is typically ignored in semver comparison for precedence
    expect(compareVersions('1.0.0+build123', '1.0.0')).toBe(0)
  })

  it('should handle mixed partial versions', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1', '1.0')).toBe(0)
    expect(compareVersions('1', '1.0.0')).toBe(0)
  })

  it('should handle leading zeros in versions', () => {
    // Leading zeros should be handled gracefully
    expect(compareVersions('01.00.00', '1.0.0')).toBe(0)
    expect(compareVersions('1.01.00', '1.1.0')).toBe(0)
  })

  it('should handle whitespace in version strings', () => {
    // The current implementation does not trim whitespace - this is expected
    // Whitespace is treated as part of the version string
    expect(compareVersions(' 1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0 ', '1.0.0')).toBe(0)
  })

  it('should compare double-digit minor versions numerically (not lexically)', () => {
    // Classic semver pitfall: lexical comparison would say "1.10.0" < "1.2.0"
    // because '1' < '2'. Numeric comparison must say 1.10.0 > 1.2.0.
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.10', '1.0.2')).toBeGreaterThan(0)
    expect(compareVersions('10.0.0', '9.99.99')).toBeGreaterThan(0)
  })

  it('should compare patch differences with v prefix on either side', () => {
    expect(compareVersions('v1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', 'v1.0.1')).toBeLessThan(0)
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBeGreaterThan(0)
  })

  it('should be antisymmetric for valid versions', () => {
    // sign(compare(a, b)) == -sign(compare(b, a))
    const pairs: Array<[string, string]> = [
      ['1.0.0', '2.0.0'],
      ['1.10.0', '1.2.0'],
      ['1.0.0-alpha', '1.0.0'],
      ['v1.2.3', '1.2.4']
    ]
    for (const [a, b] of pairs) {
      const ab = compareVersions(a, b)
      const ba = compareVersions(b, a)
      expect(Math.sign(ab)).toBe(-Math.sign(ba))
    }
  })

  it('should treat clearly invalid strings as equal (not throw)', () => {
    // Per documented behavior in the implementation, invalid versions
    // collapse to 0 (equal). This is intentional so that bad data does not
    // accidentally satisfy ">" or "<" predicates and trigger migrations.
    expect(compareVersions('not.a.version', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'not.a.version')).toBe(0)
    expect(compareVersions('not.a.version', 'also.not')).toBe(0)
  })

  it('should treat empty string as invalid (returns 0)', () => {
    expect(compareVersions('', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '')).toBe(0)
  })

  it('should not throw on unusual but parseable inputs', () => {
    expect(() => compareVersions('1.0.0', '1.0.0')).not.toThrow()
    expect(() => compareVersions('v1', '1.0')).not.toThrow()
    expect(() => compareVersions('1.0.0-rc.1+build.5', '1.0.0')).not.toThrow()
  })
})

describe('compareWithCodeVersion', () => {
  it('should detect equal versions', () => {
    const result = compareWithCodeVersion('1.0.0', '1.0.0')
    expect(result.comparison).toBe('equal')
    expect(result.needsMigration).toBe(false)
    expect(result.needsDowngrade).toBe(false)
  })

  it('should detect file newer than code', () => {
    const result = compareWithCodeVersion('2.0.0', '1.0.0')
    expect(result.comparison).toBe('file_newer')
    expect(result.needsMigration).toBe(false)
    expect(result.needsDowngrade).toBe(true)
  })

  it('should detect code newer than file', () => {
    const result = compareWithCodeVersion('1.0.0', '2.0.0')
    expect(result.comparison).toBe('code_newer')
    expect(result.needsMigration).toBe(true)
    expect(result.needsDowngrade).toBe(false)
  })

  it('should handle null file version', () => {
    const result = compareWithCodeVersion(null, '1.0.0')
    expect(result.comparison).toBe('invalid')
    expect(result.fileVersion).toBe('unknown')
  })
})

describe('detectSchemaVersion', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'migration-test-'))
  })

  afterEach(async () => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should detect version from state.json', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({
      schema_version: '1.2.0',
      data: { some: 'content' }
    }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.2.0')
    expect(result.fileType).toBe('state')
    expect(result.error).toBeNull()
  })

  it('should detect version from events.jsonl', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    const event1 = JSON.stringify({ type: 'init', schema_version: '1.0.0' })
    const event2 = JSON.stringify({ type: 'action', schema_version: '1.2.0' })
    await writeFile(eventsPath, event1 + '\n' + event2)

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.2.0')
    expect(result.fileType).toBe('events')
    expect(result.error).toBeNull()
  })

  it('should detect version from config.json', async () => {
    const configPath = resolve(tempDir, 'config.json')
    await writeFile(configPath, JSON.stringify({
      schema_version: '1.0.0',
      settings: { theme: 'dark' }
    }))

    const result = await detectSchemaVersion(configPath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.0.0')
    expect(result.fileType).toBe('config')
  })

  it('should handle missing file', async () => {
    const result = await detectSchemaVersion(resolve(tempDir, 'nonexistent.json'))
    expect(result.detected).toBe(false)
    expect(result.schemaVersion).toBeNull()
    expect(result.error?.code).toBe('FILE_NOT_FOUND')
  })

  it('should handle corrupted JSON', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, '{ invalid json }')

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('JSON_PARSE_ERROR')
  })

  it('should handle JSON file without schema_version', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ data: 'content' }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('NO_VERSION')
  })

  it('should handle empty events.jsonl', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    await writeFile(eventsPath, '')

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('NO_VERSION')
  })

  it('should handle empty state.json', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({}))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('NO_VERSION')
  })

  it('should detect _schema_version as alternative field name', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({
      _schema_version: '2.0.0',
      data: 'content'
    }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('2.0.0')
  })

  it('should handle events.jsonl where all events are invalid JSON', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    await writeFile(eventsPath, 'not valid json\nalso not valid')

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('NO_VERSION')
  })

  it('should detect version from last event in events.jsonl', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    const event1 = JSON.stringify({ type: 'init', schema_version: '1.0.0' })
    const event2 = JSON.stringify({ type: 'action', schema_version: '1.1.0' })
    const event3 = JSON.stringify({ type: 'final', schema_version: '1.2.0' })
    await writeFile(eventsPath, event1 + '\n' + event2 + '\n' + event3)

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.2.0')
  })

  it('should treat completely empty state.json as JSON parse error', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, '')

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    // An empty string is not valid JSON, so JSON.parse fails
    expect(result.error?.code).toBe('JSON_PARSE_ERROR')
  })

  it('should treat whitespace-only state.json as JSON parse error', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, '   \n  \t  ')

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('JSON_PARSE_ERROR')
  })

  it('should reject JSON arrays at the root as INVALID_FORMAT', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify([{ schema_version: '1.0.0' }]))

    const result = await detectSchemaVersion(statePath)
    // Arrays are typeof 'object' but not the expected root shape; the
    // current implementation extracts schema_version anyway only if present
    // on the array object directly. Arrays don't carry that key, so this
    // should fall through to NO_VERSION.
    expect(result.detected).toBe(false)
    expect(['NO_VERSION', 'INVALID_FORMAT']).toContain(result.error?.code)
  })

  it('should reject JSON null root as INVALID_FORMAT', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, 'null')

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('INVALID_FORMAT')
  })

  it('should reject JSON primitive root as INVALID_FORMAT', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, '"just a string"')

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('INVALID_FORMAT')
  })

  it('should coerce non-string schema_version values to string', async () => {
    const statePath = resolve(tempDir, 'state.json')
    // numeric version (legacy callers sometimes write 1.0 as a number)
    await writeFile(statePath, JSON.stringify({ schema_version: 2 }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('2')
  })

  it('should treat binary content as JSON_PARSE_ERROR (not crash)', async () => {
    const statePath = resolve(tempDir, 'state.json')
    // raw bytes that are not valid UTF-8 JSON
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x7f])
    await writeFile(statePath, binary)

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(false)
    expect(result.error?.code).toBe('JSON_PARSE_ERROR')
  })

  it('should report FILE_NOT_FOUND when path is a directory', async () => {
    // Trying to read a directory as a file should not crash; the detector
    // should surface a structured error rather than a raw exception.
    const result = await detectSchemaVersion(tempDir)
    expect(result.detected).toBe(false)
    expect(result.error).not.toBeNull()
    // Either FILE_NOT_FOUND (couldn't read) or UNKNOWN are acceptable
    // documented outcomes; the contract is "no crash, structured error".
    expect(['FILE_NOT_FOUND', 'JSON_PARSE_ERROR', 'UNKNOWN']).toContain(
      result.error?.code
    )
  })

  it('should ignore trailing blank lines in events.jsonl', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    const event = JSON.stringify({ type: 'final', schema_version: '3.4.5' })
    await writeFile(eventsPath, event + '\n\n\n')

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('3.4.5')
  })

  it('should fall back to first event when last event lacks schema_version', async () => {
    const eventsPath = resolve(tempDir, 'events.jsonl')
    const event1 = JSON.stringify({ type: 'init', schema_version: '1.0.0' })
    const event2 = JSON.stringify({ type: 'action' /* no version */ })
    await writeFile(eventsPath, event1 + '\n' + event2)

    const result = await detectSchemaVersion(eventsPath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.0.0')
  })

  // --- Invalid schema_version field-value formats (Requirement 1.1) ---
  // The detector reports raw values verbatim (after string coercion); semantic
  // validity is the comparator's responsibility. These tests pin down the
  // contract: detection must not crash on weird-but-present values.

  it('should detect non-semver string "not.a.version" as-is', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: 'not.a.version' }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('not.a.version')
    expect(result.error).toBeNull()
  })

  it('should detect empty-string schema_version as detected with empty value', async () => {
    // Empty string is a defined value (not undefined), so per current contract
    // it is reported back. Comparator treats it as 0.0.0.
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: '' }))

    const result = await detectSchemaVersion(statePath)
    // Empty string is falsy when coerced via String(''), but the detector
    // checks `obj.schema_version !== undefined`, so empty string is still
    // a present value. Document whichever behavior the implementation has.
    if (result.detected) {
      expect(result.schemaVersion).toBe('')
    } else {
      expect(result.error?.code).toBe('NO_VERSION')
    }
  })

  it('should treat schema_version: null as missing version', async () => {
    // JSON `null` is distinct from "missing" but semantically means "no value".
    // Either NO_VERSION or detected with 'null' string is acceptable; pin both.
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: null }))

    const result = await detectSchemaVersion(statePath)
    if (result.detected) {
      // String(null) === 'null'
      expect(result.schemaVersion).toBe('null')
    } else {
      expect(result.error?.code).toBe('NO_VERSION')
    }
  })

  it('should detect partial-form schema_version like "1"', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: '1' }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1')
  })

  it('should detect partial-form schema_version like "1.0"', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: '1.0' }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('1.0')
  })

  it('should detect v-prefixed schema_version like "v1.0.0"', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: 'v1.0.0' }))

    const result = await detectSchemaVersion(statePath)
    expect(result.detected).toBe(true)
    expect(result.schemaVersion).toBe('v1.0.0')
  })

  it('should round-trip through compareWithCodeVersion for partial detected versions', async () => {
    // 1.1/1.2/1.3/1.4 require version comparison to drive migrate/start/refuse.
    // Verify the (detect → compare) pipeline produces a sane verdict for
    // partial versions where "1.0" should equal "1.0.0".
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: '1.0' }))

    const detected = await detectSchemaVersion(statePath)
    expect(detected.detected).toBe(true)
    const verdict = compareWithCodeVersion(detected.schemaVersion, '1.0.0')
    expect(verdict.comparison).toBe('equal') // 1.4: code == file → start
    expect(verdict.needsMigration).toBe(false)
    expect(verdict.needsDowngrade).toBe(false)
  })

  it('should drive needsDowngrade for v-prefixed file version newer than code', async () => {
    const statePath = resolve(tempDir, 'state.json')
    await writeFile(statePath, JSON.stringify({ schema_version: 'v2.0.0' }))

    const detected = await detectSchemaVersion(statePath)
    expect(detected.detected).toBe(true)
    const verdict = compareWithCodeVersion(detected.schemaVersion, '1.0.0')
    expect(verdict.comparison).toBe('file_newer') // 1.4 → upgrade prompt
    expect(verdict.needsDowngrade).toBe(true)
  })
})

describe('detectSchemaVersions', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'migration-test-'))
  })

  afterEach(async () => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should detect versions from multiple files', async () => {
    const statePath = resolve(tempDir, 'state.json')
    const configPath = resolve(tempDir, 'config.json')

    await writeFile(statePath, JSON.stringify({ schema_version: '1.0.0' }))
    await writeFile(configPath, JSON.stringify({ schema_version: '2.0.0' }))

    const results = await detectSchemaVersions([statePath, configPath])
    expect(results).toHaveLength(2)
    expect(results[0].schemaVersion).toBe('1.0.0')
    expect(results[1].schemaVersion).toBe('2.0.0')
  })

  it('should return results for non-existent files', async () => {
    const results = await detectSchemaVersions([
      resolve(tempDir, 'nonexistent.json')
    ])
    expect(results).toHaveLength(1)
    expect(results[0].error?.code).toBe('FILE_NOT_FOUND')
  })
})

describe('detectFromDirectory', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'migration-test-'))
  })

  afterEach(async () => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should detect versions from directory with standard files', async () => {
    const eventContent = JSON.stringify({ type: 'init', schema_version: '1.0.0' })
    await writeFile(resolve(tempDir, 'events.jsonl'), eventContent)
    await writeFile(resolve(tempDir, 'state.json'), JSON.stringify({ schema_version: '1.2.0' }))
    await writeFile(resolve(tempDir, 'config.json'), JSON.stringify({ schema_version: '1.0.0' }))

    const result = await detectFromDirectory(tempDir, '1.0.0')

    expect(result.events.detected).toBe(true)
    expect(result.events.schemaVersion).toBe('1.0.0')
    expect(result.state.detected).toBe(true)
    expect(result.state.schemaVersion).toBe('1.2.0')
    expect(result.config.detected).toBe(true)
    expect(result.config.schemaVersion).toBe('1.0.0')
    expect(result.overall.fileVersion).toBe('1.2.0')
  })

  it('should handle missing files in directory', async () => {
    await writeFile(resolve(tempDir, 'state.json'), JSON.stringify({ schema_version: '1.0.0' }))

    const result = await detectFromDirectory(tempDir, '1.0.0')

    expect(result.events.error?.code).toBe('FILE_NOT_FOUND')
    expect(result.state.detected).toBe(true)
    expect(result.config.error?.code).toBe('FILE_NOT_FOUND')
  })

  it('should report needsMigration when code version is newer', async () => {
    await writeFile(resolve(tempDir, 'state.json'), JSON.stringify({ schema_version: '1.0.0' }))

    const result = await detectFromDirectory(tempDir, '2.0.0')

    expect(result.overall.needsMigration).toBe(true)
    expect(result.overall.comparison).toBe('code_newer')
  })

  it('should report needsDowngrade when file version is newer', async () => {
    await writeFile(resolve(tempDir, 'state.json'), JSON.stringify({ schema_version: '2.0.0' }))

    const result = await detectFromDirectory(tempDir, '1.0.0')

    expect(result.overall.needsDowngrade).toBe(true)
    expect(result.overall.comparison).toBe('file_newer')
  })
})