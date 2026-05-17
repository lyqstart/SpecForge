/**
 * Sample Migration Script: v1.0.0 to v1.1.0
 * 
 * This is an example migration script showing the expected format.
 * Real migration scripts should transform actual data structures.
 * 
 * @example
 * // To create a new migration:
 * // 1. Copy this file and rename to v<X>-to-v<Y>.ts
 * // 2. Update fromVersion and toVersion
 * // 3. Implement the migrate function
 */

import type { MigrationScript } from '../apply'

const fromVersion = '1.0.0'
const toVersion = '1.1.0'

/**
 * Migration from 1.0.0 to 1.1.0
 * 
 * Changes in 1.1.0:
 * - Added 'updatedAt' timestamp field
 * - Renamed 'config' to 'configuration'
 * - Added 'metadata' object for future extensibility
 */
export async function migrate(data: unknown): Promise<unknown> {
  if (typeof data !== 'object' || data === null) {
    return createBaseStructure()
  }
  
  const input = data as Record<string, unknown>
  
  // Create migrated structure
  const migrated = {
    // Copy all existing fields
    ...input,
    
    // Rename 'config' to 'configuration' if present
    ...(input.config !== undefined && { configuration: input.config }),
    
    // Remove old 'config' field if it existed
    ...(input.config !== undefined && { config: undefined }),
    
    // Add new fields
    updatedAt: new Date().toISOString(),
    metadata: {
      migratedFrom: fromVersion,
      migratedAt: new Date().toISOString(),
      previousSchemaVersion: input.schema_version || fromVersion
    },
    
    // Update schema version
    schema_version: toVersion
  }
  
  // Remove undefined fields
  Object.keys(migrated).forEach(key => {
    if (migrated[key] === undefined) {
      delete migrated[key]
    }
  })
  
  return migrated
}

function createBaseStructure() {
  return {
    schema_version: toVersion,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      migratedFrom: fromVersion,
      migratedAt: new Date().toISOString()
    }
  }
}

/**
 * Validate migrated data
 */
export function validate(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  
  const typed = data as Record<string, unknown>
  
  // Must have correct schema version
  if (typed.schema_version !== toVersion) {
    return false
  }
  
  // Should have updatedAt field
  if (typed.updatedAt === undefined) {
    return false
  }
  
  return true
}

export const description = 'Add timestamp fields and rename config to configuration'

const migrationScript: MigrationScript = {
  fromVersion,
  toVersion,
  description,
  migrate,
  validate
}

export default migrationScript