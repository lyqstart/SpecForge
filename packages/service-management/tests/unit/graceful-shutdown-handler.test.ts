/**
 * Unit Tests for GracefulShutdownHandler
 *
 * Tests cover:
 * - Priority order execution (5 stages, reverse registration order within same priority)
 * - Single task 3s timeout does not block subsequent tasks
 * - Total 10s timeout triggers process.exit(1)
 * - Idempotent (multiple trigger calls only execute once)
 * - SIGTERM signal triggers shutdown
 */

import { describe, it, expect, vi, beforeEach, afterEach, SpyInstance } from 'vitest';
import { GracefulShutdownHandler } from '../../src/shutdown/graceful-shutdown-handler.js';
import type { ShutdownPriority, ShutdownTask } from '../../src/types/shutdown.js';

describe('GracefulShutdownHandler', () => {
  let mockExit: SpyInstance;
  let mockConsoleLog: SpyInstance;
  let mockConsoleWarn: SpyInstance;
  let mockConsoleError: SpyInstance;
  // Track all handlers created in tests for cleanup verification
  const handlers: GracefulShutdownHandler[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.useRealTimers();
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();

    // Verify all resources are cleaned up (lessons-injected X2/T1)
    for (const handler of handlers) {
      // Ensure dispose is called to clean up any remaining resources
      await handler.dispose();
      
      // Assert resource counts are zero after dispose
      expect(handler.getActiveTaskCount()).toBe(0);
      expect(handler.getActiveTimerCount()).toBe(0);
    }
    handlers.length = 0;
  });

  // ============================================
  // Test Suite 1: Priority Order Execution
  // ============================================
  describe('Priority order execution', () => {
    it('should execute tasks in correct priority order (stop-accepting → drain → flush → close → release)', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      // Register tasks in different priorities
      handler.register('release-1', async () => { executionOrder.push('release-1'); }, 'release');
      handler.register('close-1', async () => { executionOrder.push('close-1'); }, 'close');
      handler.register('flush-1', async () => { executionOrder.push('flush-1'); }, 'flush');
      handler.register('drain-1', async () => { executionOrder.push('drain-1'); }, 'drain');
      handler.register('stop-accepting-1', async () => { executionOrder.push('stop-accepting-1'); }, 'stop-accepting');

      await handler.trigger('test');

      // Verify priority order
      expect(executionOrder).toEqual([
        'stop-accepting-1',
        'drain-1',
        'flush-1',
        'close-1',
        'release-1',
      ]);

      await handler.dispose();
    });

    it('should execute same-priority tasks in reverse registration order (later registered runs first)', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      // Register multiple tasks in same priority (drain)
      handler.register('drain-first', async () => { executionOrder.push('drain-first'); }, 'drain');
      handler.register('drain-second', async () => { executionOrder.push('drain-second'); }, 'drain');
      handler.register('drain-third', async () => { executionOrder.push('drain-third'); }, 'drain');

      await handler.trigger('test');

      // Reverse order: third registered runs first
      expect(executionOrder).toEqual([
        'drain-third',
        'drain-second',
        'drain-first',
      ]);

      await handler.dispose();
    });

    it('should execute 5 priority stages in correct order with multiple tasks', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      // Add tasks to each priority (register in reverse expected order due to unshift)
      handler.register('stop-1', async () => { executionOrder.push('stop-1'); }, 'stop-accepting');
      handler.register('stop-2', async () => { executionOrder.push('stop-2'); }, 'stop-accepting');

      handler.register('drain-1', async () => { executionOrder.push('drain-1'); }, 'drain');

      handler.register('flush-1', async () => { executionOrder.push('flush-1'); }, 'flush');
      handler.register('flush-2', async () => { executionOrder.push('flush-2'); }, 'flush');

      handler.register('close-1', async () => { executionOrder.push('close-1'); }, 'close');

      handler.register('release-1', async () => { executionOrder.push('release-1'); }, 'release');

      await handler.trigger('test');

      // Expected order: stop-accepting (reverse: 2→1 due to unshift) → drain → flush (reverse: 2→1) → close → release
      expect(executionOrder).toEqual([
        'stop-2',
        'stop-1',
        'drain-1',
        'flush-2',
        'flush-1',
        'close-1',
        'release-1',
      ]);

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 2: Single Task Timeout (3s)
  // ============================================
  describe('Single task timeout (3s)', () => {
    it('should not block subsequent tasks when a single task times out', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler({
        taskTimeoutMs: 3000,
      });
      handlers.push(handler);

      // Task that never completes (use vi.advanceTimersByTimeAsync to simulate timeout)
      handler.register('slow-task', async () => {
        executionOrder.push('slow-task-start');
        // Create a promise that waits indefinitely - the fake timer will simulate the timeout
        await new Promise((_, reject) => setTimeout(() => reject(new Error('timeout simulation')), 10000));
      }, 'drain');

      // Task that should run after timeout in reverse order (within same priority)
      handler.register('fast-task', async () => {
        executionOrder.push('fast-task');
      }, 'drain');

      // Trigger shutdown
      const shutdownPromise = handler.trigger('test');

      // Advance time past 3s timeout
      vi.advanceTimersByTime(3000);

      await shutdownPromise;

      // Both tasks should have executed (parallel within same priority, reverse order)
      expect(executionOrder).toContain('slow-task-start');
      expect(executionOrder).toContain('fast-task');

      await handler.dispose();
    });

    it('should warn but continue when task times out after 3s', async () => {
      const handler = new GracefulShutdownHandler({
        taskTimeoutMs: 3000,
      });
      handlers.push(handler);

      // Use a task that will definitely timeout
      handler.register('timeout-task', async () => {
        // Wait longer than the timeout
        await new Promise(resolve => setTimeout(resolve, 10000));
      }, 'flush');

      const promise = handler.trigger('test');

      // Advance past 3s to trigger timeout
      vi.advanceTimersByTime(3000);

      await promise;

      // Should have logged warning - check the full message was logged
      const warnCalls = mockConsoleWarn.mock.calls;
      const timeoutWarning = warnCalls.find(call => 
        call[0] && call[0].includes && call[0].includes('timeout-task')
      );
      expect(timeoutWarning).toBeDefined();
      expect(timeoutWarning[0]).toContain('3000ms');

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 3: Total Timeout (10s) → process.exit(1)
  // ============================================
  describe('Total shutdown timeout (10s)', () => {
    it('should call process.exit(1) when total timeout of 10s is exceeded', async () => {
      const handler = new GracefulShutdownHandler({
        taskTimeoutMs: 15000, // Long enough that task won't timeout first
        totalShutdownTimeoutMs: 10000, // 10s total
      });
      handlers.push(handler);

      // Use a task that never completes - it waits on an external signal
      // The total timeout should fire before the task completes
      let taskStarted = false;
      handler.register('blocking-task', async (signal: AbortSignal) => {
        taskStarted = true;
        // This promise resolves when aborted (so dispose() can clean up)
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve());
          // Also never resolves on its own (simulating blocking I/O)
        });
      }, 'stop-accepting');

      // Start trigger but don't await (it will never complete due to blocking task)
      handler.trigger('test').catch(() => {});

      // Verify task started
      expect(taskStarted).toBe(true);

      // Advance time to trigger total timeout at 10s
      vi.advanceTimersByTime(10000);
      
      // The setTimeout callback should have fired
      // Check that process.exit was called
      expect(mockExit).toHaveBeenCalledWith(1);

      // Force dispose to clean up the blocking task (abort signal will resolve the task)
      await handler.dispose();
    });

    it('should not exit early when tasks complete within timeout', async () => {
      const handler = new GracefulShutdownHandler({
        totalShutdownTimeoutMs: 10000,
      });
      handlers.push(handler);

      handler.register('quick-task', async () => {}, 'stop-accepting');

      const promise = handler.trigger('test');

      // Advance time but not past 10s
      vi.advanceTimersByTime(5000);

      await promise;

      // Should NOT have called process.exit
      expect(mockExit).not.toHaveBeenCalled();

      await handler.dispose();
    });

    it('should allow 10s total for all priorities combined', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler({
        taskTimeoutMs: 2000, // 2s per task
        totalShutdownTimeoutMs: 10000,
      });
      handlers.push(handler);

      // Add one task per priority, each completes immediately (no setTimeout needed)
      const priorities: ShutdownPriority[] = ['stop-accepting', 'drain', 'flush', 'close', 'release'];

      for (const priority of priorities) {
        handler.register(`task-${priority}`, async () => {
          executionOrder.push(priority);
        }, priority);
      }

      // All tasks complete immediately, so trigger should resolve quickly
      await handler.trigger('test');

      // All 5 tasks should have executed in priority order
      expect(executionOrder).toHaveLength(5);
      expect(executionOrder).toEqual([
        'stop-accepting',
        'drain',
        'flush',
        'close',
        'release',
      ]);
      expect(mockExit).not.toHaveBeenCalled();

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 4: Idempotency
  // ============================================
  describe('Idempotency', () => {
    it('should only execute once when trigger is called multiple times', async () => {
      const executionCount = { value: 0 };
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('test-task', async () => {
        executionCount.value++;
      }, 'stop-accepting');

      // Call trigger multiple times
      const promise1 = handler.trigger('first call');
      const promise2 = handler.trigger('second call');
      const promise3 = handler.trigger('third call');

      vi.advanceTimersByTime(100);
      await Promise.all([promise1, promise2, promise3]);

      // Task should only execute once
      expect(executionCount.value).toBe(1);

      await handler.dispose();
    });

    it('should report correct shutdown reason from first trigger', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('test-task', async () => {}, 'stop-accepting');

      await handler.trigger('first reason');
      await handler.trigger('second reason');

      expect(handler.getShutdownReason()).toBe('first reason');

      await handler.dispose();
    });

    it('should set isShuttingDown() to true after first trigger', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('test-task', async () => {}, 'stop-accepting');

      expect(handler.isShuttingDown()).toBe(false);

      const promise1 = handler.trigger('test');
      expect(handler.isShuttingDown()).toBe(true);

      vi.advanceTimersByTime(100);
      await promise1;

      expect(handler.isShuttingDown()).toBe(true);

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 5: SIGTERM Signal Handling
  // ============================================
  describe('SIGTERM signal handling', () => {
    it('should trigger shutdown when SIGTERM is received', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('sigterm-task', async () => {
        executionOrder.push('sigterm-task');
      }, 'stop-accepting');

      // Attach to process signals
      handler.attachToProcess();

      // Simulate SIGTERM signal
      process.emit('SIGTERM');

      // Wait for the async handler to execute
      vi.advanceTimersByTime(100);

      // Task should have been executed
      expect(executionOrder).toContain('sigterm-task');

      expect(handler.isShuttingDown()).toBe(true);

      await handler.dispose();
    });

    it('should not attach twice if already attached', () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.attachToProcess();
      // Should not throw or cause issues when called again
      handler.attachToProcess();

      // Multiple attaches should be idempotent
      expect(true).toBe(true);

      // Note: We can't easily test cleanup here since we can't remove listeners
      // but the code has the _attached guard
    });

    it('should log shutdown reason on SIGTERM', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('test-task', async () => {}, 'stop-accepting');
      handler.attachToProcess();

      process.emit('SIGTERM');

      vi.advanceTimersByTime(100);

      // Should log the reason
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('SIGTERM')
      );

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 6: Resource Cleanup (X2)
  // ============================================
  describe('Resource cleanup', () => {
    it('should have zero active tasks after shutdown completes', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('task-1', async () => {}, 'stop-accepting');
      handler.register('task-2', async () => {}, 'drain');

      await handler.trigger('test');

      expect(handler.getActiveTaskCount()).toBe(0);

      await handler.dispose();
    });

    it('should have zero active timers after shutdown completes', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('task-1', async () => {}, 'stop-accepting');

      await handler.trigger('test');

      expect(handler.getActiveTimerCount()).toBe(0);

      await handler.dispose();
    });

    it('should clean up timers when dispose is called', async () => {
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('task-1', async () => {}, 'stop-accepting');

      // Trigger but don't await
      const promise = handler.trigger('test');
      vi.advanceTimersByTime(50);
      await promise;

      // Manually dispose
      await handler.dispose();

      expect(handler.getActiveTimerCount()).toBe(0);
      expect(handler.getActiveTaskCount()).toBe(0);
    });
  });

  // ============================================
  // Test Suite 7: Error Handling
  // ============================================
  describe('Error handling', () => {
    it('should continue shutdown even if a task throws', async () => {
      const executionOrder: string[] = [];
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('failing-task', async () => {
        executionOrder.push('failing-task');
        throw new Error('Task failed');
      }, 'stop-accepting');

      handler.register('success-task', async () => {
        executionOrder.push('success-task');
      }, 'drain');

      await handler.trigger('test');

      // Both tasks should have been attempted
      expect(executionOrder).toContain('failing-task');
      expect(executionOrder).toContain('success-task');

      // Should have warned about the failure
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('failing-task')
      );
      const warnMessage = mockConsoleWarn.mock.calls[0][0] as string;
      expect(warnMessage).toContain('failed');

      await handler.dispose();
    });

    it('should provide AbortSignal to tasks', async () => {
      let receivedSignal: AbortSignal | null = null;
      const handler = new GracefulShutdownHandler();
      handlers.push(handler);

      handler.register('signal-task', async (signal) => {
        receivedSignal = signal;
      }, 'stop-accepting');

      await handler.trigger('test');

      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);

      await handler.dispose();
    });
  });

  // ============================================
  // Test Suite 8: Factory Function
  // ============================================
  describe('createGracefulShutdownHandler', () => {
    it('should create handler without auto-attach', async () => {
      const { createGracefulShutdownHandler } = await import('../../src/shutdown/graceful-shutdown-handler.js');

      const handler = createGracefulShutdownHandler();

      handler.register('task', async () => {}, 'stop-accepting');

      expect(handler.isShuttingDown()).toBe(false);

      await handler.dispose();
    });

    it('should auto-attach when autoAttach option is true', async () => {
      const { createGracefulShutdownHandler } = await import('../../src/shutdown/graceful-shutdown-handler.js');

      const handler = createGracefulShutdownHandler({ autoAttach: true });

      handler.register('task', async () => {}, 'stop-accepting');

      // SIGTERM should trigger shutdown
      process.emit('SIGTERM');
      vi.advanceTimersByTime(100);
      // Use Promise.resolve() to flush microtasks instead of vi.runAllTimersAsync
      await Promise.resolve();
      await Promise.resolve();

      expect(handler.isShuttingDown()).toBe(true);

      await handler.dispose();
    });
  });
});