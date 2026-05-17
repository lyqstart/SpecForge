/**
 * Unit tests for RecoveryEventLogger (Task 4.3)
 *
 * Validates:
 *  - `recovery.repaired` event structure matches Property 30 multi-sync
 *    readiness (schema_version, UUIDv7 eventId, monotonic ts, monotonicSeq,
 *    non-empty projectId, category='migration', action='recovery.repaired').
 *  - Payload faithfully carries RepairEngine state (rule, original/repaired
 *    flags, warnings, repaired_at, schema_version).
 *  - End-to-end integration with RepairEngine.detectAndRepair via `asHook()`.
 *  - projectId derivation from `projectRoot` is deterministic (SHA-256 first
 *    16 hex chars, identical to @specforge/observability).
 *  - Constructor input validation.
 *  - Monotonic clock: (ts, monotonicSeq) is strictly increasing across rapid
 *    successive emits.
 *
 * Requirements: 2.3, 2.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'

import {
  RecoveryEventLogger,
  createRecoveryEventLogger,
  generateEventId,
  calculateProjectId,
  type DaemonEvent,
  type DaemonEventSink,
} from '../src/recovery-event-logger'
import { detectAndRepair } from '../src/repair-engine'
import type { RecoveryRepairedEvent } from '../src/repair-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory sink that captures appended events.
 */
function createMemorySink(): DaemonEventSink & { events: DaemonEvent[]; initCalls: number } {
  const events: DaemonEvent[] = []
  let initCalls = 0
  return {
    events,
    get initCalls() {
      return initCalls
    },
    set initCalls(v: number) {
      initCalls = v
    },
    initialize: async () => {
      initCalls++
    },
    append: async (event) => {
      events.push(event)
    },
  }
}

async function tmpDir(prefix: string): Promise<string> {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function rmDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecoveryEventLogger — helpers', () => {
  it('generateEventId produces UUIDv7-shaped strings', () => {
    const uuidV7Re =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    for (let i = 0; i < 16; i++) {
      const id = generateEventId()
      expect(id).toMatch(uuidV7Re)
    }
  })

  it('generateEventId yields unique ids for many invocations', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(generateEventId())
    expect(ids.size).toBe(1000)
  })

  it('calculateProjectId returns 16 lowercase hex chars matching SHA-256(path)', () => {
    const path = '/some/project/root'
    const got = calculateProjectId(path)
    const expected = createHash('sha256').update(path).digest('hex').substring(0, 16)
    expect(got).toBe(expected)
    expect(got).toMatch(/^[0-9a-f]{16}$/)
  })

  it('calculateProjectId is deterministic across calls', () => {
    expect(calculateProjectId('/a/b')).toBe(calculateProjectId('/a/b'))
    expect(calculateProjectId('/a/b')).not.toBe(calculateProjectId('/a/c'))
  })
})

describe('RecoveryEventLogger — construction', () => {
  it('throws when neither projectId nor projectRoot is provided', () => {
    const sink = createMemorySink()
    expect(() => new RecoveryEventLogger({ sink } as any)).toThrowError(/projectId.*projectRoot/i)
  })

  it('derives projectId from projectRoot via SHA-256(path).slice(0,16)', () => {
    const sink = createMemorySink()
    const logger = new RecoveryEventLogger({ sink, projectRoot: '/proj/x' })
    expect(logger.getProjectId()).toBe(calculateProjectId('/proj/x'))
  })

  it('explicit projectId overrides projectRoot', () => {
    const sink = createMemorySink()
    const logger = new RecoveryEventLogger({
      sink,
      projectRoot: '/some/path',
      projectId: 'abcdef0123456789',
    })
    expect(logger.getProjectId()).toBe('abcdef0123456789')
  })

  it('createRecoveryEventLogger factory works', () => {
    const sink = createMemorySink()
    const logger = createRecoveryEventLogger({ sink, projectRoot: '/p' })
    expect(logger).toBeInstanceOf(RecoveryEventLogger)
  })
})

describe('RecoveryEventLogger.logRepair — event structure', () => {
  let sink: ReturnType<typeof createMemorySink>
  let logger: RecoveryEventLogger

  beforeEach(() => {
    sink = createMemorySink()
    logger = new RecoveryEventLogger({
      sink,
      projectRoot: '/test/project',
      actor: { id: 'daemon', name: 'Daemon', type: 'system' },
    })
  })

  it('produces a DaemonEvent with all Property 30 envelope fields', async () => {
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-01-02T03:04:05.000Z',
      schema_version: '1.0.0',
      rule_applied: 'rebuild_from_events',
      original_state: {
        events_corrupted: false,
        state_corrupted: true,
        design_missing: false,
      },
      repaired_state: {
        events_rebuilt: true,
        state_rolled_back: false,
        fresh_start: false,
      },
      warnings: [],
    }
    await logger.logRepair(repair)

    expect(sink.events).toHaveLength(1)
    const e = sink.events[0]

    // Property 30 envelope
    expect(e.schema_version).toBe('1.0')
    expect(e.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(typeof e.ts).toBe('number')
    expect(e.ts).toBeGreaterThan(0)
    expect(typeof e.monotonicSeq).toBe('number')
    expect(e.monotonicSeq).toBeGreaterThanOrEqual(0)
    expect(e.projectId).toBe(calculateProjectId('/test/project'))
    expect(e.projectId).not.toBe('')
    expect(e.category).toBe('migration')
    expect(e.action).toBe('recovery.repaired')
    expect(e.workItemId).toBeNull()
    expect(e.actor).toEqual({ id: 'daemon', name: 'Daemon', type: 'system' })
  })

  it('payload carries rule, original/repaired flags, warnings, repaired_at, schema_version', async () => {
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-05-01T00:00:00.000Z',
      schema_version: '2.1.0',
      rule_applied: 'rollback_to_requirements',
      original_state: {
        events_corrupted: false,
        state_corrupted: false,
        design_missing: true,
      },
      repaired_state: {
        events_rebuilt: false,
        state_rolled_back: true,
        fresh_start: false,
      },
      warnings: ['design.md missing'],
    }
    await logger.logRepair(repair)

    const p = sink.events[0].payload
    expect(p.rule_applied).toBe('rollback_to_requirements')
    expect(p.description).toMatch(/rolled back/i)
    expect(p.original_state).toEqual({
      events_corrupted: false,
      state_corrupted: false,
      design_missing: true,
    })
    expect(p.repaired_state).toEqual({
      events_rebuilt: false,
      state_rolled_back: true,
      fresh_start: false,
    })
    expect(p.warnings).toEqual(['design.md missing'])
    expect(p.repaired_at).toBe('2024-05-01T00:00:00.000Z')
    expect(p.schema_version).toBe('2.1.0')
  })

  it('initialize() is called lazily on the sink and only once', async () => {
    expect(sink.initCalls).toBe(0)
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-01-01T00:00:00.000Z',
      schema_version: '1.0.0',
      rule_applied: 'fresh_start',
      original_state: {
        events_corrupted: true,
        state_corrupted: true,
        design_missing: false,
      },
      repaired_state: {
        events_rebuilt: false,
        state_rolled_back: false,
        fresh_start: true,
      },
      warnings: ['both corrupted'],
    }
    await logger.logRepair(repair)
    await logger.logRepair(repair)
    await logger.logRepair(repair)
    expect(sink.initCalls).toBe(1)
    expect(sink.events).toHaveLength(3)
  })

  it('(ts, monotonicSeq) is strictly increasing across rapid emits', async () => {
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-01-01T00:00:00.000Z',
      schema_version: '1.0.0',
      rule_applied: 'rebuild_from_events',
      original_state: {
        events_corrupted: false,
        state_corrupted: true,
        design_missing: false,
      },
      repaired_state: {
        events_rebuilt: true,
        state_rolled_back: false,
        fresh_start: false,
      },
      warnings: [],
    }
    for (let i = 0; i < 50; i++) await logger.logRepair(repair)

    expect(sink.events).toHaveLength(50)
    for (let i = 1; i < sink.events.length; i++) {
      const a = sink.events[i - 1]
      const b = sink.events[i]
      // Strict ordering on (ts, monotonicSeq) — compare without losing
      // precision (ts is already in ns, so don't multiply further).
      const advanced = b.ts > a.ts || (b.ts === a.ts && b.monotonicSeq > a.monotonicSeq)
      expect(advanced).toBe(true)
    }
  })

  it('falls back to constructor schema version when event omits schema_version', async () => {
    const customLogger = new RecoveryEventLogger({
      sink,
      projectRoot: '/p',
      schemaVersion: '9.9.9',
    })
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-01-01T00:00:00.000Z',
      // schema_version intentionally empty
      schema_version: '' as unknown as string,
      rule_applied: 'use_state_with_warning',
      original_state: {
        events_corrupted: true,
        state_corrupted: false,
        design_missing: false,
      },
      repaired_state: {
        events_rebuilt: false,
        state_rolled_back: false,
        fresh_start: false,
      },
      warnings: ['events corrupted'],
    }
    await customLogger.logRepair(repair)
    expect(sink.events[0].payload.schema_version).toBe('9.9.9')
  })

  it('payload arrays/objects are deep-copied so the caller can mutate safely', async () => {
    const warnings = ['w1']
    const original = {
      events_corrupted: false,
      state_corrupted: true,
      design_missing: false,
    }
    const repair: RecoveryRepairedEvent = {
      event: 'recovery.repaired',
      timestamp: '2024-01-01T00:00:00.000Z',
      schema_version: '1.0.0',
      rule_applied: 'rebuild_from_events',
      original_state: original,
      repaired_state: {
        events_rebuilt: true,
        state_rolled_back: false,
        fresh_start: false,
      },
      warnings,
    }
    await logger.logRepair(repair)

    // Mutate caller-side
    warnings.push('w2')
    original.events_corrupted = true

    expect(sink.events[0].payload.warnings).toEqual(['w1'])
    expect(sink.events[0].payload.original_state.events_corrupted).toBe(false)
  })
})

describe('RecoveryEventLogger — integration with RepairEngine', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await tmpDir('recovery-event-logger')
  })
  afterEach(async () => {
    await rmDir(baseDir)
  })

  it('asHook() lets detectAndRepair emit a recovery.repaired event end-to-end', async () => {
    // Set up an inconsistent state: events.jsonl corrupted, state.json valid
    await fs.writeFile(join(baseDir, 'events.jsonl'), 'not json{', 'utf-8')
    await fs.writeFile(
      join(baseDir, 'state.json'),
      JSON.stringify({ phase: 'requirements', schema_version: '1.0.0' }),
      'utf-8'
    )

    const sink = createMemorySink()
    const recoveryLogger = new RecoveryEventLogger({
      sink,
      projectRoot: baseDir,
    })

    const result = await detectAndRepair({
      baseDir,
      eventLogger: recoveryLogger.asHook(),
    })

    expect(result.repaired).toBe(true)
    expect(result.eventLogged).toBe(true)
    expect(sink.events).toHaveLength(1)

    const e = sink.events[0]
    expect(e.category).toBe('migration')
    expect(e.action).toBe('recovery.repaired')
    expect(e.payload.rule_applied).toBe(result.ruleApplied)
    expect(e.payload.original_state.events_corrupted).toBe(true)
    expect(e.projectId).toBe(calculateProjectId(baseDir))
  })

  it('emits NO event when state is already consistent', async () => {
    const events = [{ event: 'start', schema_version: '1.0.0' }]
    await fs.writeFile(
      join(baseDir, 'events.jsonl'),
      events.map((x) => JSON.stringify(x)).join('\n'),
      'utf-8'
    )
    await fs.writeFile(
      join(baseDir, 'state.json'),
      JSON.stringify({ phase: 'requirements', schema_version: '1.0.0', event_count: 1 }),
      'utf-8'
    )

    const sink = createMemorySink()
    const recoveryLogger = new RecoveryEventLogger({ sink, projectRoot: baseDir })

    const result = await detectAndRepair({
      baseDir,
      eventLogger: recoveryLogger.asHook(),
    })

    // No repair → no event
    expect(result.eventLogged).toBe(false)
    expect(sink.events).toHaveLength(0)
  })

  it('failure inside the sink propagates as a warning, not as an exception', async () => {
    await fs.writeFile(join(baseDir, 'events.jsonl'), 'invalid{', 'utf-8')
    await fs.writeFile(
      join(baseDir, 'state.json'),
      JSON.stringify({ phase: 'requirements' }),
      'utf-8'
    )

    const failingSink: DaemonEventSink = {
      append: vi.fn().mockRejectedValue(new Error('disk full')),
    }
    const recoveryLogger = new RecoveryEventLogger({ sink: failingSink, projectRoot: baseDir })

    const result = await detectAndRepair({
      baseDir,
      eventLogger: recoveryLogger.asHook(),
    })

    expect(result.repaired).toBe(true)
    expect(result.eventLogged).toBe(false)
    expect(result.warnings).toContain('Failed to log repair event')
    expect(failingSink.append).toHaveBeenCalled()
  })
})
