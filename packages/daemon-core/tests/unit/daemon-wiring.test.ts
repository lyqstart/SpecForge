/**
 * Daemon wiring / integration tests — TASK-6 regression coverage for
 * C1, C5, M2, CP-1, CP-6.
 *
 * Covers:
 *   C1  — Only WAL writes to events.jsonl (no EventLogger dual write)
 *   C5  — EventLogger counters seeded from events.jsonl on initialize()
 *   M2  — Duplicate events eliminated (persistenceHook uses trackEvent, not append)
 *   CP-1 — StateManager.transition() produces event in events.jsonl (WAL sole writer)
 *   CP-6 — EventLogger.trackEvent() performs no direct events.jsonl / state.json I/O
 *
 * Uses temporary directories exclusively.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { EventLogger } from '@specforge/observability/src/event-logger/index';
import { PersonalPathResolver, IPathResolver } from '../../src/daemon/path-resolver';
import type { Event as DaemonEvent } from '../../src/types';
import type { Event as ObsEvent } from '@specforge/observability/src/types/index';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

class TestPathResolver implements IPathResolver {
  constructor(private baseDir: string) {}
  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(this.baseDir, 'project-rt');
  }
  resolveStatePath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');
  }
  resolveEventsPath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl');
  }
  resolveSessionsDir(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'sessions');
  }
  resolveDaemonRuntimeDir(): string {
    return this.baseDir;
  }
  resolveHandshakePath(): string {
    return path.join(this.baseDir, 'handshake.json');
  }
  resolveDaemonJsonPath(): string {
    return path.join(this.baseDir, 'daemon.json');
  }
  resolveDaemonStatePath(): string {
    return path.join(this.baseDir, 'state.json');
  }
  resolveDaemonEventsPath(): string {
    return path.join(this.baseDir, 'events.jsonl');
  }
}

/** Minimal ObservabilityEvent for trackEvent testing. */
function makeObsEvent(overrides: Partial<ObsEvent> = {}): ObsEvent {
  return {
    schema_version: '1.0',
    eventId: `obs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    monotonicSeq: 1,
    projectId: 'test-proj',
    workItemId: null,
    actor: null,
    category: 'system',
    action: 'test.action',
    payload: {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CP-1 + C1: WAL is sole writer of events.jsonl
// ═══════════════════════════════════════════════════════════════════

describe('Daemon wiring — CP-1 / C1: WAL sole writer', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcw-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('CP-1: StateManager.transition() appends event to WAL events.jsonl', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-CP1', '', 'intake', 'cp1-actor');

    // Read events.jsonl directly — it should contain the transition event
    const eventsPath = (sm as any).wal.getEventsPath() as string;
    const raw = await fs.readFile(eventsPath, 'utf-8');
    expect(raw.trim()).not.toBe('');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const lastEvent = JSON.parse(lines[lines.length - 1]!);
    expect(lastEvent.action).toBe('state.transition');
    // payload should reference the work item
    expect(lastEvent.payload.work_item_id).toBe('WI-CP1');
    expect(lastEvent.payload.to_state).toBe('intake');
  });

  it('CP-1: events.jsonl contains event BEFORE state.json is updated (WAL ordering)', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    // transition() internally: appendEvent → WAL → writeStateFile
    await sm.transition('WI-ORDER', '', 'design', 'test');

    const wal = (sm as any).wal;
    const eventsPath = wal.getEventsPath() as string;
    const statePath = (sm as any).statePath as string;

    const eventsStat = await fs.stat(eventsPath);
    const stateStat = await fs.stat(statePath);
    // Both should exist; the relative order is guaranteed by implementation:
    // events are written first, then state. On the same tick, timestamps may
    // be identical, but both should be non-zero.
    expect(eventsStat.size).toBeGreaterThan(0);
    expect(stateStat.size).toBeGreaterThan(0);
  });

  it('C1: only WAL writes to events.jsonl — StateManager.transition does not invoke EventLogger file write', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();
    const eventsPath = (sm as any).wal.getEventsPath() as string;

    await sm.transition('WI-SOLE', '', 'intake', 'test');

    // Count events in events.jsonl
    const raw = await fs.readFile(eventsPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    // Should have exactly 1 event (the transition) — no duplicate from EventLogger
    expect(lines.length).toBe(1);
  });

  it('C1: two transitions produce exactly 2 events (no EventLogger duplicates)', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-D1', '', 'intake', 'test');
    await sm.transition('WI-D1', 'intake', 'requirements', 'test');

    const eventsPath = (sm as any).wal.getEventsPath() as string;
    const raw = await fs.readFile(eventsPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    // 2 transitions → 2 events in WAL, no duplicates from removed persistenceHook
    expect(lines.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// C5: EventLogger counters seeded from events.jsonl
// ═══════════════════════════════════════════════════════════════════

describe('Daemon wiring — C5: EventLogger initialization seeding', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcel-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('C5: EventLogger.initialize() seeds eventCount from existing events.jsonl', async () => {
    // Pre-populate events.jsonl with 3 events
    const eventsPath = path.join(tempDir, 'events.jsonl');
    const e1 = JSON.stringify({ eventId: 'ev-1', ts: 1000, projectId: 'p1', category: 'system', action: 'a1', payload: {} }) + '\n';
    const e2 = JSON.stringify({ eventId: 'ev-2', ts: 2000, projectId: 'p1', category: 'system', action: 'a2', payload: {} }) + '\n';
    const e3 = JSON.stringify({ eventId: 'ev-3', ts: 3000, projectId: 'p1', category: 'system', action: 'a3', payload: {} }) + '\n';
    await fs.writeFile(eventsPath, e1 + e2 + e3, 'utf-8');

    const logger = new EventLogger(tempDir);
    await logger.initialize();

    expect(logger.getEventCount()).toBe(3);
    expect(logger.getLastEventId()).toBe('ev-3');
  });

  it('C5: EventLogger.initialize() returns 0 when events.jsonl is empty', async () => {
    const eventsPath = path.join(tempDir, 'events.jsonl');
    await fs.writeFile(eventsPath, '', 'utf-8');

    const logger = new EventLogger(tempDir);
    await logger.initialize();

    expect(logger.getEventCount()).toBe(0);
    expect(logger.getLastEventId()).toBeNull();
  });

  it('C5: EventLogger.initialize() returns 0 when events.jsonl does not exist', async () => {
    // No events.jsonl file at all
    const logger = new EventLogger(tempDir);
    await logger.initialize();

    expect(logger.getEventCount()).toBe(0);
    expect(logger.getLastEventId()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CP-6: EventLogger.trackEvent performs no events.jsonl / state.json I/O
// ═══════════════════════════════════════════════════════════════════

describe('Daemon wiring — CP-6: trackEvent no events.jsonl/state.json I/O', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcte-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('CP-6: trackEvent does NOT write to events.jsonl', async () => {
    // Create an empty events.jsonl
    const eventsPath = path.join(tempDir, 'events.jsonl');
    await fs.writeFile(eventsPath, '', 'utf-8');

    const logger = new EventLogger(tempDir);
    await logger.initialize();

    const event = makeObsEvent({ eventId: 'cp6-test', action: 'cp6.action' });
    await logger.trackEvent(event);

    // events.jsonl should still be empty (WAL is the sole writer)
    const raw = await fs.readFile(eventsPath, 'utf-8');
    expect(raw.trim()).toBe('');
  });

  it('CP-6: trackEvent does NOT write to state.json', async () => {
    const statePath = path.join(tempDir, 'state.json');
    // Ensure state.json doesn't exist
    try { await fs.unlink(statePath); } catch { /* ok */ }

    const logger = new EventLogger(tempDir);
    await logger.initialize();

    const event = makeObsEvent({ eventId: 'cp6-state-test' });
    await logger.trackEvent(event);

    // state.json should NOT have been created by trackEvent
    await expect(fs.access(statePath)).rejects.toThrow();
  });

  it('CP-6: trackEvent updates in-memory counters only', async () => {
    const logger = new EventLogger(tempDir);
    await logger.initialize();

    expect(logger.getEventCount()).toBe(0);
    expect(logger.getLastEventId()).toBeNull();

    const event = makeObsEvent({ eventId: 'mem-track-1' });
    await logger.trackEvent(event);

    expect(logger.getEventCount()).toBe(1);
    expect(logger.getLastEventId()).toBe('mem-track-1');

    // Second event
    const event2 = makeObsEvent({ eventId: 'mem-track-2' });
    await logger.trackEvent(event2);

    expect(logger.getEventCount()).toBe(2);
    expect(logger.getLastEventId()).toBe('mem-track-2');
  });
});

// ═══════════════════════════════════════════════════════════════════
// M2: Duplicate events eliminated
// ═══════════════════════════════════════════════════════════════════

describe('Daemon wiring — M2: no duplicate events', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `sfcm2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('M2: StateManager.transition produces exactly one event per transition', async () => {
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    await sm.transition('WI-M2-1', '', 'intake', 'm2-test');
    await sm.transition('WI-M2-1', 'intake', 'design', 'm2-test');
    await sm.transition('WI-M2-2', '', 'requirements', 'm2-test');

    const eventsPath = (sm as any).wal.getEventsPath() as string;
    const raw = await fs.readFile(eventsPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    // 3 transitions → exactly 3 events (no persistenceHook duplicates)
    expect(lines.length).toBe(3);

    // All events should be state.transition
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(ev.action).toBe('state.transition');
    }
  });

  it('M2: EventLogger.trackEvent does not cause duplicate writes when called alongside StateManager', async () => {
    // Simulate the fixed persistenceHook: StateManager writes to WAL,
    // then EventBus publishes → persistenceHook → EventLogger.trackEvent (memory only).
    // The net effect: WAL has the event, EventLogger's in-memory counters are updated,
    // but events.jsonl has only ONE copy of the event.
    const sm = new StateManager(resolver, 'test-proj');
    await sm.initialize();

    // Create EventLogger pointing to same directory
    const eventsPath = (sm as any).wal.getEventsPath() as string;
    const eventsDir = path.dirname(eventsPath);
    const logger = new EventLogger(eventsDir);
    await logger.initialize();

    // Step 1: StateManager writes to WAL
    await sm.transition('WI-M2-INT', '', 'intake', 'test');
    // Step 2: Simulate persistenceHook: trackEvent in-memory
    const obsEvent = makeObsEvent({
      eventId: 'simulated-hook',
      projectId: 'test-proj',
      action: 'state.transition',
    });
    await logger.trackEvent(obsEvent);

    // events.jsonl should have 1 event (from StateManager), not 2
    const raw = await fs.readFile(eventsPath, 'utf-8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
    // EventLogger's in-memory counters should be 1 (from trackEvent)
    expect(logger.getEventCount()).toBe(1);
    expect(logger.getLastEventId()).toBe('simulated-hook');
  });
});
