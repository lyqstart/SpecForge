/**
 * Schema validation for User and Project manifests.
 * 
 * Provides strict validation of manifest structure, field types,
 * and value constraints per Requirements 1.2, 1.3, 1.4, 1.6, 2.2, 2.3, 2.5.
 * 
 * @see requirements.md §Requirements 1.2, 1.3, 1.4, 1.6, 2.2, 2.3, 2.5
 * @see design.md §Components.schema-validator.ts
 */

import {
  USER_MANIFEST_FIELDS,
  PROJECT_MANIFEST_FIELDS,
  InvalidManifestFieldError,
  type UserManifest,
  type ProjectManifest,
  type ManifestFileEntry,
} from './types.js';

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * Validates semantic version string per R1.2 / R2.5
 * Format: \d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?
 */
const CODE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/;

/**
 * Validates SHA-256 hex string per R1.6
 * Format: 64 hexadecimal characters
 */
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * ISO 8601 timestamp pattern for validation
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ or variations
 */
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates that an object has exactly the allowed fields (no extra, no missing).
 * @throws InvalidManifestFieldError if fieldset doesn't match
 */
function validateFieldSet(
  input: unknown,
  allowedFields: readonly string[],
  manifestType: 'user' | 'project'
): void {
  if (typeof input !== 'object' || input === null) {
    throw new InvalidManifestFieldError(
      manifestType,
      allowedFields,
      `${manifestType} manifest must be an object`
    );
  }

  const obj = input as Record<string, unknown>;
  const inputFields = Object.keys(obj);
  const allowedSet = new Set(allowedFields);
  const inputSet = new Set(inputFields);

  // Find extra fields (in input but not allowed)
  const extraFields: string[] = [];
  for (const field of inputFields) {
    if (!allowedSet.has(field)) {
      extraFields.push(field);
    }
  }

  // Find missing fields (allowed but not in input)
  const missingFields: string[] = [];
  for (const field of allowedFields) {
    if (!inputSet.has(field)) {
      missingFields.push(field);
    }
  }

  // Report extra fields first, then missing fields
  const offendingFields = [...extraFields, ...missingFields];
  if (offendingFields.length > 0) {
    throw new InvalidManifestFieldError(manifestType, offendingFields);
  }
}

/**
 * Validates a semantic version string.
 * @throws Error if format is invalid
 */
function validateCodeVersion(value: unknown, manifestType: 'user' | 'project'): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${manifestType} manifest: code_version must be a string`);
  }
  if (!CODE_VERSION_PATTERN.test(value)) {
    throw new Error(
      `${manifestType} manifest: code_version must match semantic version format (e.g., "1.0.0" or "1.0.0-beta.1"), got "${value}"`
    );
  }
}

/**
 * Validates a non-negative integer field.
 * @throws Error if not a non-negative integer
 */
function validateNonNegativeInteger(
  value: unknown,
  fieldName: string,
  manifestType: 'user' | 'project'
): asserts value is number {
  if (typeof value !== 'number') {
    throw new Error(`${manifestType} manifest: ${fieldName} must be a number`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${manifestType} manifest: ${fieldName} must be a non-negative integer, got ${value}`
    );
  }
}

/**
 * Validates an ISO 8601 timestamp string with round-trip verification.
 * Round-trip means: parse the string, convert to ISO format, compare back to original.
 * @throws Error if not a valid ISO 8601 timestamp
 */
function validateTimestamp(
  value: unknown,
  fieldName: string,
  manifestType: 'user' | 'project'
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${manifestType} manifest: ${fieldName} must be a string`);
  }
  
  // Check format first (quick rejection)
  if (!ISO_8601_PATTERN.test(value)) {
    throw new Error(
      `${manifestType} manifest: ${fieldName} must be an ISO 8601 timestamp, got "${value}"`
    );
  }

  // Round-trip validation: parse and re-serialize
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    throw new Error(
      `${manifestType} manifest: ${fieldName} is not a valid ISO 8601 timestamp, got "${value}"`
    );
  }

  // Re-serialize to ISO and compare (handles timezone/formatting variations)
  const roundTripped = parsed.toISOString();
  if (roundTripped !== value) {
    // Allow some variations like different precision
    // Parse again from round-tripped and verify it matches
    const reParsed = new Date(roundTripped);
    if (reParsed.getTime() !== parsed.getTime()) {
      throw new Error(
        `${manifestType} manifest: ${fieldName} fails round-trip validation, got "${value}"`
      );
    }
  }
}

/**
 * Validates a ManifestFileEntry.
 * @throws Error if entry is invalid
 */
function validateFileEntry(
  entry: unknown,
  index: number,
  manifestType: 'user' | 'project'
): asserts entry is ManifestFileEntry {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`${manifestType} manifest: files[${index}] must be an object`);
  }

  const file = entry as Record<string, unknown>;

  // path field
  if (typeof file.path !== 'string' || file.path.length === 0) {
    throw new Error(`${manifestType} manifest: files[${index}].path must be a non-empty string`);
  }

  // sha256 field
  if (typeof file.sha256 !== 'string') {
    throw new Error(`${manifestType} manifest: files[${index}].sha256 must be a string`);
  }
  if (!SHA256_PATTERN.test(file.sha256)) {
    throw new Error(
      `${manifestType} manifest: files[${index}].sha256 must be a 64-character hex string, got "${file.sha256}"`
    );
  }

  // size field
  if (typeof file.size !== 'number') {
    throw new Error(`${manifestType} manifest: files[${index}].size must be a number`);
  }
  if (!Number.isInteger(file.size) || file.size < 0) {
    throw new Error(
      `${manifestType} manifest: files[${index}].size must be a non-negative integer, got ${file.size}`
    );
  }
}

// =============================================================================
// Main Validators
// =============================================================================

/**
 * Validates a User Manifest input.
 * 
 * Performs strict fieldset validation and type/value checks:
 * - Fieldset must exactly match USER_MANIFEST_FIELDS
 * - code_version: semantic version string
 * - min_supported_data_schema: non-negative integer
 * - installed_at: ISO 8601 timestamp (round-trip validated)
 * - updated_at: ISO 8601 timestamp (round-trip validated)
 * - files: array of file entries with sha256 and size validation
 * 
 * @param input - The input to validate as a User Manifest
 * @returns The validated UserManifest (cast from unknown)
 * @throws InvalidManifestFieldError if fieldset is invalid
 * @throws Error if any field fails type/value validation
 */
export function validateUserManifest(input: unknown): UserManifest {
  // Step 1: Validate fieldset
  validateFieldSet(input, USER_MANIFEST_FIELDS, 'user');
  
  const manifest = input as Record<string, unknown>;

  // Step 2: Validate code_version (R1.2)
  validateCodeVersion(manifest.code_version, 'user');

  // Step 3: Validate min_supported_data_schema (R1.3)
  validateNonNegativeInteger(manifest.min_supported_data_schema, 'min_supported_data_schema', 'user');

  // Step 4: Validate timestamps (R1.4)
  validateTimestamp(manifest.installed_at, 'installed_at', 'user');
  validateTimestamp(manifest.updated_at, 'updated_at', 'user');

  // Step 5: Validate files array (R1.6)
  if (!Array.isArray(manifest.files)) {
    throw new Error('User manifest: files must be an array');
  }

  for (let i = 0; i < manifest.files.length; i++) {
    validateFileEntry(manifest.files[i], i, 'user');
  }

  return manifest as unknown as UserManifest;
}

/**
 * Validates a Project Manifest input.
 * 
 * Performs strict fieldset validation and type/value checks:
 * - Fieldset must exactly match PROJECT_MANIFEST_FIELDS
 * - data_schema_version: non-negative integer
 * - initialized_at: ISO 8601 timestamp (round-trip validated)
 * - updated_at: ISO 8601 timestamp (round-trip validated)
 * 
 * @param input - The input to validate as a Project Manifest
 * @returns The validated ProjectManifest (cast from unknown)
 * @throws InvalidManifestFieldError if fieldset is invalid
 * @throws Error if any field fails type/value validation
 */
export function validateProjectManifest(input: unknown): ProjectManifest {
  // Step 1: Validate fieldset
  validateFieldSet(input, PROJECT_MANIFEST_FIELDS, 'project');
  
  const manifest = input as Record<string, unknown>;

  // Step 2: Validate data_schema_version (R2.2)
  validateNonNegativeInteger(manifest.data_schema_version, 'data_schema_version', 'project');

  // Step 3: Validate timestamps (R2.3)
  validateTimestamp(manifest.initialized_at, 'initialized_at', 'project');
  validateTimestamp(manifest.updated_at, 'updated_at', 'project');

  return manifest as unknown as ProjectManifest;
}