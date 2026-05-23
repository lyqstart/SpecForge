/**
 * Schema version comparison utilities.
 * 
 * This module provides pure functions for comparing data schema versions
 * during SpecForge startup. No semver libraries are used (R3.5).
 * 
 * @see Requirements 3.2, 3.3, 3.4, 3.5
 */

/**
 * Result of schema version comparison.
 * - 'NORMAL': dsv is within supported range, no migration needed
 * - 'MIGRATE': dsv is below minimum supported, migration required
 * - 'HIGHER_THAN_KNOWN': dsv exceeds highest known schema, degraded mode required
 */
export type SchemaCompareResult = 'NORMAL' | 'MIGRATE' | 'HIGHER_THAN_KNOWN';

/**
 * Input parameters for schema comparison.
 */
export interface SchemaCompareInput {
  /** The project's current data_schema_version */
  dsv: number;
  /** The minimum data schema version supported by the running SpecForge code */
  min: number;
  /** The highest data schema version known to the running SpecForge code */
  highest: number;
}

/**
 * Pure function to compare schema versions during startup.
 * 
 * This function implements the compatibility decision logic from R3.2-R3.5:
 * - Returns 'NORMAL' when min ≤ dsv ≤ highest (normal read-write mode)
 * - Returns 'MIGRATE' when dsv < min (needs migration chain)
 * - Returns 'HIGHER_THAN_KNOWN' when dsv > highest (degraded mode)
 * 
 * @param input - Object containing dsv, min, and highest schema versions
 * @returns One of 'NORMAL', 'MIGRATE', or 'HIGHER_THAN_KNOWN'
 * 
 * @example
 * ```typescript
 * // Normal case: schema is supported
 * compare({ dsv: 3, min: 0, highest: 5 }) // returns 'NORMAL'
 * 
 * // Migration needed: schema is too old
 * compare({ dsv: 0, min: 3, highest: 5 }) // returns 'MIGRATE'
 * 
 * // Degraded: schema is newer than known
 * compare({ dsv: 7, min: 0, highest: 5 }) // returns 'HIGHER_THAN_KNOWN'
 * ```
 * 
 * @remarks
 * - This is a pure function: same inputs always produce same outputs
 * - Performs no I/O operations
 * - Uses simple integer comparison (no semver parsing)
 * - Follows R3.5: does not evaluate version range expressions
 */
export function compare(input: SchemaCompareInput): SchemaCompareResult {
  const { dsv, min, highest } = input;

  // Validate inputs are non-negative integers
  if (!Number.isInteger(dsv) || dsv < 0 ||
      !Number.isInteger(min) || min < 0 ||
      !Number.isInteger(highest) || highest < 0) {
    // For invalid inputs, treat as migration needed to ensure safety
    return 'MIGRATE';
  }

  // R3.2: dsv >= min AND dsv <= highest -> NORMAL
  if (dsv >= min && dsv <= highest) {
    return 'NORMAL';
  }

  // R3.3: dsv < min -> MIGRATE
  if (dsv < min) {
    return 'MIGRATE';
  }

  // R3.4: dsv > highest -> HIGHER_THAN_KNOWN (degraded mode)
  return 'HIGHER_THAN_KNOWN';
}

/**
 * Type guard to check if comparison result indicates normal operation.
 */
export function isNormal(result: SchemaCompareResult): boolean {
  return result === 'NORMAL';
}

/**
 * Type guard to check if comparison result indicates migration is needed.
 */
export function needsMigration(result: SchemaCompareResult): boolean {
  return result === 'MIGRATE';
}

/**
 * Type guard to check if comparison result indicates degraded mode.
 */
export function isHigherThanKnown(result: SchemaCompareResult): boolean {
  return result === 'HIGHER_THAN_KNOWN';
}