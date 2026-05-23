/**
 * Manifest type definitions for version-unification module.
 * 
 * Defines the data contracts for User Manifest (R1) and Project Manifest (R2),
 * along with allowed field constants and error classes.
 * 
 * @see design.md §Components.types.ts
 * @see Requirements 1.1, 1.5, 2.1, 2.4, 14.3
 */

// =============================================================================
// Manifest Interfaces
// =============================================================================

/**
 * User Manifest (R1) - Stores user-level installation and file tracking.
 * 
 * Contains 5 fields tracking code version, minimum supported data schema,
 * installation timestamps, and tracked files.
 */
export interface UserManifest {
  /** Version identifier of the installed SpecForge code */
  readonly code_version: string;
  /** Minimum data schema version required to read user data */
  readonly min_supported_data_schema: number;
  /** ISO 8601 timestamp when user manifest was first created */
  readonly installed_at: string;
  /** ISO 8601 timestamp when user manifest was last updated */
  readonly updated_at: string;
  /** List of files tracked by the user manifest */
  readonly files: ReadonlyArray<ManifestFileEntry>;
}

/**
 * Project Manifest (R2) - Stores project-level schema versioning.
 * 
 * Contains 3 fields tracking data schema version and initialization timestamps.
 */
export interface ProjectManifest {
  /** Current data schema version of the project */
  readonly data_schema_version: number;
  /** ISO 8601 timestamp when project manifest was first created */
  readonly initialized_at: string;
  /** ISO 8601 timestamp when project manifest was last updated */
  readonly updated_at: string;
}

/**
 * Manifest File Entry - Represents a single tracked file.
 * 
 * Used in UserManifest.files to track file metadata.
 */
export interface ManifestFileEntry {
  /** Absolute or relative path to the file */
  readonly path: string;
  /** SHA-256 hash of the file content (64 hex characters) */
  readonly sha256: string;
  /** File size in bytes (must be non-negative) */
  readonly size: number;
}

// =============================================================================
// Allowed Field Constants
// =============================================================================

/**
 * Allowed fields in User Manifest.
 * Used for strict fieldset validation.
 */
export const USER_MANIFEST_FIELDS = [
  'code_version',
  'min_supported_data_schema',
  'installed_at',
  'updated_at',
  'files',
] as const;

/**
 * Allowed fields in Project Manifest.
 * Used for strict fieldset validation.
 */
export const PROJECT_MANIFEST_FIELDS = [
  'data_schema_version',
  'initialized_at',
  'updated_at',
] as const;

// =============================================================================
// Legacy Field Constants
// =============================================================================

/**
 * Legacy fields that may exist in older User Manifest formats.
 * Used for legacy detection and migration.
 */
export const LEGACY_FIELDS_USER = [
  'shared_version',
  'required_shared_version_range',
  'schema_version',
  'runtime_schema_version',
] as const;

/**
 * Legacy fields that may exist in older Project Manifest formats.
 * Includes all user legacy fields plus 'code_version'.
 */
export const LEGACY_FIELDS_PROJECT = [
  ...LEGACY_FIELDS_USER,
  'code_version',
] as const;

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when a manifest contains disallowed fields.
 * 
 * Raised during validation when the fieldset does not exactly match
 * the expected allowed fields (too many or too few fields).
 */
export class InvalidManifestFieldError extends Error {
  readonly manifestType: 'user' | 'project';
  readonly offendingFields: readonly string[];

  constructor(manifestType: 'user' | 'project', offendingFields: readonly string[], message?: string) {
    const defaultMessage = `Invalid field(s) in ${manifestType} manifest: ${offendingFields.join(', ')}`;
    super(message ?? defaultMessage);
    this.name = 'InvalidManifestFieldError';
    this.manifestType = manifestType;
    this.offendingFields = offendingFields;
    
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidManifestFieldError);
    }
  }
}

/**
 * Error thrown when manifest JSON cannot be parsed.
 * 
 * Raised when JSON.parse fails on a manifest file.
 * Contains the file path and the original parse error for debugging.
 */
export class InvalidJsonInManifestError extends Error {
  readonly manifestPath: string;
  readonly parseError: Error;

  constructor(manifestPath: string, parseError: unknown, message?: string) {
    const error = parseError instanceof Error ? parseError : new Error(String(parseError));
    const defaultMessage = `Invalid JSON in manifest at ${manifestPath}: ${error.message}`;
    super(message ?? defaultMessage);
    this.name = 'InvalidJsonInManifestError';
    this.manifestPath = manifestPath;
    this.parseError = error;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidJsonInManifestError);
    }
  }
}

/**
 * Error thrown when data_schema_version would decrease (non-monotonic).
 * 
 * Raised when attempting to write a lower schema version than currently exists.
 * Data schema version must only ever increase (monotonic enforcement).
 */
export class DataSchemaMonotonicError extends Error {
  readonly currentVersion: number;
  readonly attemptedVersion: number;

  constructor(currentVersion: number, attemptedVersion: number, message?: string) {
    const defaultMessage = `Data schema version cannot decrease: current=${currentVersion}, attempted=${attemptedVersion}`;
    super(message ?? defaultMessage);
    this.name = 'DataSchemaMonotonicError';
    this.currentVersion = currentVersion;
    this.attemptedVersion = attemptedVersion;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DataSchemaMonotonicError);
    }
  }
}

/**
 * Error thrown when writeAfterMigration is called from an unauthorized call site.
 * 
 * Raised when the caller token does not originate from a valid MigrationContext.
 * This enforces R7.2 - only migration code can increment data_schema_version.
 */
export class IllegalWriterCallSiteError extends Error {
  readonly callerIdentity: string | symbol;

  constructor(callerIdentity: string | symbol, message?: string) {
    const defaultMessage = `Illegal call site for data_schema_version write: ${String(callerIdentity)}`;
    super(message ?? defaultMessage);
    this.name = 'IllegalWriterCallSiteError';
    this.callerIdentity = callerIdentity;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IllegalWriterCallSiteError);
    }
  }
}

/**
 * Error thrown when a manifest file cannot be found at the expected path.
 */
export class ManifestNotFoundError extends Error {
  readonly manifestType: 'user' | 'project';
  readonly expectedPath: string;

  constructor(manifestType: 'user' | 'project', expectedPath: string, message?: string) {
    const defaultMessage = `${manifestType} manifest not found at ${expectedPath}`;
    super(message ?? defaultMessage);
    this.name = 'ManifestNotFoundError';
    this.manifestType = manifestType;
    this.expectedPath = expectedPath;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ManifestNotFoundError);
    }
  }
}

/**
 * Error thrown when attempting to write to a directory that is not writable.
 */
export class ManifestUnwritableDirError extends Error {
  readonly directoryPath: string;
  readonly errno?: number;

  constructor(directoryPath: string, errno?: number, message?: string) {
    const defaultMessage = `Cannot write manifest to directory: ${directoryPath}${errno ? ` (errno: ${errno})` : ''}`;
    super(message ?? defaultMessage);
    this.name = 'ManifestUnwritableDirError';
    this.directoryPath = directoryPath;
    this.errno = errno;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ManifestUnwritableDirError);
    }
  }
}

/**
 * Error thrown when attempting to write in read-only degraded mode.
 */
export class ReadOnlyDegradedError extends Error {
  readonly cause: 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER';

  constructor(cause: 'MIGRATION_FAILED' | 'HIGHER_THAN_KNOWN' | 'OTHER', message?: string) {
    const defaultMessage = `Write operation rejected in read-only degraded mode (cause: ${cause})`;
    super(message ?? defaultMessage);
    this.name = 'ReadOnlyDegradedError';
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReadOnlyDegradedError);
    }
  }
}

/**
 * Error thrown when migration chain fails and rollback is not possible.
 */
export class MigrationFailedNoRollbackError extends Error {
  readonly pair: readonly [number, number];
  readonly originalError: Error;

  constructor(pair: readonly [number, number], originalError: Error, message?: string) {
    const defaultMessage = `Migration failed without rollback: ${pair[0]} → ${pair[1]}: ${originalError.message}`;
    super(message ?? defaultMessage);
    this.name = 'MigrationFailedNoRollbackError';
    this.pair = pair;
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MigrationFailedNoRollbackError);
    }
  }
}

/**
 * Error thrown when migration registry is malformed (duplicate or missing versions).
 */
export class MalformedRegistryError extends Error {
  readonly reason: 'duplicate_version' | 'missing_version';
  readonly version?: number;

  constructor(reason: 'duplicate_version' | 'missing_version', version?: number, message?: string) {
    const defaultMessage = reason === 'duplicate_version'
      ? `Duplicate migration version in registry: ${version}`
      : `Missing migration version in registry: ${version}`;
    super(message ?? defaultMessage);
    this.name = 'MalformedRegistryError';
    this.reason = reason;
    this.version = version;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MalformedRegistryError);
    }
  }
}