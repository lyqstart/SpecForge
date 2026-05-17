/**
 * Audit Logger implementation with performance optimization
 * 
 * Optimizations:
 * - Buffered writes: events are batched and written periodically
 * - Async writes: I/O doesn't block the caller
 * - Memory-efficient: bounded buffer size with force flush
 * 
 * Logs all scope-related decisions and violations to events.jsonl.
 */

import type {
  AuditLogger as IAuditLogger,
  ScopeViolationAttempt,
  FeatureFlagChange,
  ValidationResult,
  ScopeEvent,
  ScopeEventQuery,
  AgentIdentity
} from './types.js';
import { promises as fs } from 'fs';
import { join } from 'path';

interface BufferedEvent {
  event: ScopeEvent;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface FlushResult {
  success: boolean;
  eventsWritten: number;
  error: Error | undefined;
}

export class AuditLogger implements IAuditLogger {
  private logFilePath: string;
  private actor?: AgentIdentity;
  private directoryInitialized: Promise<void>;
  
  // Buffer configuration
  private eventBuffer: BufferedEvent[] = [];
  private readonly maxBufferSize: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private isFlushing: boolean = false;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  // Statistics for monitoring
  private stats: {
    eventsLogged: number;
    eventsWritten: number;
    flushCount: number;
    totalFlushTimeMs: number;
    lastFlushTime: Date | undefined;
  } = {
    eventsLogged: 0,
    eventsWritten: 0,
    flushCount: 0,
    totalFlushTimeMs: 0,
    lastFlushTime: undefined
  };

  /**
   * Create an AuditLogger instance
   *
   * ⚠️ **资源所有权**：本类持有后台 `setInterval` flush timer（仅当 `enableTimer: true`）。
   * 调用者**必须**在使用完毕后调 `dispose()`（或 `await using` 让作用域自动调 [Symbol.asyncDispose]）。
   * 漏调会导致 setInterval 永不释放，进程无法退出。
   *
   * 安全默认（P4）：`enableTimer` 默认 `false`——只有显式传 `{ enableTimer: true }` 才启动后台
   * timer。这让"忘了 dispose"在测试 / 短生命周期场景不会变成泄漏；只有真正需要后台缓冲刷盘的
   * 长生命周期场景（daemon 单例）才显式 opt-in。
   *
   * @param logDirectory - Directory for log files (default: ./logs)
   * @param actor - Optional actor identity for events
   * @param options - Buffer configuration options
   *
   * @example 测试 / 短生命周期场景（推荐）
   * ```ts
   * const audit = new AuditLogger('/tmp/log');     // 不起 setInterval
   * await audit.logViolationAttempt(...);
   * await audit.flushNow();                          // 显式刷盘代替自动 timer
   * await audit.dispose();                            // 释放资源
   * ```
   *
   * @example 长生命周期 daemon
   * ```ts
   * const audit = new AuditLogger('./logs', actor, { enableTimer: true });
   * // ...运行期间自动定期 flush...
   * process.on('SIGTERM', () => audit.dispose());
   * ```
   *
   * @example 配合 `await using`（TypeScript 5.2+）
   * ```ts
   * await using audit = new AuditLogger('/tmp/log', undefined, { enableTimer: true });
   * await audit.logViolationAttempt(...);
   * // 离开作用域自动 dispose
   * ```
   */
  constructor(
    logDirectory = './logs',
    actor?: AgentIdentity,
    options?: {
      /** Maximum events to buffer before forcing flush (default: 100) */
      maxBufferSize?: number;
      /** Flush interval in milliseconds (default: 1000) */
      flushIntervalMs?: number;
      /** Force flush when buffer reaches this size (default: 50) */
      highWaterMark?: number;
      /** Resume normal buffering after flush drops below this (default: 10) */
      lowWaterMark?: number;
      /**
       * 是否启动后台 setInterval 自动 flush。
       *
       * **默认 `false`（安全默认 P4）**——避免"忘了 dispose 就泄漏"。
       *
       * 仅在长生命周期单例（daemon 启动时持有的 logger）显式传 `true`。
       * 短生命周期 / 测试场景请保持默认 `false`，需要落盘时调 `flushNow()`。
       */
      enableTimer?: boolean;
    }
  ) {
    this.logFilePath = join(logDirectory, 'events.jsonl');
    this.actor = actor;
    
    // Buffer configuration with sensible defaults
    this.maxBufferSize = options?.maxBufferSize ?? 100;
    this.flushIntervalMs = options?.flushIntervalMs ?? 1000;
    this.highWaterMark = options?.highWaterMark ?? 50;
    this.lowWaterMark = options?.lowWaterMark ?? 10;
    // 安全默认（P4）：默认 false。生产代码长生命周期 daemon 显式传 true。
    this.enableTimer = options?.enableTimer ?? false;
    
    // Ensure log directory exists before any write operations
    this.directoryInitialized = this.ensureLogDirectory(logDirectory);
    
    // 仅当显式 enableTimer: true 时启动后台 timer（违反 P1 但被 opt-in 显式契约接管）
    if (this.enableTimer) {
      this.startFlushTimer();
    }
  }

  private enableTimer: boolean = true;

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(directory: string): Promise<void> {
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.warn(`Failed to create log directory: ${directory}`, error);
      }
    }
  }

  /**
   * Wait for directory to be initialized
   */
  private async ensureReady(): Promise<void> {
    await this.directoryInitialized;
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.flushIntervalMs);
    
    // Prevent timer from keeping process alive - unref allows process to exit even if timer is active
    this.flushTimer.unref();
  }

  /**
   * Stop the flush timer (useful for testing)
   */
  public stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Log scope boundary violation attempt
   */
  async logViolationAttempt(violation: ScopeViolationAttempt): Promise<void> {
    await this.ensureReady();
    
    const event: ScopeEvent = {
      eventId: this.generateEventId(),
      type: "scope_violation",
      payload: violation,
      timestamp: new Date(),
      actor: this.actor
    };
    
    await this.bufferEvent(event);
    this.stats.eventsLogged++;
  }

  /**
   * Log feature flag enablement/disablement
   */
  async logFeatureFlagChange(change: FeatureFlagChange): Promise<void> {
    await this.ensureReady();
    
    const event: ScopeEvent = {
      eventId: this.generateEventId(),
      type: "feature_flag_change",
      payload: change,
      timestamp: new Date(),
      actor: this.actor
    };
    
    await this.bufferEvent(event);
    this.stats.eventsLogged++;
  }

  /**
   * Log scope validation results
   */
  async logValidationResults(results: ValidationResult[]): Promise<void> {
    await this.ensureReady();
    
    const event: ScopeEvent = {
      eventId: this.generateEventId(),
      type: "scope_validation",
      payload: { results },
      timestamp: new Date(),
      actor: this.actor
    };
    
    await this.bufferEvent(event);
    this.stats.eventsLogged++;
  }

  /**
   * Add event to buffer (async, non-blocking)
   */
  private bufferEvent(event: ScopeEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create buffered event with settlement callbacks
      const bufferedEvent: BufferedEvent = { event, resolve, reject };
      
      this.eventBuffer.push(bufferedEvent);
      
      // Force flush if we hit high water mark
      if (this.eventBuffer.length >= this.highWaterMark) {
        this.flush(true).then(() => resolve()).catch(reject);
      } else {
        // Resolve immediately - the event is safely in the buffer
        // It will be flushed later by the timer or by flushNow
        resolve();
      }
    });
  }

  /**
   * Flush buffer to disk
   * Writes all buffered events in a single I/O operation
   * @param force If true, ignores water mark checks and always flushes
   */
  private async flush(force: boolean = false): Promise<FlushResult> {
    // Skip if already flushing or buffer is empty
    if (this.isFlushing || this.eventBuffer.length === 0) {
      return { success: true, eventsWritten: 0 };
    }
    
    // Don't flush if below low water mark (unless forced or shutting down)
    if (!force && this.eventBuffer.length < this.lowWaterMark && !this.isShuttingDown) {
      return { success: true, eventsWritten: 0 };
    }
    
    this.isFlushing = true;
    const startTime = Date.now();
    
    try {
      // Take all events from buffer
      const eventsToWrite = this.eventBuffer.splice(0, this.eventBuffer.length);
      
      if (eventsToWrite.length === 0) {
        this.isFlushing = false;
        return { success: true, eventsWritten: 0 };
      }
      
      // Serialize events to JSONL format
      const lines = eventsToWrite.map(be => JSON.stringify(be.event));
      const content = lines.join('\n') + '\n';
      
      // Atomic append to file
      await fs.appendFile(this.logFilePath, content, 'utf-8');
      
      // Resolve all promises
      for (const bufferedEvent of eventsToWrite) {
        bufferedEvent.resolve();
      }
      
      // Update statistics
      const flushTime = Date.now() - startTime;
      this.stats.eventsWritten += eventsToWrite.length;
      this.stats.flushCount++;
      this.stats.totalFlushTimeMs += flushTime;
      this.stats.lastFlushTime = new Date();
      
      this.isFlushing = false;
      
      return {
        success: true,
        eventsWritten: eventsToWrite.length
      };
    } catch (error) {
      const err = error as Error;
      
      // Reject all promises
      for (const bufferedEvent of this.eventBuffer) {
        bufferedEvent.reject(err);
      }
      
      this.isFlushing = false;
      
      console.error('Failed to flush audit log:', err);
      
      return {
        success: false,
        eventsWritten: 0,
        error: err
      };
    }
  }

  /**
   * Force flush all buffered events immediately
   * Useful when you need to ensure events are written before continuing
   */
  async flushNow(): Promise<FlushResult> {
    return this.flush(true);
  }

  /**
   * Query scope-related events
   * Automatically flushes buffered events before reading
   */
  async queryScopeEvents(query: ScopeEventQuery): Promise<ScopeEvent[]> {
    await this.ensureReady();
    
    // Auto-flush before reading to ensure all events are available
    await this.flushNow();
    
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const events: ScopeEvent[] = lines.map(line => JSON.parse(line));
      
      // Apply query filters
      return events.filter(event => {
        // Convert timestamp to Date if it's a string
        const eventDate = typeof event.timestamp === 'string' 
          ? new Date(event.timestamp) 
          : event.timestamp;
        
        if (query.startDate && eventDate < query.startDate) return false;
        if (query.endDate && eventDate > query.endDate) return false;
        if (query.eventType && event.type !== query.eventType) return false;
        
        // Capability ID filter only applies to scope_violation events
        if (query.capabilityId) {
          if (event.type === "scope_violation") {
            const violation = event.payload as ScopeViolationAttempt;
            if (violation.capabilityId !== query.capabilityId) return false;
          } else {
            // If capabilityId filter is specified but event is not a violation, exclude it
            return false;
          }
        }
        
        if (query.actorId && event.actor?.id !== query.actorId) return false;
        
        return true;
      });
    } catch (error) {
      // File might not exist yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Append event to log file (legacy method for compatibility)
   * @deprecated Use bufferEvent instead for better performance
   */
  private async appendEvent(event: ScopeEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    
    try {
      await fs.appendFile(this.logFilePath, line, 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Fallback to console for critical events
      console.warn('Audit event (failed to write to file):', event);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set the current actor
   */
  setActor(actor: AgentIdentity | undefined): void {
    this.actor = actor;
  }

  /**
   * Get the current actor
   */
  getActor(): AgentIdentity | undefined {
    return this.actor;
  }

  /**
   * Clear the log file
   */
  async clearLogs(): Promise<void> {
    await this.ensureReady();
    await this.flushNow();
    
    try {
      await fs.writeFile(this.logFilePath, '', 'utf-8');
    } catch (error) {
      console.error('Failed to clear audit logs:', error);
    }
  }

  /**
   * Get log file statistics
   */
  async getLogStats(): Promise<{
    fileSize: number;
    eventCount: number;
    lastEventTime?: Date;
    eventTypes: Record<string, number>;
  }> {
    await this.flushNow();
    
    try {
      const stats = await fs.stat(this.logFilePath);
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const events: ScopeEvent[] = lines.map(line => JSON.parse(line));
      const eventTypes: Record<string, number> = {};
      
      for (const event of events) {
        eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
      }
      
      const lastEvent = events[events.length - 1];
      
      return {
        fileSize: stats.size,
        eventCount: events.length,
        lastEventTime: lastEvent?.timestamp,
        eventTypes
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          fileSize: 0,
          eventCount: 0,
          eventTypes: {}
        };
      }
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    eventsLogged: number;
    eventsWritten: number;
    flushCount: number;
    averageFlushTimeMs: number;
    bufferSize: number;
    lastFlushTime?: Date;
  } {
    return {
      eventsLogged: this.stats.eventsLogged,
      eventsWritten: this.stats.eventsWritten,
      flushCount: this.stats.flushCount,
      averageFlushTimeMs: this.stats.flushCount > 0 
        ? this.stats.totalFlushTimeMs / this.stats.flushCount 
        : 0,
      bufferSize: this.eventBuffer.length,
      lastFlushTime: this.stats.lastFlushTime
    };
  }

  /**
   * Shutdown the logger, flushing all remaining events
   * Call this when the application is shutting down
   *
   * @deprecated 用 `dispose()` 替代（Disposable 协议统一）。本方法保留作向后兼容，
   * 内部直接调用 `dispose()`。
   */
  async shutdown(): Promise<void> {
    await this.dispose();
  }

  /**
   * 释放所有资源（Disposable 协议）：
   * 1. 标记进入 shutting down 状态（让 flush 不再被 lowWaterMark 阻挡）
   * 2. 停止后台 flush timer（如果有）
   * 3. flush buffer 里残余事件到磁盘
   * 4. 标记已 disposed
   *
   * **幂等**：多次调用安全（第二次起立即返回）。
   *
   * 调用方必须在销毁对象前调本方法，否则 setInterval 永不释放。
   * 推荐用 `await using audit = ...`（TS 5.2+）让作用域自动调。
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;  // 幂等
    this.isShuttingDown = true;
    this.stopFlushTimer();
    try {
      await this.flushNow();
    } finally {
      this._disposed = true;
    }
  }

  /**
   * 配合 `await using` 语法（TS 5.2+ / Node 22+）。
   *
   * @example
   * ```ts
   * await using audit = new AuditLogger('/tmp/log', actor, { enableTimer: true });
   * // 离开作用域自动调 dispose
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  /**
   * 自检 API（P5 副作用可观测）：返回当前活跃的 timer 数量。
   *
   * - dispose 之前：`enableTimer: true` 时为 1，否则为 0
   * - dispose 之后：恒为 0
   *
   * **测试断言用法**：
   * ```ts
   * afterEach(async () => {
   *   await audit?.dispose();
   *   expect(audit?.getActiveTimerCount() ?? 0).toBe(0);
   * });
   * ```
   */
  getActiveTimerCount(): number {
    return this.flushTimer === undefined ? 0 : 1;
  }

  /**
   * 自检 API：是否已 dispose
   */
  isDisposed(): boolean {
    return this._disposed;
  }

  private isShuttingDown: boolean = false;
  private _disposed: boolean = false;

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.eventBuffer.length;
  }
}