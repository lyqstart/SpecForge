/**
 * ⚠️ IMPORTANT WARNING - R6.1 ENFORCED
 * 
 * This file is the SOLE authorized location for declaring `MIN_SUPPORTED_DATA_SCHEMA` and `HIGHEST_KNOWN_SCHEMA`.
 * 
 * According to Requirement 6.1:
 * > THE SpecForge_System SHALL declare `min_supported_data_schema` exactly once in source code,
 * > in a constant named `MIN_SUPPORTED_DATA_SCHEMA` exported from a single dedicated module.
 * 
 * NO other file in the entire codebase may contain an assignment in the form:
 *   - `MIN_SUPPORTED_DATA_SCHEMA = N`
 *   - `MIN_SUPPORTED_DATA_SCHEMA: N`
 *   - Any mutation or re-assignment of `MIN_SUPPORTED_DATA_SCHEMA`
 * 
 * Any violation will be caught by CI Version Guard (Requirement 6.4).
 * 
 * @see Requirements 6.1, 6.4
 * @see design.md §R6.1 enforcement
 */

/**
 * The lowest data schema version that the currently installed SpecForge code can read.
 * 
 * This value represents the minimum schema version supported by the runtime.
 * When a project's data_schema_version falls below this value, migration is required.
 * 
 * @remarks
 * - Must be a non-negative integer (validated by CI)
 * - Can only be increased (monotonic), never decreased (enforced by CI)
 * - Changing this value requires a deprecation notice in docs/deprecations/
 * 
 * @default 0
 */
export const MIN_SUPPORTED_DATA_SCHEMA: number = 0;

/**
 * The highest data schema version known to the running SpecForge code.
 * 
 * This value represents the most recent schema version for which migration
 * scripts and read-write code paths exist. Projects with data_schema_version
 * equal to or below this value can be fully operated on.
 * 
 * @remarks
 * - Must be a non-negative integer
 * - Increased whenever a new schema version is introduced
 * - Used by StartupCompatibilityChecker to determine if degradation is needed
 * 
 * @default 0
 */
export const HIGHEST_KNOWN_SCHEMA: number = 0;