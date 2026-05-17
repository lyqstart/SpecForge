/**
 * Migration Script Template
 * 
 * Copy this template to create new migration scripts.
 * 
 * Naming convention: v<FROM_VERSION>-to-v<TO_VERSION>.ts
 * Example: v1.0.0-to-v1.1.0.ts
 * 
 * @instructions
 * 1. Copy this file and rename it following the naming convention
 * 2. Update fromVersion and toVersion constants
 * 3. Implement the migrate function to transform data
 * 4. Optionally implement validate function to verify the result
 * 5. Export the script as default or named export 'migrate'
 */

import type { MigrationScript } from '../apply'

// Migration metadata
const fromVersion = '1.0.0'  // Update: current schema version
const toVersion = '1.1.0'    // Update: target schema version

/**
 * Main migration function
 * Transform data from fromVersion to toVersion
 * 
 * @param data - The data to migrate (typically an object loaded from file)
 * @returns The migrated data
 */
export async function migrate(data: unknown): Promise<unknown> {
  // TODO: Implement migration logic
  // Example:
  // const typedData = data as { oldField: string }
  // return {
  //   ...typedData,
  //   newField: typedData.oldField,
  //   schema_version: toVersion
  // }
  
  // For now, just pass through with version update
  if (typeof data === 'object' && data !== null) {
    return {
      ...data,
      schema_version: toVersion
    }
  }
  
  return { schema_version: toVersion }
}

/**
 * Optional validation function
 * Run after migration to verify the result is valid
 * 
 * @param data - The migrated data to validate
 * @returns true if valid, false otherwise
 */
export function validate(data: unknown): boolean {
  // TODO: Implement validation logic
  // Example:
  // if (typeof data !== 'object' || data === null) return false
  // const typed = data as { schema_version: string }
  // return typed.schema_version === toVersion
  
  return true
}

/**
 * Optional description of what this migration does
 * Used for logging and dry-run previews
 */
export const description = 'Migrate from {from} to {to}'

// Default export for dynamic import
const migrationScript: MigrationScript = {
  fromVersion,
  toVersion,
  description: description.replace('{from}', fromVersion).replace('{to}', toVersion),
  migrate,
  validate
}

export default migrationScript