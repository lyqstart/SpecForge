/**
 * Read-Only Degraded Mode for version-unification module.
 * 
 * Provides module-level state management for entering and exiting
 * read-only degraded mode, with cause tracking and write protection.
 * 
 * @see Requirements 13.3
 */

import { ReadOnlyDegradedError } from '../manifest/types.js';

// =============================================================================
// Module-Level State
// =============================================================================

/**
 * Current degraded mode state.
 * - null: System is in normal read-write mode
 * - cause: System is in read-only degraded mode with specified cause
 */
let degradedState: Readonly<{ cause: 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER' }> | null = null;

/**
 * Retrieves the current degraded mode state.
 * 
 * @returns The current cause if in degraded mode, or null if in normal mode
 */
export function getDegradedState(): 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER' | null {
  return degradedState?.cause ?? null;
}

/**
 * Checks whether the system is currently in read-only degraded mode.
 * 
 * @returns true if in degraded mode, false otherwise
 */
export function isDegraded(): boolean {
  return degradedState !== null;
}

// =============================================================================
// Mode Entry
// =============================================================================

/**
 * Cause discriminators for entering read-only degraded mode.
 */
export type DegradedCause = 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER';

/**
 * Enters read-only degraded mode with the specified cause.
 * 
 * Once entered, all write operations via requireWritable() will be rejected.
 * 
 * @param cause - The reason for entering degraded mode
 * @param message - Optional custom error message
 * 
 * @example
 * // Enter degraded mode when data schema version exceeds known versions
 * enterReadOnly('HIGHER_THAN_KNOWN');
 * 
 * @example
 * // Enter degraded mode when migration fails
 * enterReadOnly('MIGRATION_FAILED');
 */
export function enterReadOnly(cause: DegradedCause, message?: string): void {
  if (degradedState !== null) {
    // Already in degraded mode, optionally update the cause if different
    if (degradedState.cause !== cause) {
      degradedState = { cause };
    }
    return;
  }
  
  degradedState = { cause };
  
  // Optionally log or emit event (silently fail if logging fails per R13.4)
  try {
    console.error(`[version-unification] Entered read-only degraded mode: ${cause}${message ? ` - ${message}` : ''}`);
  } catch {
    // Silently swallow logging failures
  }
}

/**
 * Exits read-only degraded mode, returning to normal read-write mode.
 * 
 * @example
 * // After resolving the degraded condition
 * exitReadOnly();
 */
export function exitReadOnly(): void {
  degradedState = null;
}

// =============================================================================
// Write Guard
// =============================================================================

/**
 * Guard function that throws ReadOnlyDegradedError if the system is in read-only mode.
 * 
 * Use this to protect any write operation from executing when the system
 * has been degraded to read-only mode.
 * 
 * @throws {ReadOnlyDegradedError} If the system is in read-only degraded mode
 * 
 * @example
 * // Before any write operation
 * requireWritable();
 * // Proceed with write operation...
 */
export function requireWritable(): void {
  if (degradedState !== null) {
    throw new ReadOnlyDegradedError(degradedState.cause);
  }
}

/**
 * Guard function that checks if a write operation is allowed without throwing.
 * 
 * @returns true if write operations are allowed, false if in degraded mode
 * 
 * @example
 * if (canWrite()) {
 *   // Perform write operation
 * }
 */
export function canWrite(): boolean {
  return degradedState === null;
}

/**
 * Executes a function only if the system is in writable mode.
 * 
 * @param fn - The function to execute
 * @returns The result of fn if executed, undefined if in degraded mode
 * @throws {ReadOnlyDegradedError} If the system is in read-only degraded mode
 * 
 * @example
 * const result = writeIfAllowed(() => {
 *   return performWriteOperation();
 * });
 */
export function writeIfAllowed<T>(fn: () => T): T | undefined {
  requireWritable();
  return fn();
}