/**
 * Recovery Event Logger (Task 4.3)
 *
 * Bridges RepairEngine's internal `RecoveryRepairedEvent` to the Daemon's
 * event-logging WAL (typically `@specforge/observability`'s EventLogger which
 * implements fsync-before-state crash-safe semantics).
 *
 * ## Design
 *
 * 1. **Structural decoupling.** This module accepts any object satisfying the
 *    `DaemonEventSink` shape (`append(event)` + optional `initialize()`).
 *    The migration package therefore does **not** import
 *    `@specforge/observability` directly — at runtime the Daemon wires the
 *    real EventLogger in, and tests can substitute an in-memory sink.
 *
 * 2. **Property 30 compliance.** Every emitted event includes:
 *    - `schema_version: '1.0'`
 *    - `eventId` — UUIDv7 (time-ordered, globally unique)
 *    - `ts` — monotonic nanosecond timestamp
 *    - `monotonicSeq` — process-internal sequence breaking same-ts ties
 *    - `projectId` — non-empty SHA-256 hash of the project root (truncated)
 *    - `category: 'migration'` + `action: 'recovery.repaired'`
 *
 * 3. **Conversion.** RepairEngine's `RecoveryRepairedEvent` has a flat shape
 *    (event/timestamp/rule_applied/...). This adapter wraps the repair-specific
 *    fields inside `payload` while moving infrastructure fields up to the
 *    Daemon event envelope.
 *
 * Requirements: 2.3, 2.6
 * Validates: v6-architecture-overview Property 20, Property 30
 */

import { createHash } from 'crypto'
import type { RecoveryRepairedEvent, RepairRuleId } from './repair-engine'

// ============================================================================
// Public types — structural interfaces (no observability import)
// ============================================================================

/**
 * Actor identity attached to events (subset of @specforge/observability's
 * AgentIdentity — kept structural to avoid the dependency).
 */
export interface DaemonActor {
  id: string
  name: string
  type: string
}

/**
 * Multi-sync-ready event envelope (Property 30).
 *
 * Mirrors `@specforge/observability` `Event` exactly so an instance of
 * observability's EventLogger can accept it as-is, but defined here so the
 * migration package stays decoupled.
 */
export interface DaemonEvent {
  schema_version: '1.0'
  eventId: string
  ts: number
  monotonicSeq: number
  projectId: string
  workItemId: string | null
  actor: DaemonActor | null
  category: 'migration'
  action: 'recovery.repaired'
  payload: RecoveryRepairedPayload
}

/**
 * Structural sink interface — observability.EventLogger satisfies this.
 * Tests can inject a mock with the same shape.
 */
export interface DaemonEventSink {
  append(event: DaemonEvent): Promise<void>
  /** Optional one-shot initialization; called lazily. */
  initialize?: () => Promise<void>
}

/**
 * Body of a `recovery.repaired` event (Requirements 2.3, 2.6).
 *
 * Contains everything an operator/auditor needs to understand WHAT was
 * inconsistent, WHICH rule was applied, and WHAT the resulting state is.
 */
export interface RecoveryRepairedPayload {
  /** Predefined rule that was applied. */
  rule_applied: RepairRuleId
  /** Human-readable summary of the action taken. */
  description: string
  /** Snapshot of the inconsistency that was detected. */
  original_state: {
    events_corrupted: boolean
    state_corrupted: boolean
    design_missing: boolean
  }
  /** Snapshot of the repair effects. */
  repaired_state: {
    events_rebuilt: boolean
    state_rolled_back: boolean
    fresh_start: boolean
  }
  /** Non-fatal warnings raised during repair. */
  warnings: string[]
  /** ISO-8601 timestamp when the repair logically occurred. */
  repaired_at: string
  /** Code schema version at the time of repair. */
  schema_version: string
}

// ============================================================================
// Helpers: UUIDv7, projectId, monotonic clock
// ============================================================================

/**
 * Generate a UUIDv7-style id (time-ordered, globally unique).
 *
 * Format: 8-4-4-4-12 hex with version `7` in the 13th nibble and RFC-4122
 * variant `8|9|a|b` in the 17th nibble.
 */
export function generateEventId(): string {
  const ts = Date.now()
  const tsHex = Math.floor(ts).toString(16).padStart(12, '0')
  let randomHex = ''
  for (let i = 0; i < 18; i++) {
    randomHex += Math.floor(Math.random() * 16).toString(16)
  }
  const version = '7'
  const variant = (0x8 + Math.floor(Math.random() * 4)).toString(16) // 8|9|a|b

  return `${tsHex.substring(0, 8)}-${tsHex.substring(8, 12)}-${version}${randomHex.substring(
    0,
    3
  )}-${variant}${randomHex.substring(3, 6)}-${randomHex.substring(6, 18)}`
}

/**
 * Compute the projectId for a given project root path.
 *
 * Returns the first 16 hex chars of SHA-256(path) — matches the algorithm
 * used by `@specforge/observability` so events emitted from different
 * subsystems for the same project share the same identifier.
 */
export function calculateProjectId(projectRootPath: string): string {
  return createHash('sha256').update(projectRootPath).digest('hex').substring(0, 16)
}

/**
 * Process-internal monotonic-nanosecond timestamp generator.
 *
 * - When wall clock advances → reset sequence to 0 and use new time.
 * - When events arrive at the same/earlier wall clock → reuse last `ts`
 *   and increment `seq`. This guarantees `(ts, seq)` is strictly increasing.
 */
class MonotonicClock {
  private last = 0
  private seq = 0

  next(): { ts: number; seq: number } {
    const nowNs = Date.now() * 1_000_000
    if (nowNs > this.last) {
      this.last = nowNs
      this.seq = 0
    } else {
      this.seq++
    }
    return { ts: this.last, seq: this.seq }
  }
}

// ============================================================================
// Options
// ============================================================================

export interface RecoveryEventLoggerOptions {
  /** Underlying WAL sink (e.g. observability.EventLogger instance). */
  sink: DaemonEventSink
  /**
   * Project root path. Used to derive `projectId` if `projectId` is not
   * provided. Cannot be empty (Property 30 requires non-empty projectId).
   */
  projectRoot?: string
  /** Explicit projectId (overrides `projectRoot`-derived). */
  projectId?: string
  /** Optional actor identity attached to emitted events. */
  actor?: DaemonActor | null
  /** Code schema version recorded in the event payload (default '1.0.0'). */
  schemaVersion?: string
}

// ============================================================================
// RecoveryEventLogger
// ============================================================================

/**
 * Adapter from `RepairEngine.RecoveryRepairedEvent` → `DaemonEvent` written
 * via the Daemon's WAL sink.
 *
 * Typical wiring:
 *
 * ```ts
 * const obsLogger = new EventLogger('./data/observability') // observability
 * await obsLogger.initialize()
 * const recoveryLogger = new RecoveryEventLogger({
 *   sink: obsLogger,
 *   projectRoot: process.cwd(),
 * })
 * await detectAndRepair({
 *   baseDir,
 *   eventLogger: recoveryLogger.asHook(),
 * })
 * ```
 */
export class RecoveryEventLogger {
  private readonly sink: DaemonEventSink
  private readonly projectId: string
  private readonly actor: DaemonActor | null
  private readonly schemaVersion: string
  private readonly clock = new MonotonicClock()
  private initialized = false

  constructor(options: RecoveryEventLoggerOptions) {
    if (!options.projectId && !options.projectRoot) {
      throw new Error(
        'RecoveryEventLogger requires either `projectId` or `projectRoot`'
      )
    }
    const projectId =
      options.projectId ?? calculateProjectId(options.projectRoot as string)
    if (!projectId) {
      throw new Error('RecoveryEventLogger: derived projectId is empty')
    }
    this.sink = options.sink
    this.projectId = projectId
    this.actor = options.actor ?? null
    this.schemaVersion = options.schemaVersion ?? '1.0.0'
  }

  /**
   * Lazily initialize the underlying sink. Idempotent.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (typeof this.sink.initialize === 'function') {
      await this.sink.initialize()
    }
    this.initialized = true
  }

  /**
   * Convert a RepairEngine `RecoveryRepairedEvent` to a Property-30 envelope
   * and append it to the WAL sink.
   *
   * The sink is responsible for fsync-before-state semantics; this adapter
   * simply forwards the well-formed event.
   */
  async logRepair(event: RecoveryRepairedEvent): Promise<void> {
    await this.initialize()

    const { ts, seq } = this.clock.next()
    const payload: RecoveryRepairedPayload = {
      rule_applied: event.rule_applied,
      description: this.describeRule(event.rule_applied),
      original_state: { ...event.original_state },
      repaired_state: { ...event.repaired_state },
      warnings: [...event.warnings],
      repaired_at: event.timestamp,
      schema_version: event.schema_version || this.schemaVersion,
    }

    const daemonEvent: DaemonEvent = {
      schema_version: '1.0',
      eventId: generateEventId(),
      ts,
      monotonicSeq: seq,
      projectId: this.projectId,
      workItemId: null,
      actor: this.actor,
      category: 'migration',
      action: 'recovery.repaired',
      payload,
    }

    await this.sink.append(daemonEvent)
  }

  /**
   * Returns a hook function compatible with `RepairOptions.eventLogger`.
   *
   * Pass the result directly into `detectAndRepair({ ..., eventLogger })`
   * or `new RepairEngine({ ..., eventLogger })`.
   */
  asHook(): (event: RecoveryRepairedEvent) => Promise<void> {
    return (event) => this.logRepair(event)
  }

  /**
   * @internal — exposed for tests/diagnostics.
   */
  getProjectId(): string {
    return this.projectId
  }

  private describeRule(rule: RepairRuleId): string {
    switch (rule) {
      case 'rebuild_from_events':
        return 'Rebuilt state.json from valid events.jsonl'
      case 'use_state_with_warning':
        return 'Used state.json as fallback because events were corrupted'
      case 'rollback_to_requirements':
        return 'Rolled back to requirements phase due to missing design.md'
      case 'fresh_start':
        return 'Started fresh because both state.json and events.jsonl were corrupted'
    }
  }
}

/**
 * Convenience factory.
 */
export function createRecoveryEventLogger(
  options: RecoveryEventLoggerOptions
): RecoveryEventLogger {
  return new RecoveryEventLogger(options)
}
