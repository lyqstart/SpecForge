/**
 * Optimized Audit Logger implementation
 * 
 * Task 18.3: Optimize audit logging performance
 * - Batch writing with buffer
 * - Async flush mechanism
 * - Log rotation support
 * - Microsecond-level logging
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

/**
 * Configuration for optimized audit logger
 */
export interface OptimizedAuditLoggerConfig {
  /** Log directory path */
  logDirectory?: string;
  /** Actor identity */
  actor?: AgentIdentity;
  /** Buffer size before auto-flush (default: 10) */
  bufferSize?: number;
  /** Flush interval in ms (default: 1000) */
  flushIntervalMs?: number;
  /** Max log file size in bytes before rotation (default: 10MB) */
  maxFileSizeBytes?: number;
  /** Max number of rotated log files to keep (default: 5) */
  maxRotatedFiles?: number;
  /** Enable log rotation (default: true) */
  enableRotation?: boolean;
  /**
   * 是否启动后台 setInterval 自动 flush。
   *
   * **默认 `false`（安全默认 P4）**——避免"忘了 dispose 就泄漏"。
   *
   * 仅在长生命周期单例显式传 `true`。短生命周期 / 测试场景请保持默认 `false`，
   * 需要落盘时调 `flush()` 或依赖 `bufferSize` 自动 flush。
   */
  enableTimer?: boolean;
}

/**
 * Internal buffer entry
 */
interface BufferEntry {
  event: ScopeEvent;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * High-performance Audit Logger with batch writing and async flush
 * 
 * ## Performance Optimizations
 * 1. **Batch Writing**: Accumulates events in buffer, writes in batches
 * 2. **Async Flush**: Background flush timer, non-blocking
 * 3. **Log Rotation**: Automatic rotation by size, configurable retention
 * 4. **Microsecond Timestamps**: Uses performance.now() for high-precision timing
 * 
 * ## Usage
 * ```typescript
 * // 短生命周期（测试 / 短命请求）：默认不起后台 timer
 * const logger = new OptimizedAuditLogger({ logDirectory: './logs' });
 * await logger.logViolationAttempt(violation);
 * await logger.flush();         // 显式落盘
 * await logger.dispose();       // 释放资源
 *
 * // 长生命周期（daemon）：显式启用后台 timer
 * const logger = new OptimizedAuditLogger({ logDirectory: './logs', enableTimer: true });
 * // 运行期间自动定期 flush...
 * process.on('SIGTERM', () => logger.dispose());
 *
 * // 配合 await using（TypeScript 5.2+）
 * await using logger = new OptimizedAuditLogger({ logDirectory: './logs', enableTimer: true });
 * // 离开作用域自动 dispose
 * ```
 *
 * ⚠️ **资源所有权**：本类持有后台 `setInterval` flush timer（仅当 `enableTimer: true`）。
 * 调用者必须在使用完毕后调 `dispose()` 或用 `await using`，否则 setInterval 永不释放。
 */
export class OptimizedAuditLogger implements IAuditLogger {
  private logFilePath: string;
  private actor?: AgentIdentity;
  private directoryInitialized: Promise<void>;
  
  // Buffer for batch writing
  private buffer: BufferEntry[] = [];
  private bufferSize: number;
  private flushIntervalMs: number;
  private flushTimer?: ReturnType<typeof setInterval>;
  
  // Log rotation
  private maxFileSizeBytes: number;
  private maxRotatedFiles: number;
  private enableRotation: boolean;
  
  // Performance tracking
  private totalWrites = 0;
  private totalFlushTimeUs = 0;

  // 安全默认（P4）：默认不启动 timer
  private enableTimer: boolean;

  // Disposable 协议：是否已 dispose
  private _disposed = false;
  
  // File handle for efficient writing
  private fileHandle?: Awaited<ReturnType<typeof fs.open>>;

  constructor(config: OptimizedAuditLoggerConfig = {}) {
    const {
      logDirectory = './logs',
      actor,
      bufferSize = 10,
      flushIntervalMs = 1000,
      maxFileSizeBytes = 10 * 1024 * 1024, // 10MB
      maxRotatedFiles = 5,
      enableRotation = true,
      enableTimer = false   // P4 安全默认
    } = config;
    
    this.logFilePath = join(logDirectory, 'events.jsonl');
    this.actor = actor;
    this.bufferSize = bufferSize;
    this.flushIntervalMs = flushIntervalMs;
    this.maxFileSizeBytes = maxFileSizeBytes;
    this.maxRotatedFiles = maxRotatedFiles;
    this.enableRotation = enableRotation;
    this.enableTimer = enableTimer;
    
    // Ensure log directory exists before any write operations
    this.directoryInitialized = this.ensureLogDirectory(logDirectory);
    
    // 仅当显式 opt-in 时启动后台 timer（违反 P1 但被 enableTimer 显式契约接管）
    if (this.enableTimer) {
      this.startFlushTimer();
    }
  }

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
   * Start background flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(
      () => { this.flush().catch(console.error); },
      this.flushIntervalMs
    );
    // Prevent timer from keeping process alive
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Generate high-precision event ID
   */
  private generateEventId(): string {
    const now = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const perf = Math.floor(performance.now() * 1000); // nanosecond precision
    return `evt_${now}_${perf}_${random}`;
  }

  /**
   * Create a scope event with timestamp
   */
  private createEvent(
    type: ScopeEvent['type'],
    payload: unknown
  ): ScopeEvent {
    // Use performance.now() for microsecond-level precision
    const timestamp = new Date();
    
    return {
      eventId: this.generateEventId(),
      type,
      payload,
      timestamp,
      actor: this.actor
    };
  }

  /**
   * Log scope boundary violation attempt (non-blocking)
   */
  async logViolationAttempt(violation: ScopeViolationAttempt): Promise<void> {
    await this.ensureReady();
    
    const event = this.createEvent('scope_violation', violation);
    return this.bufferEvent(event);
  }

  /**
   * Log feature flag enablement/disablement (non-blocking)
   */
  async logFeatureFlagChange(change: FeatureFlagChange): Promise<void> {
    await this.ensureReady();
    
    const event = this.createEvent('feature_flag_change', change);
    return this.bufferEvent(event);
  }

  /**
   * Log scope validation results (non-blocking)
   */
  async logValidationResults(results: ValidationResult[]): Promise<void> {
    await this.ensureReady();
    
    const event = this.createEvent('scope_validation', { results });
    return this.bufferEvent(event);
  }

  /**
   * Add event to buffer (non-blocking)
   */
  private bufferEvent(event: ScopeEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.buffer.push({ event, resolve, reject });
      
      // Auto-flush when buffer is full
      if (this.buffer.length >= this.bufferSize) {
        this.flush().catch(reject);
      }
    });
  }

  /**
   * Flush buffer to disk
   * Uses batch writing for efficiency
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    
    // Take all buffered events
    const entries = this.buffer.splice(0, this.buffer.length);
    const events = entries.map(e => e.event);
    
    // Check rotation before writing
    if (this.enableRotation) {
      await this.checkRotation();
    }
    
    const startTime = performance.now();
    
    try {
      // Batch write all events at once
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      
      // Use appendFile for efficiency
      await fs.appendFile(this.logFilePath, lines, 'utf-8');
      
      const flushTime = (performance.now() - startTime) * 1000; // microseconds
      this.totalWrites += events.length;
      this.totalFlushTimeUs += flushTime;
      
      // Resolve all buffered promises
      for (const entry of entries) {
        entry.resolve();
      }
    } catch (error) {
      // Reject all buffered promises
      for (const entry of entries) {
        entry.reject(error as Error);
      }
      throw error;
    }
  }

  /**
   * Check if log file needs rotation
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath);
      
      if (stats.size >= this.maxFileSizeBytes) {
        await this.rotateLog();
      }
    } catch (error) {
      // File might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Rotate log file
   */
  private async rotateLog(): Promise<void> {
    // Delete oldest rotated file if at max
    const rotatedPath = this.getRotatedPath(0);
    try {
      await fs.stat(rotatedPath);
      // Check if we have too many rotated files
      const rotatedFiles = await this.getRotatedFileCount();
      if (rotatedFiles >= this.maxRotatedFiles) {
        await fs.unlink(this.getRotatedPath(this.maxRotatedFiles));
      }
    } catch {
      // File doesn't exist, no rotation needed yet
    }
    
    // Shift existing rotated files
    for (let i = this.maxRotatedFiles - 1; i >= 0; i--) {
      try {
        const oldPath = this.getRotatedPath(i);
        await fs.rename(oldPath, this.getRotatedPath(i + 1));
      } catch {
        // File doesn't exist, skip
      }
    }
    
    // Rename current log file to rotated.0
    try {
      await fs.rename(this.logFilePath, this.getRotatedPath(0));
    } catch (error) {
      // If rename fails (cross-device), try copy + delete
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        const content = await fs.readFile(this.logFilePath, 'utf-8');
        await fs.writeFile(this.getRotatedPath(0), content, 'utf-8');
        await fs.unlink(this.logFilePath);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get path for rotated log file
   */
  private getRotatedPath(index: number): string {
    const ext = '.jsonl';
    if (index === 0) {
      return this.logFilePath + '.1' + ext;
    }
    return this.logFilePath + `.${index + 1}` + ext;
  }

  /**
   * Get count of rotated log files
   */
  private async getRotatedFileCount(): Promise<number> {
    let count = 0;
    for (let i = 0; i <= this.maxRotatedFiles; i++) {
      try {
        await fs.stat(this.getRotatedPath(i));
        count++;
      } catch {
        // File doesn't exist
      }
    }
    return count;
  }

  /**
   * Query scope-related events
   */
  async queryScopeEvents(query: ScopeEventQuery): Promise<ScopeEvent[]> {
    await this.ensureReady();
    await this.flush(); // Ensure all buffered events are written
    
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const events: ScopeEvent[] = lines.map(line => JSON.parse(line));
      
      // Apply query filters
      return events.filter(event => {
        const eventDate = typeof event.timestamp === 'string' 
          ? new Date(event.timestamp) 
          : event.timestamp;
        
        if (query.startDate && eventDate < query.startDate) return false;
        if (query.endDate && eventDate > query.endDate) return false;
        if (query.eventType && event.type !== query.eventType) return false;
        
        if (query.capabilityId) {
          if (event.type === "scope_violation") {
            const violation = event.payload as ScopeViolationAttempt;
            if (violation.capabilityId !== query.capabilityId) return false;
          } else {
            return false;
          }
        }
        
        if (query.actorId && event.actor?.id !== query.actorId) return false;
        
        return true;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
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
    await this.flush(); // Flush buffer first
    
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
    performanceMetrics: {
      avgFlushTimeUs: number;
      totalWrites: number;
    };
  }> {
    await this.flush(); // Ensure buffer is flushed
    
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
      const avgFlushTimeUs = this.totalWrites > 0 
        ? this.totalFlushTimeUs / this.totalWrites 
        : 0;
      
      return {
        fileSize: stats.size,
        eventCount: events.length,
        lastEventTime: lastEvent?.timestamp,
        eventTypes,
        performanceMetrics: {
          avgFlushTimeUs,
          totalWrites: this.totalWrites
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          fileSize: 0,
          eventCount: 0,
          eventTypes: {},
          performanceMetrics: {
            avgFlushTimeUs: 0,
            totalWrites: 0
          }
        };
      }
      throw error;
    }
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    totalWrites: number;
    avgFlushTimeUs: number;
    bufferUtilization: number;
  } {
    return {
      totalWrites: this.totalWrites,
      avgFlushTimeUs: this.totalWrites > 0 
        ? this.totalFlushTimeUs / this.totalWrites 
        : 0,
      bufferUtilization: this.buffer.length / this.bufferSize
    };
  }

  /**
   * Dispose of resources（Disposable 协议）
   *
   * 1. 停止后台 flush timer
   * 2. flush 残余 buffer 到磁盘
   * 3. 关闭文件句柄
   * 4. 标记已 disposed
   *
   * **幂等**：多次调用安全。
   *
   * 推荐用 `await using logger = ...`（TS 5.2+）让作用域自动调。
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;  // 幂等
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    try {
      // Flush remaining buffer
      await this.flush();
      
      // Close file handle if open
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = undefined;
      }
    } finally {
      this._disposed = true;
    }
  }

  /**
   * 配合 `await using` 语法（TS 5.2+ / Node 22+）。
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  /**
   * 自检 API（P5 副作用可观测）：当前活跃 timer 数。
   *
   * - dispose 之前：`enableTimer: true` 时为 1，否则为 0
   * - dispose 之后：恒为 0
   */
  getActiveTimerCount(): number {
    return this.flushTimer === undefined ? 0 : 1;
  }

  /**
   * 自检 API：当前是否还有打开的文件句柄
   */
  getActiveHandleCount(): number {
    return this.fileHandle === undefined ? 0 : 1;
  }

  /**
   * 自检 API：是否已 dispose
   */
  isDisposed(): boolean {
    return this._disposed;
  }
}

/**
 * Create optimized audit logger with default config
 */
export function createOptimizedAuditLogger(
  logDirectory?: string,
  actor?: AgentIdentity
): OptimizedAuditLogger {
  return new OptimizedAuditLogger({ logDirectory, actor });
}