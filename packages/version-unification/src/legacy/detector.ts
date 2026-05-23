/**
 * Legacy manifest detector.
 * 
 * Provides functions to detect legacy manifest formats based on the presence
 * of deprecated fields from older SpecForge versions.
 * 
 * @see Requirements 11.1
 * @see design.md §Legacy Migrator
 */

import { LEGACY_FIELDS_USER, LEGACY_FIELDS_PROJECT } from '../manifest/types.js';

/**
 * Combined set of all legacy fields from both user and project manifests.
 * This union represents fields that indicate an old manifest format.
 */
const ALL_LEGACY_FIELDS: Set<string> = new Set([...LEGACY_FIELDS_USER, ...LEGACY_FIELDS_PROJECT]);

/**
 * Checks if a raw JSON object represents a legacy manifest format.
 * 
 * Detection is based on the presence of any legacy fields in the object's keys,
 * regardless of their values. If any key in the rawJson intersects with
 * LEGACY_FIELDS_USER ∪ LEGACY_FIELDS_PROJECT, the manifest is considered legacy.
 * 
 * This implements R11.1 - identifying manifests that contain deprecated fields
 * like 'shared_version', 'required_shared_version_range', 'schema_version', 
 * 'runtime_schema_version', or 'code_version' (in project context).
 * 
 * @param rawJson - The raw JSON object parsed from a manifest file
 * @returns true if the manifest contains any legacy fields, false otherwise
 * 
 * @example
 * ```typescript
 * // Legacy user manifest with deprecated fields
 * const legacyUser = {
 *   shared_version: "6.0.0-dev",
 *   code_version: "6.0.0-dev"
 * };
 * isLegacy(legacyUser); // true
 * 
 * // Modern user manifest with only allowed fields
 * const modernUser = {
 *   code_version: "6.0.0",
 *   min_supported_data_schema: 0,
 *   installed_at: "2024-01-01T00:00:00Z",
 *   updated_at: "2024-01-01T00:00:00Z",
 *   files: []
 * };
 * isLegacy(modernUser); // false
 * ```
 */
export function isLegacy(rawJson: Record<string, unknown>): boolean {
  // Get all keys from the raw JSON object
  const rawJsonKeys = Object.keys(rawJson);
  
  // Check if any key intersects with the legacy fields set
  for (const key of rawJsonKeys) {
    if (ALL_LEGACY_FIELDS.has(key)) {
      return true;
    }
  }
  
  return false;
}