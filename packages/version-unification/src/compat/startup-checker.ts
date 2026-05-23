/**
 * Startup compatibility checker for SpecForge.
 * 
 * This module determines the startup mode based on the project's data schema version
 * versus the running SpecForge code's supported schema range.
 * 
 * This is a PURE FUNCTION - no I/O, deterministic, idempotent.
 * 
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { compare, SchemaCompareResult } from './schema-compare.js';

/**
 * Represents the different operating modes SpecForge can start in.
 * 
 * - NORMAL_RW: Normal read-write mode, schema is supported
 * - MIGRATE: Migration required, project schema is below minimum supported
 * - DEGRADED_HIGHER_THAN_KNOWN: Read-only degraded mode, project schema exceeds highest known
 * - DEGRADED_MIGRATION_FAILED: Read-only degraded mode due to migration failure
 */
export type StartupMode =
  | { kind: 'NORMAL_RW' }
  | { kind: 'MIGRATE'; from: number; to: number }
  | { kind: 'DEGRADED_HIGHER_THAN_KNOWN'; observed: number; highest: number }
  | { kind: 'DEGRADED_MIGRATION_FAILED'; pair: [number, number]; logPath: string };

/**
 * Input parameters for startup compatibility check.
 */
export interface StartupCompatibilityInput {
  /** The project's current data_schema_version from Project_Manifest */
  dataSchemaVersion: number;
  /** The minimum data schema version supported by the running SpecForge code */
  minSupportedDataSchema: number;
  /** The highest data schema version known to the running SpecForge code */
  highestKnownSchema: number;
}

/**
 * Determines the startup mode based on schema version compatibility.
 * 
 * This function implements the startup compatibility decision logic from R3:
 * - R3.2: When minSupportedDataSchema ≤ dataSchemaVersion ≤ highestKnownSchema → NORMAL_RW
 * - R3.3: When dataSchemaVersion < minSupportedDataSchema → MIGRATE (from current to highest)
 * - R3.4: When dataSchemaVersion > highestKnownSchema → DEGRADED_HIGHER_THAN_KNOWN
 * 
 * The function is pure (no I/O), idempotent, and referentially transparent:
 * the same inputs will always produce the same output.
 * 
 * @param input - Object containing dataSchemaVersion, minSupportedDataSchema, and highestKnownSchema
 * @returns StartupMode discriminated union indicating the appropriate operating mode
 * 
 * @example
 * ```typescript
 * // Normal operation: schema is within supported range
 * checker.check({ dataSchemaVersion: 3, minSupportedDataSchema: 0, highestKnownSchema: 5 })
 * // Returns: { kind: 'NORMAL_RW' }
 * 
 * // Migration needed: schema is too old
 * checker.check({ dataSchemaVersion: 1, minSupportedDataSchema: 3, highestKnownSchema: 5 })
 * // Returns: { kind: 'MIGRATE', from: 1, to: 5 }
 * 
 * // Degraded mode: schema is newer than known
 * checker.check({ dataSchemaVersion: 7, minSupportedDataSchema: 0, highestKnownSchema: 5 })
 * // Returns: { kind: 'DEGRADED_HIGHER_THAN_KNOWN', observed: 7, highest: 5 }
 * ```
 */
export function check(input: StartupCompatibilityInput): StartupMode {
  const { dataSchemaVersion, minSupportedDataSchema, highestKnownSchema } = input;

  // Use the pure compare function from schema-compare module
  const compareResult = compare({
    dsv: dataSchemaVersion,
    min: minSupportedDataSchema,
    highest: highestKnownSchema,
  });

  // Map the comparison result to the appropriate StartupMode
  switch (compareResult) {
    case 'NORMAL':
      // R3.2: min ≤ dsv ≤ highest → Normal read-write mode
      return { kind: 'NORMAL_RW' };

    case 'MIGRATE':
      // R3.3: dsv < min → Migration required from current version to highest known
      return {
        kind: 'MIGRATE',
        from: dataSchemaVersion,
        to: highestKnownSchema,
      };

    case 'HIGHER_THAN_KNOWN':
      // R3.4: dsv > highest → Read-only degraded mode
      return {
        kind: 'DEGRADED_HIGHER_THAN_KNOWN',
        observed: dataSchemaVersion,
        highest: highestKnownSchema,
      };
  }
}

/**
 * Factory to create a StartupCompatibilityChecker for degraded mode after migration failure.
 * 
 * This is used when:
 * 1. Migration was attempted
 * 2. Migration failed (either rolled back or couldn't rollback)
 * 3. The system needs to enter degraded mode with the error information
 * 
 * Note: This creates a StartupMode directly rather than through check() because
 * the failure information (pair, logPath) comes from the migration runner, not from
 * the initial schema comparison.
 * 
 * @param pair - The schema version pair that failed (e.g., [3, 4] means migration from 3 to 4 failed)
 * @param logPath - Absolute path to the migration error log
 * @returns StartupMode indicating migration failure degraded mode
 */
export function createMigrationFailedMode(pair: [number, number], logPath: string): StartupMode {
  return {
    kind: 'DEGRADED_MIGRATION_FAILED',
    pair,
    logPath,
  };
}

/**
 * Type guard to check if startup mode is NORMAL_RW.
 */
export function isNormalMode(mode: StartupMode): boolean {
  return mode.kind === 'NORMAL_RW';
}

/**
 * Type guard to check if startup mode requires migration.
 */
export function needsMigration(mode: StartupMode): boolean {
  return mode.kind === 'MIGRATE';
}

/**
 * Type guard to check if startup mode is degraded (either reason).
 */
export function isDegradedMode(mode: StartupMode): boolean {
  return mode.kind === 'DEGRADED_HIGHER_THAN_KNOWN' || mode.kind === 'DEGRADED_MIGRATION_FAILED';
}

/**
 * Type guard specifically for DEGRADED_HIGHER_THAN_KNOWN.
 */
export function isHigherThanKnown(mode: StartupMode): boolean {
  return mode.kind === 'DEGRADED_HIGHER_THAN_KNOWN';
}

/**
 * Type guard specifically for DEGRADED_MIGRATION_FAILED.
 */
export function isMigrationFailed(mode: StartupMode): boolean {
  return mode.kind === 'DEGRADED_MIGRATION_FAILED';
}

/**
 * Extracts the migration range from a MIGRATE mode, if applicable.
 * Returns null if the mode is not MIGRATE.
 */
export function getMigrationRange(mode: StartupMode): { from: number; to: number } | null {
  if (mode.kind === 'MIGRATE') {
    return { from: mode.from, to: mode.to };
  }
  return null;
}

/**
 * Gets a human-readable description of the startup mode.
 * Useful for debugging and logging.
 */
export function describeMode(mode: StartupMode): string {
  switch (mode.kind) {
    case 'NORMAL_RW':
      return 'Normal read-write mode';
    case 'MIGRATE':
      return `Migration required: schema ${mode.from} → ${mode.to}`;
    case 'DEGRADED_HIGHER_THAN_KNOWN':
      return `Degraded mode: schema ${mode.observed} exceeds highest known ${mode.highest}`;
    case 'DEGRADED_MIGRATION_FAILED':
      return `Degraded mode: migration ${mode.pair[0]}→${mode.pair[1]} failed, see ${mode.logPath}`;
  }
}