/**
 * Diagnostics Logger Module
 *
 * Provides comprehensive logging and diagnostics for the OpenCode Adapter:
 * - Configurable log levels (debug, info, warn, error)
 * - Translation logging with configurable detail
 * - Performance metrics collection
 * - Compatibility warnings
 * - Debug information output
 *
 * Requirements: 3.3
 */

import type { TranslationResult } from '../types';

/**
 * Log level enumeration
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Timestamp */
  timestamp: Date;
  /** Log message */
  message: string;
  /** Optional context/data */
  context?: Record<string, unknown>;
  /** Source module/component */
  source: string;
}

/**
 * Performance metric entry
 */
export interface PerformanceMetric {
  /** Operation name */
  operation: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Success/failure */
  success: boolean;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Compatibility warning
 */
export interface CompatibilityWarning {
  /** Warning type */
  type: 'version_mismatch' | 'feature_unsupported' | 'translation_warning' | 'deprecated';
  /** Warning message */
  message: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high';
  /** Timestamp */
  timestamp: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Translation log entry
 */
export interface TranslationLogEntry {
  /** Translation type (event, tool, context, capability) */
  translationType: 'event' | 'tool' | 'context' | 'capability';
  /** Input type */
  inputType: string;
  /** Output type */
  outputType: string;
  /** Success or failure */
  success: boolean;
  /** If failed, the reason */
  reason?: string;
  /** Timestamp */
  timestamp: Date;
  /** Processing duration in ms */
  duration: number;
}

/**
 * Diagnostic configuration
 */
export interface DiagnosticsConfig {
  /** Minimum log level to record */
  logLevel: LogLevel;
  /** Enable translation logging */
  translationLogging: boolean;
  /** Enable performance metrics */
  performanceMetrics: boolean;
  /** Enable compatibility warnings */
  compatibilityWarnings: boolean;
  /** Enable debug information */
  debugInfo: boolean;
  /** Maximum log entries to keep */
  maxLogEntries: number;
  /** Maximum performance metrics to keep */
  maxPerformanceMetrics: number;
  /** Log output callback (if not using default console) */
  logOutput?: (entry: LogEntry) => void;
}

/**
 * Default diagnostics configuration
 */
export const DEFAULT_DIAGNOSTICS_CONFIG: DiagnosticsConfig = {
  logLevel: 'info',
  translationLogging: false,
  performanceMetrics: false,
  compatibilityWarnings: true,
  debugInfo: false,
  maxLogEntries: 1000,
  maxPerformanceMetrics: 500,
};

/**
 * Log level priority (higher = more severe)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * DiagnosticsLogger class
 *
 * Provides centralized logging and diagnostics for the adapter.
 * Can be integrated with external logging systems via logOutput callback.
 */
export class DiagnosticsLogger {
  private config: DiagnosticsConfig;
  private logEntries: LogEntry[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private translationLogs: TranslationLogEntry[] = [];
  private compatibilityWarnings: CompatibilityWarning[] = [];
  
  // Active performance tracking
  private activeOperations: Map<string, number> = new Map();

  constructor(config: Partial<DiagnosticsConfig> = {}) {
    this.config = { ...DEFAULT_DIAGNOSTICS_CONFIG, ...config };
  }

  // ============================================================
  // Configuration Methods
  // ============================================================

  /**
   * Update diagnostics configuration
   */
  updateConfig(config: Partial<DiagnosticsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DiagnosticsConfig {
    return { ...this.config };
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.config.logLevel = level;
  }

  /**
   * Get log level
   */
  getLogLevel(): LogLevel {
    return this.config.logLevel;
  }

  // ============================================================
  // Logging Methods
  // ============================================================

  /**
   * Check if a log level should be recorded
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.logLevel];
  }

  /**
   * Create and record a log entry
   */
  private log(level: LogLevel, source: string, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date(),
      message,
      context,
      source,
    };

    // Add to in-memory buffer
    this.logEntries.push(entry);
    
    // Trim if exceeds max
    if (this.logEntries.length > this.config.maxLogEntries) {
      this.logEntries.shift();
    }

    // Output to callback or console
    if (this.config.logOutput) {
      this.config.logOutput(entry);
    } else {
      this.outputToConsole(entry);
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp.toISOString()}] [${entry.source.toUpperCase()}] [${entry.level.toUpperCase()}]`;
    
    switch (entry.level) {
      case 'debug':
        console.debug(prefix, entry.message, entry.context ?? '');
        break;
      case 'info':
        console.info(prefix, entry.message, entry.context ?? '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.context ?? '');
        break;
      case 'error':
        console.error(prefix, entry.message, entry.context ?? '');
        break;
    }
  }

  /**
   * Log a debug message
   */
  debug(source: string, message: string, context?: Record<string, unknown>): void {
    this.log('debug', source, message, context);
  }

  /**
   * Log an info message
   */
  info(source: string, message: string, context?: Record<string, unknown>): void {
    this.log('info', source, message, context);
  }

  /**
   * Log a warning message
   */
  warn(source: string, message: string, context?: Record<string, unknown>): void {
    this.log('warn', source, message, context);
  }

  /**
   * Log an error message
   */
  error(source: string, message: string, context?: Record<string, unknown>): void {
    this.log('error', source, message, context);
  }

  // ============================================================
  // Translation Logging
  // ============================================================

  /**
   * Log a translation operation
   */
  logTranslation(
    translationType: TranslationLogEntry['translationType'],
    inputType: string,
    outputType: string,
    result: TranslationResult<unknown>,
    duration: number
  ): void {
    if (!this.config.translationLogging) {
      return;
    }

    const entry: TranslationLogEntry = {
      translationType,
      inputType,
      outputType,
      success: result.success,
      reason: result.success ? undefined : (result as { reason?: string }).reason,
      timestamp: new Date(),
      duration,
    };

    this.translationLogs.push(entry);

    // Trim if exceeds max
    if (this.translationLogs.length > this.config.maxLogEntries) {
      this.translationLogs.shift();
    }

    // Also log as regular log entry
    if (result.success) {
      this.debug('translation', 
        `Translated ${translationType}: ${inputType} → ${outputType} (${duration.toFixed(2)}ms)`,
        { translationType, inputType, outputType, duration }
      );
    } else {
      this.warn('translation',
        `Translation failed: ${translationType} ${inputType} → ${outputType}`,
        { translationType, inputType, outputType, reason: entry.reason, duration }
      );
    }
  }

  /**
   * Get translation logs
   */
  getTranslationLogs(): TranslationLogEntry[] {
    return [...this.translationLogs];
  }

  /**
   * Clear translation logs
   */
  clearTranslationLogs(): void {
    this.translationLogs = [];
  }

  // ============================================================
  // Performance Metrics
  // ============================================================

  /**
   * Start tracking an operation
   */
  startOperation(operation: string): void {
    if (!this.config.performanceMetrics) {
      return;
    }
    this.activeOperations.set(operation, Date.now());
  }

  /**
   * End tracking an operation
   */
  endOperation(operation: string, success: boolean = true, metadata?: Record<string, unknown>): void {
    if (!this.config.performanceMetrics) {
      return;
    }

    const startTime = this.activeOperations.get(operation);
    if (!startTime) {
      this.warn('performance', `No start time found for operation: ${operation}`);
      return;
    }

    const endTime = Date.now();
    const metric: PerformanceMetric = {
      operation,
      startTime,
      endTime,
      duration: endTime - startTime,
      success,
      metadata,
    };

    this.performanceMetrics.push(metric);
    this.activeOperations.delete(operation);

    // Trim if exceeds max
    if (this.performanceMetrics.length > this.config.maxPerformanceMetrics) {
      this.performanceMetrics.shift();
    }

    // Log slow operations
    if (metric.duration > 1000) {
      this.warn('performance', `Slow operation detected: ${operation}`, {
        duration: metric.duration,
        ...metadata,
      });
    }
  }

  /**
   * Track a performance metric directly
   */
  trackMetric(operation: string, duration: number, success: boolean, metadata?: Record<string, unknown>): void {
    if (!this.config.performanceMetrics) {
      return;
    }

    const startTime = Date.now() - duration;
    const metric: PerformanceMetric = {
      operation,
      startTime,
      endTime: Date.now(),
      duration,
      success,
      metadata,
    };

    this.performanceMetrics.push(metric);

    // Trim if exceeds max
    if (this.performanceMetrics.length > this.config.maxPerformanceMetrics) {
      this.performanceMetrics.shift();
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetric[] {
    return [...this.performanceMetrics];
  }

  /**
   * Get average duration for an operation
   */
  getAverageDuration(operation: string): number | null {
    const metrics = this.performanceMetrics.filter(m => m.operation === operation);
    if (metrics.length === 0) {
      return null;
    }
    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): Record<string, { count: number; avgDuration: number; successRate: number }> {
    const summary: Record<string, { count: number; totalDuration: number; successCount: number }> = {};

    for (const metric of this.performanceMetrics) {
      const op = metric.operation;
      if (!summary[op]) {
        summary[op] = { count: 0, totalDuration: 0, successCount: 0 };
      }
      const entry = summary[op]!;
      entry.count++;
      entry.totalDuration += metric.duration;
      if (metric.success) {
        entry.successCount++;
      }
    }

    const result: Record<string, { count: number; avgDuration: number; successRate: number }> = {};
    for (const [op, data] of Object.entries(summary)) {
      result[op] = {
        count: data.count,
        avgDuration: data.totalDuration / data.count,
        successRate: data.successCount / data.count,
      };
    }

    return result;
  }

  /**
   * Clear performance metrics
   */
  clearPerformanceMetrics(): void {
    this.performanceMetrics = [];
  }

  // ============================================================
  // Compatibility Warnings
  // ============================================================

  /**
   * Add a compatibility warning
   */
  addCompatibilityWarning(
    type: CompatibilityWarning['type'],
    message: string,
    severity: CompatibilityWarning['severity'] = 'medium',
    metadata?: Record<string, unknown>
  ): void {
    if (!this.config.compatibilityWarnings) {
      return;
    }

    const warning: CompatibilityWarning = {
      type,
      message,
      severity,
      timestamp: new Date(),
      metadata,
    };

    this.compatibilityWarnings.push(warning);

    // Also log based on severity
    switch (severity) {
      case 'high':
        this.error('compatibility', message, metadata);
        break;
      case 'medium':
        this.warn('compatibility', message, metadata);
        break;
      case 'low':
        this.info('compatibility', message, metadata);
        break;
    }
  }

  /**
   * Get compatibility warnings
   */
  getCompatibilityWarnings(): CompatibilityWarning[] {
    return [...this.compatibilityWarnings];
  }

  /**
   * Get high severity warnings
   */
  getHighSeverityWarnings(): CompatibilityWarning[] {
    return this.compatibilityWarnings.filter(w => w.severity === 'high');
  }

  /**
   * Clear compatibility warnings
   */
  clearCompatibilityWarnings(): void {
    this.compatibilityWarnings = [];
  }

  // ============================================================
  // Debug Information
  // ============================================================

  /**
   * Get debug information
   */
  getDebugInfo(): {
    config: DiagnosticsConfig;
    logEntries: LogEntry[];
    performanceMetrics: PerformanceMetric[];
    translationLogs: TranslationLogEntry[];
    compatibilityWarnings: CompatibilityWarning[];
    activeOperations: string[];
    summary: {
      totalLogs: number;
      totalMetrics: number;
      totalTranslations: number;
      totalWarnings: number;
      performanceSummary: Record<string, { count: number; avgDuration: number; successRate: number }>;
    };
  } {
    return {
      config: this.getConfig(),
      logEntries: this.config.debugInfo ? this.logEntries : [],
      performanceMetrics: this.config.debugInfo ? this.performanceMetrics : [],
      translationLogs: this.config.debugInfo ? this.translationLogs : [],
      compatibilityWarnings: this.compatibilityWarnings,
      activeOperations: Array.from(this.activeOperations.keys()),
      summary: {
        totalLogs: this.logEntries.length,
        totalMetrics: this.performanceMetrics.length,
        totalTranslations: this.translationLogs.length,
        totalWarnings: this.compatibilityWarnings.length,
        performanceSummary: this.getPerformanceSummary(),
      },
    };
  }

  // ============================================================
  // Log Management
  // ============================================================

  /**
   * Get log entries
   */
  getLogEntries(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logEntries.filter(e => e.level === level);
    }
    return [...this.logEntries];
  }

  /**
   * Clear log entries
   */
  clearLogs(): void {
    this.logEntries = [];
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number): LogEntry[] {
    return this.logEntries.slice(-count);
  }

  /**
   * Clear all diagnostics data
   */
  clearAll(): void {
    this.logEntries = [];
    this.performanceMetrics = [];
    this.translationLogs = [];
    this.compatibilityWarnings = [];
    this.activeOperations.clear();
  }
}