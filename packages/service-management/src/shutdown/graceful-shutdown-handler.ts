/**
 * Graceful Shutdown Handler
 *
 * Handles graceful shutdown of services by executing shutdown tasks in priority order.
 * Implements AsyncDisposable for resource cleanup.
 *
 * @specforge/service-management
 */

import type { ShutdownPriority, ShutdownTask, ShutdownTaskEntry } from '../types/shutdown.js';

/**
 * Options for configuring the graceful shutdown handler
 */
export interface GracefulShutdownHandlerOptions {
  /** Default timeout for individual shutdown tasks (ms). Default: 3000 */
  taskTimeoutMs?: number;
  /** Total shutdown timeout before force exit (ms). Default: 10000 */
  totalShutdownTimeoutMs?: number;
  /** Whether to attach to process signals automatically */
  autoAttach?: boolean;
}

/**
 * Result of a shutdown task execution
 */
export interface ShutdownTaskResult {
  name: string;
  success: boolean;
  timedOut: boolean;
  error?: Error;
}

/**
 * GracefulShutdownHandler manages the shutdown sequence of a service.
 *
 * Key behaviors:
 * - Implements AsyncDisposable for proper resource cleanup
 * - Constructor has no side effects (attachToProcess must be called explicitly)
 * - Shutdown tasks execute in priority order: stop-accepting → drain → flush → close → release
 * - Same priority tasks execute in parallel (reverse registration order)
 * - Individual task timeout: 3s (warning but continue on timeout)
 * - Total shutdown timeout: 10s (force exit with process.exit(1) on timeout)
 * - Promise.race loser timers are cleaned up in finally block (C1)
 * - Idempotent: multiple trigger calls only execute once
 */
export class GracefulShutdownHandler implements AsyncDisposable {
  private readonly tasks: Map<ShutdownPriority, ShutdownTaskEntry[]> = new Map();
  private readonly taskTimeoutMs: number;
  private readonly totalShutdownTimeoutMs: number;

  // State tracking
  private _isShuttingDown = false;
  private _shutdownReason: string | null = null;
  private _activeTaskCount = 0;
  private _activeTimerCount = 0;

  // Process signal handlers (stored for cleanup)
  private _signalHandlers: Map<string, (reason: string) => void> = new Map();
  private _attached = false;

  // Track timers for getActiveTimerCount()
  private readonly _activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(options: GracefulShutdownHandlerOptions = {}) {
    // Constructor has no side effects (JS1 from lessons-injected.md)
    this.taskTimeoutMs = options.taskTimeoutMs ?? 3000;
    this.totalShutdownTimeoutMs = options.totalShutdownTimeoutMs ?? 10000;

    // Initialize priority buckets
    const priorities: ShutdownPriority[] = [
      'stop-accepting',
      'drain',
      'flush',
      'close',
      'release',
    ];
    for (const priority of priorities) {
      this.tasks.set(priority, []);
    }
  }

  /**
   * Register a shutdown task with a specific priority.
   * Tasks with the same priority execute in parallel (reverse registration order).
   */
  register(name: string, task: ShutdownTask, priority: ShutdownPriority): void {
    if (this._isShuttingDown) {
      // Silently ignore registration during shutdown (idempotent behavior)
      return;
    }

    const bucket = this.tasks.get(priority);
    if (!bucket) {
      throw new Error(`Invalid priority: ${priority}. Valid priorities are: stop-accepting, drain, flush, close, release`);
    }

    // Add to the BEGINNING of the bucket for reverse execution order
    // (tasks registered later run first within same priority)
    bucket.unshift({ name, task, priority });
  }

  /**
   * Attach to process signals for automatic shutdown triggers.
   * Should be called after all tasks are registered.
   * Must be called explicitly (constructor has no side effects).
   */
  attachToProcess(): void {
    if (this._attached) {
      return;
    }

    const handleSignal = (signal: string) => {
      const reason = `Received ${signal} signal`;
      // Fire and forget - don't await as the process may be terminated
      this.trigger(reason).catch((err) => {
        console.error(`Error during shutdown triggered by ${signal}:`, err);
      });
    };

    // Register signal handlers
    // SIGTERM - Standard termination signal (Linux/macOS)
    // SIGINT - Interrupt from keyboard (Ctrl+C)
    // SERVICE_CONTROL_STOP - Windows service stop signal

    if (process.platform !== 'win32') {
      process.on('SIGTERM', () => handleSignal('SIGTERM'));
      process.on('SIGINT', () => handleSignal('SIGINT'));
      this._signalHandlers.set('SIGTERM', handleSignal);
      this._signalHandlers.set('SIGINT', handleSignal);
    } else {
      // On Windows, we handle SIGTERM as well since NSSM can send it
      process.on('SIGTERM', () => handleSignal('SIGTERM'));
      this._signalHandlers.set('SIGTERM', handleSignal);
    }

    this._attached = true;
  }

  /**
   * Check if shutdown is in progress.
   */
  isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Get the reason for shutdown, if any.
   */
  getShutdownReason(): string | null {
    return this._shutdownReason;
  }

  /**
   * Get the count of currently active tasks (for self-check API - X2).
   */
  getActiveTaskCount(): number {
    return this._activeTaskCount;
  }

  /**
   * Get the count of currently active timers (for self-check API - X2).
   */
  getActiveTimerCount(): number {
    return this._activeTimerCount + this._activeTimers.size;
  }

  /**
   * Trigger the graceful shutdown sequence.
   * Idempotent: if already shutting down, returns immediately.
   */
  async trigger(reason: string): Promise<void> {
    // Idempotent: if already shutting down, return immediately
    if (this._isShuttingDown) {
      return;
    }

    this._isShuttingDown = true;
    this._shutdownReason = reason;

    console.log(`[GracefulShutdown] Starting shutdown: ${reason}`);

    // Set up total shutdown timeout
    const totalTimeoutTimer = setTimeout(() => {
      console.error(
        `[GracefulShutdown] Total shutdown timeout (${this.totalShutdownTimeoutMs}ms) exceeded. Force exiting.`
      );
      process.exit(1);
    }, this.totalShutdownTimeoutMs);

    this._activeTimerCount++;
    this._activeTimers.add(totalTimeoutTimer);

    try {
      // Execute tasks in priority order
      const priorities: ShutdownPriority[] = [
        'stop-accepting',
        'drain',
        'flush',
        'close',
        'release',
      ];

      for (const priority of priorities) {
        const bucket = this.tasks.get(priority);
        if (!bucket || bucket.length === 0) {
          continue;
        }

        console.log(`[GracefulShutdown] Executing priority: ${priority} (${bucket.length} tasks)`);

        // Execute tasks in parallel (within same priority)
        // Use reverse order so later-registered tasks run first
        const tasksInPriority = bucket.map((entry) =>
          this.executeTask(entry, priority)
        );

        await Promise.all(tasksInPriority);
      }

      console.log('[GracefulShutdown] Shutdown sequence completed successfully');
    } catch (error) {
      console.error('[GracefulShutdown] Error during shutdown:', error);
      // Continue with cleanup even if tasks fail
    } finally {
      // Clean up total timeout timer
      clearTimeout(totalTimeoutTimer);
      this._activeTimerCount--;
      this._activeTimers.delete(totalTimeoutTimer);

      // Dispose resources
      await this[Symbol.asyncDispose]();
    }
  }

  /**
   * Execute a single shutdown task with timeout.
   * Task timeout triggers warning but continues execution.
   */
  private async executeTask(
    entry: ShutdownTaskEntry,
    priority: ShutdownPriority
  ): Promise<ShutdownTaskResult> {
    const { name, task } = entry;
    this._activeTaskCount++;

    // Create abort signal for this task
    const controller = new AbortController();
    const signal = controller.signal;

    // Set up task timeout
    let taskTimeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      taskTimeoutTimer = setTimeout(() => {
        resolve('timeout');
      }, this.taskTimeoutMs);
    });

    if (taskTimeoutTimer) {
      this._activeTimerCount++;
      this._activeTimers.add(taskTimeoutTimer);
    }

    try {
      // Race between task execution and timeout
      const result = await Promise.race([
        task(signal).then(() => 'completed' as const),
        timeoutPromise,
      ]);

      if (result === 'timeout') {
        // Timeout occurred - warning but continue
        console.warn(
          `[GracefulShutdown] Task "${name}" (${priority}) timed out after ${this.taskTimeoutMs}ms. Continuing...`
        );
        return { name, success: false, timedOut: true };
      }

      return { name, success: true, timedOut: false };
    } catch (error) {
      // Task threw an error - warning but continue
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[GracefulShutdown] Task "${name}" (${priority}) failed: ${err.message}. Continuing...`
      );
      return { name, success: false, timedOut: false, error: err };
    } finally {
      // C1: Always clean up timers in finally block
      if (taskTimeoutTimer) {
        clearTimeout(taskTimeoutTimer);
        this._activeTimerCount--;
        this._activeTimers.delete(taskTimeoutTimer);
      }

      // Cancel the task if it's still running
      controller.abort();

      this._activeTaskCount--;
    }
  }

  /**
   * AsyncDisposable implementation.
   * Releases all resources including timers and signal handlers.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    // Remove signal handlers
    if (this._attached) {
      for (const [signal] of this._signalHandlers) {
        process.removeListener(signal as 'SIGTERM' | 'SIGINT', this._signalHandlers.get(signal)!);
      }
      this._signalHandlers.clear();
      this._attached = false;
    }

    // Clear any remaining timers
    for (const timer of this._activeTimers) {
      clearTimeout(timer);
    }
    this._activeTimers.clear();
    this._activeTimerCount = 0;

    // Reset active task count (force cleanup - any running tasks are abandoned)
    this._activeTaskCount = 0;

    // Clear task buckets
    for (const bucket of this.tasks.values()) {
      bucket.length = 0;
    }

    console.log('[GracefulShutdown] Resources disposed');
  }

  /**
   * Synchronous dispose alias for compatibility.
   */
  dispose(): Promise<void> {
    return this[Symbol.asyncDispose]();
  }
}

/**
 * Factory function to create a GracefulShutdownHandler with optional auto-attach.
 */
export function createGracefulShutdownHandler(
  options: GracefulShutdownHandlerOptions & { autoAttach?: boolean } = {}
): GracefulShutdownHandler {
  const handler = new GracefulShutdownHandler(options);

  if (options.autoAttach) {
    handler.attachToProcess();
  }

  return handler;
}