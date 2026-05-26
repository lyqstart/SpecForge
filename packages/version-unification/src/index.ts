/**
 * Version-Unification Module - Public API
 * 
 * This is the ONLY public entry point for the version-unification module.
 * Only protocol-level types, error classes, and core functions are exported.
 * 
 * Internal implementation details (writers, migration runners, tokens) are
 * intentionally NOT exported to protect R7.2 - preventing external code from
 * forging callerToken to bypass data_schema_version write restrictions.
 * 
 * @see Requirements 7.2
 * @see design.md §Components.index.ts
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * The lowest data schema version that the currently installed SpecForge code can read.
 * 
 * @see Requirement 6.1
 */
export { MIN_SUPPORTED_DATA_SCHEMA, HIGHEST_KNOWN_SCHEMA } from './constants.js';

// =============================================================================
// Code Version
// =============================================================================

/**
 * Get the SpecForge code version.
 * 
 * This is the ONLY runtime entry point for accessing the code version.
 * Returns the semantic version string from the repository root package.json.
 * 
 * @returns The code version string (e.g., "6.0.0")
 * @throws Error if version cannot be read or parsed
 * 
 * @see Requirement 5.1
 */
export { getCodeVersion } from './code-version.js';

// =============================================================================
// Types - Manifest (re-export for convenience)
// =============================================================================

/**
 * User Manifest - stores user-level installation and file tracking.
 * 
 * Contains 5 fields: code_version, min_supported_data_schema, installed_at, updated_at, files
 * 
 * @see Requirement 1
 */
export type { UserManifest } from './manifest/types.js';

/**
 * Project Manifest - stores project-level schema versioning.
 * 
 * Contains 3 fields: data_schema_version, initialized_at, updated_at
 * 
 * @see Requirement 2
 */
export type { ProjectManifest } from './manifest/types.js';

/**
 * Manifest File Entry - represents a single tracked file in UserManifest.files
 */
export type { ManifestFileEntry } from './manifest/types.js';



// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when a manifest contains disallowed fields.
 * Raised during validation when the fieldset does not exactly match expected allowed fields.
 */
export { InvalidManifestFieldError } from './manifest/types.js';

/**
 * Error thrown when manifest JSON cannot be parsed.
 */
export { InvalidJsonInManifestError } from './manifest/types.js';

/**
 * Error thrown when data_schema_version would decrease (non-monotonic).
 */
export { DataSchemaMonotonicError } from './manifest/types.js';

/**
 * Error thrown when writeAfterMigration is called from an unauthorized call site.
 * Enforces R7.2 - only migration code can increment data_schema_version.
 */
export { IllegalWriterCallSiteError } from './manifest/types.js';

/**
 * Error thrown when a manifest file cannot be found at the expected path.
 */
export { ManifestNotFoundError } from './manifest/types.js';

/**
 * Error thrown when attempting to write to a directory that is not writable.
 */
export { ManifestUnwritableDirError } from './manifest/types.js';

/**
 * Error thrown when attempting to write in read-only degraded mode.
 */
export { ReadOnlyDegradedError } from './manifest/types.js';

/**
 * Error thrown when migration chain fails and rollback is not possible.
 */
export { MigrationFailedNoRollbackError } from './manifest/types.js';

/**
 * Error thrown when migration registry is malformed (duplicate or missing versions).
 */
export { MalformedRegistryError } from './manifest/types.js';

// =============================================================================
// Compatibility Checker
// =============================================================================

/**
 * Startup Compatibility Checker
 * 
 * Determines the startup mode based on schema version compatibility.
 * This is a PURE FUNCTION - no I/O, deterministic, idempotent.
 * 
 * @example
 * ```typescript
 * import { StartupCompatibilityChecker } from 'version-unification';
 * 
 * const mode = StartupCompatibilityChecker.check({
 *   dataSchemaVersion: 3,
 *   minSupportedDataSchema: 0,
 *   highestKnownSchema: 5
 * });
 * // Returns: { kind: 'NORMAL_RW' }
 * ```
 * 
 * @see Requirements 3.2, 3.3, 3.4, 3.5
 */
import { check } from './compat/startup-checker.js';

export const StartupCompatibilityChecker = {
  check,
};



// =============================================================================
// Read-Only Degraded Mode
// =============================================================================

/**
 * Guard function that throws ReadOnlyDegradedError if the system is in read-only mode.
 * 
 * Use this to protect any write operation from executing when the system
 * has been degraded to read-only mode.
 * 
 * @throws {ReadOnlyDegradedError} If the system is in read-only degraded mode
 * 
 * @see Requirement 13.3
 * @example
 * ```typescript
 * // Before any write operation
 * requireWritable();
 * // Proceed with write operation...
 * ```
 */
export { requireWritable, enterReadOnly } from './degraded-mode/read-only-mode.js';



// =============================================================================
// Manifest Field Constants (for validation)
// =============================================================================

/**
 * Allowed fields in User Manifest.
 */
export { USER_MANIFEST_FIELDS } from './manifest/types.js';

/**
 * Allowed fields in Project Manifest.
 */
export { PROJECT_MANIFEST_FIELDS } from './manifest/types.js';

/**
 * Legacy fields that may exist in older User Manifest formats.
 */
export { LEGACY_FIELDS_USER } from './manifest/types.js';

/**
 * Legacy fields that may exist in older Project Manifest formats.
 */
export { LEGACY_FIELDS_PROJECT } from './manifest/types.js';

// =============================================================================
// Migration Types (for StartupCompatibilityChecker MIGRATE mode)
// =============================================================================

/**
 * Migration Run Result - discriminated union returned by MigrationRunner.
 * 
 * - 'OK': Migration chain completed successfully
 * - 'FAILED_ROLLED_BACK': Migration failed but rollback succeeded
 * - 'FAILED_NO_ROLLBACK': Both migration and rollback failed
 * 
 * @see Requirement 4.5
 */
export type { MigrationRunResult, MigrationRunResultOK, MigrationRunResultFailedRolledBack, MigrationRunResultFailedNoRollback } from './migration/runner.js';

/**
 * Migration Run Arguments - input to MigrationRunner.run()
 */
export type { MigrationRunArgs } from './migration/runner.js';

/**
 * MigrationRunner - executes migration chains with atomicity and rollback.
 * 
 * This is exported for testing and direct invocation. Production code should
 * use the bootstrap and compatibility checking flow instead.
 * 
 * @see Requirements 4.2, 4.3, 4.5, 13.1, 13.2
 */
export { MigrationRunner, createMigrationRunner, runMigration } from './migration/runner.js';

// =============================================================================
// Degraded Reporter
// =============================================================================

/**
 * Reporter for degraded mode error messages.
 *
 * Provides formatted output based on the cause of degradation:
 * - MIGRATION_FAILED: includes failed pair, log path, recommended next step
 * - HIGHER_THAN_KNOWN: includes observed dsv, highest schema, upgrade suggestion
 * - OTHER: generic message without migration-specific phrases
 *
 * @see Requirements 3.4, 13.4, 13.5
 */
export { DegradedReporter } from './degraded-mode/degraded-reporter.js';

/**
 * Details for degraded mode reporting.
 */
export type { DegradedReporterDetails } from './degraded-mode/degraded-reporter.js';

/**
 * Cause discriminators for degraded mode.
 */
export type { DegradedCause } from './degraded-mode/degraded-reporter.js';

// =============================================================================
// Manifest Writers
// =============================================================================

/**
 * User Manifest Writer.
 *
 * Handles atomic writing of user manifest files with validation.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.2
 */
export { UserManifestWriter } from './manifest/user-manifest-writer.js';

/**
 * Project Manifest Writer.
 *
 * Handles atomic writing of project manifest files with validation,
 * monotonicity enforcement, and call-site restrictions.
 *
 * @see Requirements 2.1, 2.4, 7.1, 7.2, 7.3, 7.5, 11.2, 15.1, 15.2
 */
export { ProjectManifestWriter } from './manifest/project-manifest-writer.js';

// =============================================================================
// Manifest Reader
// =============================================================================

/**
 * Reads a User Manifest from the specified path.
 *
 * @throws ManifestNotFoundError if the file does not exist
 * @throws InvalidJsonInManifestError if JSON parsing fails
 *
 * @see Requirement 14.3
 */
export { readUser } from './manifest/manifest-reader.js';

/**
 * Reads a Project Manifest from the specified path.
 *
 * @throws ManifestNotFoundError if the file does not exist
 * @throws InvalidJsonInManifestError if JSON parsing fails
 *
 * @see Requirement 14.3
 */
export { readProject } from './manifest/manifest-reader.js';

// =============================================================================
// Legacy Migrator
// =============================================================================

/**
 * ManifestMigrator provides migration functionality for legacy manifest formats.
 *
 * Handles reading, writing, and in-place conversion based on the current release cycle.
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */
export { ManifestMigrator, getCurrentCycleBehavior } from './legacy/migrator.js';

// =============================================================================
// Bootstrap Handlers
// =============================================================================

/**
 * Handles the case when Project_Manifest file does not exist on disk.
 *
 * Creates a new Project_Manifest with data_schema_version = highestKnown.
 *
 * @see Requirement 15
 */
export { handleProjectManifestMissing } from './bootstrap/project-missing.js';

/**
 * Arguments for handleProjectManifestMissing.
 */
export type { HandleProjectManifestMissingArgs, ProjectManifestCreated, ProjectManifestWriteFailed } from './bootstrap/project-missing.js';

/**
 * Handles the case when User_Manifest file does not exist on disk.
 *
 * Prints an instructional message and returns exit code 0.
 *
 * @see Requirement 14
 */
export { handleUserManifestMissing } from './bootstrap/user-missing.js';

/**
 * Arguments for handleUserManifestMissing.
 */
export type { HandleUserManifestMissingArgs } from './bootstrap/user-missing.js';