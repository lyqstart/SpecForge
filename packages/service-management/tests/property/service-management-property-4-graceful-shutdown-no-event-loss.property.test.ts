/**
 * Property-Based Test: Property 4 - Graceful Shutdown No Event Loss
 *
 * Feature: service-management, Property 4: Graceful Shutdown No Event Loss; Derived-From: v6-architecture-overview Property 7 (extension)
 *
 * **Validates: Requirements 3.1, 3.2, 3.5**
 *
 * For all daemon shutdown moments t_stop, for any event e that has been
 * acknowledged (HTTP 2xx) by the daemon (e.ts < t_stop), after graceful
 * shutdown completes, e must exist in the EventStore:
 *
 *   ∀ e ∈ E: ack(e) ∧ e.ts < t_stop  ⟹  e ∈ readEvents()
 *
 * i.e., daemon must flush all acknowledged events to the EventStore during
 * graceful shutdown, without losing any committed events.
 *
 * This property is orthogonal to parent spec Property 7 (WAL Ordering):
 * - Parent Property 7 guarantees write ordering
 * - This Property 4 guarantees no loss during shutdown
 *
 * Implementation note: Since we cannot use a real daemon binary, we use
 * a controlled fake implementation:
 * - InMemoryEventStore: simulates events.jsonl
 * - GracefulShutdownHandler: real implementation with flush task registered
 * - Events are injected, some marked as ack'd before t_stop
 * - SIGTERM is simulated by calling handler.trigger()
 * - After shutdown, we verify all ack'd pre-t_stop events are in the store
 *
 * Iterations: ≥ 100
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  GracefulShutdownHandler,
  createGracefulShutdownHandler,
} from '../../src/shutdown/graceful-shutdown-handler.js';

// Helper: advance fake timers and flush microtasks
async function advanceTimers(): Promise<void> {
  // Use vi.runAllTimers() to advance all pending fake timers synchronously,
  // then yield to allow microtasks (Promise callbacks) to run.
  vi.runAllTimers();
  // Yield to microtask queue
  await Promise.resolve();
  await Promise.resolve();
}

// ─── InMemoryEventStore ───────────────────────────────────────────────────────

/**
 * Simulates events.jsonl — an append-only event store.
 * Tracks pending (in-memory, not yet flushed) and persisted events.
 */
class InMemoryEventStore {
  /** Events that have been "flushed" (persisted to disk equivalent) */
  private readonly _persistedEvents: TestEvent[] = [];
  /** Events that are pending flush (in-memory buffer) */
  private readonly _pendingEvents: TestEvent[] = [];

  /**
   * Ingest an event into the pending buffer.
   * Returns true to simulate HTTP 2xx ack.
   */
  ingest(event: TestEvent): boolean {
    this._pendingEvents.push(event);
    return true; // simulate HTTP 2xx ack
  }

  /**
   * Flush all pending events to the persisted store.
   * Simulates fsync to events.jsonl.
   */
  flush(): void {
    for (const event of this._pendingEvents) {
      this._persistedEvents.push(event);
    }
    this._pendingEvents.length = 0;
  }

  /**
   * Read all persisted events (simulates reading events.jsonl after shutdown).
   */
  readPersistedEvents(): readonly TestEvent[] {
    return this._persistedEvents;
  }

  /**
   * Get count of pending (not yet flushed) events.
   */
  getPendingCount(): number {
    return this._pendingEvents.length;
  }

  /**
   * Reset the store for test isolation.
   */
  reset(): void {
    this._persistedEvents.length = 0;
    this._pendingEvents.length = 0;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A test event with ack status and timestamp.
 */
interface TestEvent {
  /** Unique event ID */
  id: string;
  /** Event timestamp (simulated logical clock) */
  ts: number;
  /** Whether this event was acknowledged (HTTP 2xx returned to client) */
  ack: boolean;
  /** Event payload */
  payload: string;
}

// ─── Tracked handlers for cleanup ────────────────────────────────────────────

const activeHandlers: GracefulShutdownHandler[] = [];

// ─── Test setup / teardown ────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  // Dispose all handlers created during the test
  for (const handler of activeHandlers) {
    await handler[Symbol.asyncDispose]();
    // Rule T2/X2: afterEach must assert getActiveTaskCount() === 0 and getActiveTimerCount() === 0
    expect(handler.getActiveTaskCount()).toBe(0);
    expect(handler.getActiveTimerCount()).toBe(0);
  }
  activeHandlers.length = 0;

  vi.useRealTimers();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a GracefulShutdownHandler with a flush task registered.
 * The flush task writes all pending events from the store to persisted storage.
 */
function createHandlerWithFlushTask(
  store: InMemoryEventStore,
  opts: { taskTimeoutMs?: number; totalShutdownTimeoutMs?: number } = {}
): GracefulShutdownHandler {
  const handler = createGracefulShutdownHandler({
    taskTimeoutMs: opts.taskTimeoutMs ?? 5000,
    totalShutdownTimeoutMs: opts.totalShutdownTimeoutMs ?? 30000,
  });

  // Register flush task at 'flush' priority — simulates daemon's event flush task
  handler.register(
    'flush-events-to-store',
    async (_signal: AbortSignal) => {
      store.flush();
    },
    'flush'
  );

  activeHandlers.push(handler);
  return handler;
}

/**
 * Simulate injecting events into the store and marking some as ack'd before t_stop.
 * Returns the set of events that should be in the store after shutdown.
 */
function injectEvents(
  store: InMemoryEventStore,
  events: TestEvent[],
  tStop: number
): TestEvent[] {
  const expectedInStore: TestEvent[] = [];

  for (const event of events) {
    if (event.ack && event.ts < tStop) {
      // This event was ack'd before SIGTERM — must be in store after shutdown
      store.ingest(event);
      expectedInStore.push(event);
    } else if (!event.ack) {
      // Not ack'd — may or may not be in store (not required by property)
      // We still ingest it to simulate realistic scenario
      store.ingest(event);
    }
    // Events with ts >= tStop are not injected (they arrive after SIGTERM)
  }

  return expectedInStore;
}

// ─── fast-check arbitraries ───────────────────────────────────────────────────

/**
 * Generates a single test event.
 * ts is a logical clock value (integer), not real time.
 */
const testEventArb: fc.Arbitrary<TestEvent> = fc.record({
  id: fc.uuid(),
  ts: fc.integer({ min: 0, max: 1000 }),
  ack: fc.boolean(),
  payload: fc.string({ minLength: 0, maxLength: 50 }),
});

/**
 * Generates a stream of 0–20 events.
 */
const eventStreamArb: fc.Arbitrary<TestEvent[]> = fc.array(testEventArb, {
  minLength: 0,
  maxLength: 20,
});

/**
 * Generates a SIGTERM moment t_stop in the range [100, 900].
 * Events with ts < t_stop and ack=true must be in the store after shutdown.
 */
const tStopArb: fc.Arbitrary<number> = fc.integer({ min: 100, max: 900 });

// ─── Property 4 Test Suite ────────────────────────────────────────────────────

describe(
  'Feature: service-management, Property 4: Graceful Shutdown No Event Loss; Derived-From: v6-architecture-overview Property 7 (extension)',
  () => {
    /**
     * Core property:
     *
     * ∀ e ∈ E: ack(e) ∧ e.ts < t_stop  ⟹  e ∈ readEvents()
     *
     * For any event stream E and SIGTERM moment t_stop:
     * All events that were acknowledged (ack=true) before t_stop must be
     * present in the EventStore after graceful shutdown completes.
     *
     * **Validates: Requirements 3.1, 3.2, 3.5**
     */
    it(
      'all ack\'d events before t_stop must be in the store after graceful shutdown',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            eventStreamArb,
            tStopArb,
            async (events, tStop) => {
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // Inject events: ack'd events with ts < tStop go into pending buffer
              const expectedInStore = injectEvents(store, events, tStop);

              // Trigger SIGTERM (simulate OS sending stop signal)
              // This calls handler.trigger() which executes all registered tasks
              // including the flush task that writes pending events to persisted store
              const shutdownPromise = handler.trigger('SIGTERM');

              // Advance fake timers to allow shutdown tasks to complete
              // (tasks are synchronous in our fake, but we need to flush microtasks)
              await advanceTimers();

              // Wait for shutdown to complete
              await shutdownPromise;

              // Read persisted events after shutdown
              const persistedEvents = store.readPersistedEvents();
              const persistedIds = new Set(persistedEvents.map(e => e.id));

              // Assert: ∀ e ∈ E: ack(e) ∧ e.ts < t_stop ⟹ e ∈ readEvents()
              for (const expected of expectedInStore) {
                expect(
                  persistedIds.has(expected.id),
                  `Event ${expected.id} (ts=${expected.ts}, ack=${expected.ack}) ` +
                  `should be in store after shutdown (t_stop=${tStop})`
                ).toBe(true);
              }
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000 // 60s timeout for PBT with fake timers
    );

    /**
     * Edge case: empty event stream — shutdown should complete cleanly.
     *
     * **Validates: Requirements 3.1, 3.5**
     */
    it(
      'graceful shutdown with empty event stream completes cleanly',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            tStopArb,
            async (tStop) => {
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // No events injected
              const shutdownPromise = handler.trigger('SIGTERM');
              await advanceTimers();
              await shutdownPromise;

              // Store should be empty
              expect(store.readPersistedEvents()).toHaveLength(0);
              expect(store.getPendingCount()).toBe(0);
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000
    );

    /**
     * Edge case: all events are ack'd and all have ts < t_stop.
     * All events must be in the store after shutdown.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it(
      'all ack\'d events (all before t_stop) must all be persisted after shutdown',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                id: fc.uuid(),
                ts: fc.integer({ min: 0, max: 99 }), // all ts < 100 = t_stop
                ack: fc.constant(true),
                payload: fc.string({ minLength: 0, maxLength: 20 }),
              }),
              { minLength: 1, maxLength: 15 }
            ),
            async (events) => {
              const tStop = 100; // all events have ts < 100
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // Inject all events (all ack'd, all before t_stop)
              for (const event of events) {
                store.ingest(event);
              }

              const shutdownPromise = handler.trigger('SIGTERM');
              await advanceTimers();
              await shutdownPromise;

              const persistedEvents = store.readPersistedEvents();
              const persistedIds = new Set(persistedEvents.map(e => e.id));

              // All events must be persisted
              for (const event of events) {
                expect(
                  persistedIds.has(event.id),
                  `Event ${event.id} must be persisted after shutdown`
                ).toBe(true);
              }

              // Count must match
              expect(persistedEvents.length).toBe(events.length);
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000
    );

    /**
     * Idempotency: triggering shutdown multiple times does not cause
     * events to be flushed multiple times (no duplicates).
     *
     * **Validates: Requirements 3.5, 3.7**
     */
    it(
      'multiple trigger calls do not cause duplicate events in store',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                id: fc.uuid(),
                ts: fc.integer({ min: 0, max: 50 }),
                ack: fc.constant(true),
                payload: fc.string({ minLength: 0, maxLength: 20 }),
              }),
              { minLength: 1, maxLength: 10 }
            ),
            async (events) => {
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // Inject events
              for (const event of events) {
                store.ingest(event);
              }

              // Trigger shutdown twice (idempotent — second call is no-op)
              const p1 = handler.trigger('SIGTERM');
              const p2 = handler.trigger('SIGTERM'); // should be no-op

              await advanceTimers();
              await Promise.all([p1, p2]);

              const persistedEvents = store.readPersistedEvents();

              // No duplicates: each event ID appears exactly once
              const idCounts = new Map<string, number>();
              for (const event of persistedEvents) {
                idCounts.set(event.id, (idCounts.get(event.id) ?? 0) + 1);
              }

              for (const [id, count] of idCounts) {
                expect(
                  count,
                  `Event ${id} should appear exactly once in store, but appeared ${count} times`
                ).toBe(1);
              }
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000
    );

    /**
     * Flush task executes at 'flush' priority — verifying the task runs
     * during shutdown and pending events are moved to persisted store.
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it(
      'flush task runs during shutdown: pending events become persisted',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                id: fc.uuid(),
                ts: fc.integer({ min: 0, max: 50 }),
                ack: fc.constant(true),
                payload: fc.string({ minLength: 0, maxLength: 20 }),
              }),
              { minLength: 1, maxLength: 10 }
            ),
            async (events) => {
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // Inject events into pending buffer
              for (const event of events) {
                store.ingest(event);
              }

              // Before shutdown: events are pending, not persisted
              expect(store.getPendingCount()).toBe(events.length);
              expect(store.readPersistedEvents()).toHaveLength(0);

              // Trigger shutdown
              const shutdownPromise = handler.trigger('SIGTERM');
              await advanceTimers();
              await shutdownPromise;

              // After shutdown: events are persisted, pending buffer is empty
              expect(store.getPendingCount()).toBe(0);
              expect(store.readPersistedEvents()).toHaveLength(events.length);
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000
    );

    /**
     * Mixed ack/non-ack events: only ack'd events before t_stop are required
     * to be in the store. Non-ack'd events may or may not be present.
     *
     * **Validates: Requirements 3.1, 3.2, 3.5**
     */
    it(
      'only ack\'d events before t_stop are guaranteed to be in store',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            eventStreamArb,
            tStopArb,
            async (events, tStop) => {
              const store = new InMemoryEventStore();
              const handler = createHandlerWithFlushTask(store);

              // Separate events into categories
              const ackdBeforeStop = events.filter(e => e.ack && e.ts < tStop);
              const notAckd = events.filter(e => !e.ack);

              // Inject ack'd events before t_stop
              for (const event of ackdBeforeStop) {
                store.ingest(event);
              }

              // Also inject some non-ack'd events (realistic scenario)
              for (const event of notAckd.slice(0, 5)) {
                store.ingest(event);
              }

              // Trigger shutdown
              const shutdownPromise = handler.trigger('SIGTERM');
              await advanceTimers();
              await shutdownPromise;

              const persistedIds = new Set(
                store.readPersistedEvents().map(e => e.id)
              );

              // Required: all ack'd events before t_stop must be present
              for (const event of ackdBeforeStop) {
                expect(
                  persistedIds.has(event.id),
                  `Ack'd event ${event.id} (ts=${event.ts}) must be in store after shutdown`
                ).toBe(true);
              }
            }
          ),
          {
            numRuns: 100,
            verbose: false,
          }
        );
      },
      60000
    );
  }
);
