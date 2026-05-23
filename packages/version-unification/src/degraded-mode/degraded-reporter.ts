/**
 * Degraded Reporter for version-unification module.
 * 
 * Prints formatted error messages when entering degraded mode,
 * with cause-specific templates per design §"Doctor / --version 输出格式".
 * 
 * @see Requirements 3.4, 13.4, 13.5
 */

import { getCodeVersion } from '../code-version.js';

/**
 * Details for degraded mode reporting.
 */
export interface DegradedReporterDetails {
  /** Observed data_schema_version (for HIGHER_THAN_KNOWN) */
  observed?: number;
  /** Highest known schema version (for HIGHER_THAN_KNOWN) */
  highest?: number;
  /** Failed migration pair [from, to] (for MIGRATION_FAILED) */
  pair?: [number, number];
  /** Path to diagnostic log (for MIGRATION_FAILED) */
  logPath?: string;
  /** Custom message or additional context */
  message?: string;
}

/**
 * Cause discriminators for degraded mode.
 */
export type DegradedCause = 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER';

/**
 * Reporter for degraded mode error messages.
 * 
 * Provides formatted output based on the cause of degradation:
 * - MIGRATION_FAILED: includes failed pair, log path, recommended next step
 * - HIGHER_THAN_KNOWN: includes observed dsv, highest schema, upgrade suggestion
 * - OTHER: generic message without migration-specific phrases
 */
export class DegradedReporter {
  /**
   * Prints a formatted degraded mode error message to stderr.
   * 
   * If printing fails, the error is silently swallowed (R13.4).
   * No retry is attempted, and no new error is thrown.
   * 
   * @param cause - The cause of degraded mode
   * @param details - Additional details for formatting
   * 
   * @example
   * // Report migration failure
   * DegradedReporter.print('MIGRATION_FAILED', {
   *   pair: [4, 5],
   *   logPath: 'D:\\code\\my-proj\\.specforge\\migration-error.log'
   * });
   * 
   * @example
   * // Report higher than known schema
   * DegradedReporter.print('HIGHER_THAN_KNOWN', {
   *   observed: 7,
   *   highest: 5
   * });
   * 
   * @example
   * // Report other cause
   * DegradedReporter.print('OTHER', { message: 'Configuration error' });
   */
  static print(cause: DegradedCause, details: DegradedReporterDetails = {}): void {
    try {
      const message = this.formatMessage(cause, details);
      console.error(message);
    } catch {
      // R13.4: print failure is silently swallowed, no retry, no new error
    }
  }

  /**
   * Formats the error message based on cause.
   * 
   * @param cause - The cause of degraded mode
   * @param details - Additional details for formatting
   * @returns Formatted error message
   */
  private static formatMessage(cause: DegradedCause, details: DegradedReporterDetails): string {
    switch (cause) {
      case 'MIGRATION_FAILED':
        return this.formatMigrationFailed(details);
      case 'HIGHER_THAN_KNOWN':
        return this.formatHigherThanKnown(details);
      case 'OTHER':
      default:
        return this.formatOther(details);
    }
  }

  /**
   * Formats MIGRATION_FAILED message per R13.4.
   * 
   * Format:
   * ```
   * [error] migration <from>→<to> failed.
   *         Diagnostic log: <logPath>
   *         Recommended next step: contact support or roll back SpecForge code.
   * ```
   */
  private static formatMigrationFailed(details: DegradedReporterDetails): string {
    const pair = details.pair ?? [0, 0];
    const logPath = details.logPath ?? 'unknown';
    const message = details.message ?? '';

    const pairStr = `${pair[0]}→${pair[1]}`;
    
    let output = `[error] migration ${pairStr} failed.\n`;
    output += `        Diagnostic log: ${logPath}\n`;
    output += `        Recommended next step: contact support or roll back SpecForge code.`;
    
    if (message) {
      output += `\n        Additional info: ${message}`;
    }
    
    return output;
  }

  /**
   * Formats HIGHER_THAN_KNOWN message per R10.5.
   * 
   * Format:
   * ```
   * [error] data_schema_version <observed> exceeds highest supported schema <highest>.
   *         Upgrade SpecForge: bun install specforge@latest (or similar).
   *         Current code_version: <codeVersion>
   * ```
   */
  private static formatHigherThanKnown(details: DegradedReporterDetails): string {
    const observed = details.observed ?? 0;
    const highest = details.highest ?? 0;
    const message = details.message ?? '';

    let codeVersion: string;
    try {
      codeVersion = getCodeVersion();
    } catch {
      codeVersion = 'unknown';
    }
    
    let output = `[error] data_schema_version ${observed} exceeds highest supported schema ${highest}.\n`;
    output += `        Upgrade SpecForge: bun install specforge@latest (or similar).\n`;
    output += `        Current code_version: ${codeVersion}`;
    
    if (message) {
      output += `\n        Additional info: ${message}`;
    }
    
    return output;
  }

  /**
   * Formats OTHER cause message per R13.5.
   * 
   * Does not contain migration-specific phrases.
   */
  private static formatOther(details: DegradedReporterDetails): string {
    const message = details.message ?? 'Unknown error';
    
    let output = `[error] SpecForge is in read-only degraded mode.\n`;
    output += `        Reason: ${message}`;
    
    return output;
  }

  /**
   * Returns the cause as a human-readable string for logging.
   * 
   * @param cause - The cause
   * @returns Human-readable cause string
   */
  static causeToString(cause: DegradedCause): string {
    switch (cause) {
      case 'MIGRATION_FAILED':
        return 'Migration failed';
      case 'HIGHER_THAN_KNOWN':
        return 'Schema version too high';
      case 'OTHER':
      default:
        return 'Other';
    }
  }
}