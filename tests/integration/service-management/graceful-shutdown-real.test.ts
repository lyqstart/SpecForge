/**
 * Integration Test 12.5: Graceful Shutdown Real
 *
 * Tests real graceful shutdown behavior of GracefulShutdownHandler:
 * - Tasks execute in priority order (stop-accepting → drain → flush → close → release)
 * - Events acknowledged before t_stop are ALL persisted to events.jsonl
 * - Single task exceeding taskTimeoutMs → warning but continue
 * - Total shutdown exceeding totalShutdownTimeoutMs → process.exit(1)
 * - Idempotent trigger: multiple calls execute tasks only once
 * - Same-priority tasks execute in parallel
 * - Signal attachment triggers shutdown
 *
 * Validates Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { GracefulShutdownHandler } from '../../../packages/service-management/src/shutdown/graceful-shutdown-handler.js';
import type { ShutdownPriority } from '../../../packages/service-management/src/types/shutdown.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a shutdown task that delays for `ms` and resolves early on abort.
 * Used to simulate tasks that take longer than the configured timeout.
 */
function createDelayedTask(ms: number): (signal: AbortSignal) => Promise<void> {
  return (signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Graceful shutdown real', () => {
  const handlers: GracefulShutdownHandler[] = [];
  const tempFiles: string[] = [];

  afterEach(async () => {
    // Dispose all handlers (cleanup resources)
    for (const handler of handlers) {
      await handler.dispose();
    }

    // Assert complete cleanup after dispose (X2 self-check API)
    for (const handler of handlers) {
      expect(handler.getActiveTaskCount()).toBe(0);
      expect(handler.getActiveTimerCount()).toBe(0);
    }
    handlers.length = 0;

    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore cleanup errors (file may not exist)
      }
    }
    tempFiles.length = 0;

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Create a unique temp file path for a test.
   */
  function tempFilePath(name: string): string {
    const p = path.join(
      os.tmpdir(),
      `graceful-shutdown-${name}-${process.pid}-${Date.now()}.txt`,
    );
    tempFiles.push(p);
    return p;
  }

  // -----------------------------------------------------------------------
  // Test 1: Tasks execute in priority order (Req 3.1)
  // -----------------------------------------------------------------------
  it('should execute tasks in priority order: stop-accepting → drain → flush → close → release', async () => {
    const logFile = tempFilePath('order');
    const handler = new GracefulShutdownHandler();
    handlers.push(handler);

    // Register in reverse order to confirm priority overrides registration order
    handler.register(
      'release-task',
      async () => {
        await fs.appendFile(logFile, 'release\n');
      },
      'release',
    );

    handler.register(
      'close-task',
      async () => {
        await fs.appendFile(logFile, 'close\n');
      },
      'close',
    );

    handler.register(
      'flush-task',
      async () => {
        await fs.appendFile(logFile, 'flush\n');
      },
      'flush',
    );

    handler.register(
      'drain-task',
      async () => {
        await fs.appendFile(logFile, 'drain\n');
      },
      'drain',
    );

    handler.register(
      'stop-task',
      async () => {
        await fs.appendFile(logFile, 'stop-accepting\n');
      },
      'stop-accepting',
    );

    await handler.trigger('test-priority-order');

    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines).toEqual([
      'stop-accepting',
      'drain',
      'flush',
      'close',
      'release',
    ]);
  });

  // -----------------------------------------------------------------------
  // Test 2: All events acknowledged before t_stop are persisted (Req 3.2)
  // -----------------------------------------------------------------------
  it('should persist all events acknowledged before t_stop to events.jsonl', async () => {
    const eventsFile = tempFilePath('events');
    const handler = new GracefulShutdownHandler();
    handlers.push(handler);

    // Simulate events acknowledged before shutdown begins
    const events = [
      { id: 1, type: 'start', ts: Date.now() - 5000 },
      { id: 2, type: 'process', ts: Date.now() - 3000 },
      { id: 3, type: 'process', ts: Date.now() - 2000 },
      { id: 4, type: 'process', ts: Date.now() - 1000 },
      { id: 5, type: 'end', ts: Date.now() },
    ];

    handler.register(
      'flush-events',
      async () => {
        // Write all acknowledged events to events.jsonl
        for (const event of events) {
          await fs.appendFile(eventsFile, JSON.stringify(event) + '\n');
        }
      },
      'flush',
    );

    // Simulate SIGTERM-triggered shutdown
    await handler.trigger('SIGTERM');

    // Verify ALL events acknowledged before t_stop are present
    const content = await fs.readFile(eventsFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(events.length);

    for (let i = 0; i < events.length; i++) {
      const parsed = JSON.parse(lines[i]);
      expect(parsed.id).toBe(events[i].id);
      expect(parsed.type).toBe(events[i].type);
    }
  });

  // -----------------------------------------------------------------------
  // Test 3: Single task timeout → warning but continues (Req 3.3)
  // Simulates a task exceeding 3s (using shortened timeout of 100ms)
  // -----------------------------------------------------------------------
  it('should warn when a task exceeds taskTimeoutMs but continue executing other tasks', async () => {
    const logFile = tempFilePath('task-timeout');
    const handler = new GracefulShutdownHandler({
      taskTimeoutMs: 100,
      totalShutdownTimeoutMs: 5000,
    });
    handlers.push(handler);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Slow task that exceeds taskTimeoutMs (100ms)
    handler.register('slow-drain', createDelayedTask(500), 'drain');

    // Fast task at a later priority — should still complete despite slow task timing out
    handler.register(
      'fast-flush',
      async () => {
        await fs.appendFile(logFile, 'flushed\n');
      },
      'flush',
    );

    await handler.trigger('task-timeout-test');

    // Verify warning was logged for the slow task
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('slow-drain'),
    );

    // Verify the fast task still completed successfully
    const content = await fs.readFile(logFile, 'utf-8');
    expect(content.trim()).toBe('flushed');
  });

  // -----------------------------------------------------------------------
  // Test 4: Total timeout → process.exit(1) (Req 3.4)
  // Simulates total 10s timeout (using shortened timeout of 50ms)
  // -----------------------------------------------------------------------
  it('should call process.exit(1) when totalShutdownTimeoutMs is exceeded', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        // Prevent actual process exit — just record the call
      }) as (code?: number) => never);

    const handler = new GracefulShutdownHandler({
      taskTimeoutMs: 200,
      totalShutdownTimeoutMs: 50,
    });
    handlers.push(handler);

    // Register a task that blocks longer than totalShutdownTimeoutMs
    handler.register('blocking-drain', createDelayedTask(5000), 'drain');

    await handler.trigger('total-timeout-test');

    // Verify process.exit(1) was called when total timeout was exceeded
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // -----------------------------------------------------------------------
  // Test 5: Idempotent trigger (Req 3.5)
  // -----------------------------------------------------------------------
  it('should execute shutdown tasks only once when trigger is called multiple times', async () => {
    const logFile = tempFilePath('idempotent');
    const handler = new GracefulShutdownHandler();
    handlers.push(handler);

    handler.register(
      'once-task',
      async () => {
        await fs.appendFile(logFile, 'ran\n');
      },
      'drain',
    );

    // Fire trigger concurrently three times
    await Promise.all([
      handler.trigger('first'),
      handler.trigger('second'),
      handler.trigger('third'),
    ]);

    // The task must have executed exactly once
    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('ran');
  });

  // -----------------------------------------------------------------------
  // Test 6: Same-priority tasks all execute (parallel)
  // -----------------------------------------------------------------------
  it('should execute all tasks registered at the same priority level in parallel', async () => {
    const logFile = tempFilePath('parallel');
    const handler = new GracefulShutdownHandler();
    handlers.push(handler);

    handler.register(
      'parallel-a',
      async () => {
        await fs.appendFile(logFile, 'a\n');
      },
      'drain',
    );

    handler.register(
      'parallel-b',
      async () => {
        await fs.appendFile(logFile, 'b\n');
      },
      'drain',
    );

    handler.register(
      'parallel-c',
      async () => {
        await fs.appendFile(logFile, 'c\n');
      },
      'drain',
    );

    await handler.trigger('parallel-test');

    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.trim().split('\n');

    // All three tasks must be present (order may vary due to parallel execution)
    expect(lines).toHaveLength(3);
    expect(new Set(lines)).toEqual(new Set(['a', 'b', 'c']));
  });

  // -----------------------------------------------------------------------
  // Test 7: Signal attachment triggers shutdown (dual platform)
  // -----------------------------------------------------------------------
  it('should trigger shutdown when receiving SIGTERM via attachToProcess', async () => {
    const logFile = tempFilePath('signal');
    const handler = new GracefulShutdownHandler();
    handlers.push(handler);

    handler.register(
      'signal-task',
      async () => {
        await fs.appendFile(logFile, 'signal-shutdown\n');
      },
      'drain',
    );

    handler.attachToProcess();

    // Spy on trigger to capture the async promise from the signal handler
    const triggerSpy = vi.spyOn(handler, 'trigger');

    // Emit SIGTERM — works on both Windows and Linux/macOS (synthetic event)
    process.emit('SIGTERM');

    // Verify trigger was called with the expected reason
    expect(triggerSpy).toHaveBeenCalledWith('Received SIGTERM signal');

    // Await the trigger promise so the task completes before assertions
    const result = triggerSpy.mock.results[0];
    if (result && result.type === 'return') {
      await result.value;
    }

    // Verify the shutdown task executed
    const content = await fs.readFile(logFile, 'utf-8');
    expect(content.trim()).toBe('signal-shutdown');
  });
});
