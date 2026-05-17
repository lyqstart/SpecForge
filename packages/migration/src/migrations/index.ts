/**
 * Migration scripts index
 * 
 * This module exports all migration scripts and provides utilities
 * for working with the migration directory.
 * 
 * @note Migration scripts are discovered dynamically from the filesystem
 *       by the apply.ts module. This index provides type exports and
 *       common utilities.
 */

export type { MigrationScript, MigrationScriptInfo } from '../apply'
export { discoverMigrationScripts, filterMigrationsForUpgrade } from '../apply'

/**
 * Migration directory conventions:
 * 
 * 1. Directory structure:
 *    migrations/
 *    ├── _template.ts          # Template for new migrations
 *    ├── v1.0.0-to-v1.1.0.ts   # Version-to-version migration scripts
 *    ├── v1.1.0-to-v1.2.0.ts
 *    └── ...
 * 
 * 2. Filename format: v<FROM>-to-v<TO>.ts
 *    - FROM: source version (e.g., 1.0.0)
 *    - TO: target version (e.g., 1.1.0)
 * 
 * 3. Required exports:
 *    - migrate(data: unknown): Promise<unknown> - main migration function
 *    - fromVersion: string - source version
 *    - toVersion: string - target version
 * 
 * 4. Optional exports:
 *    - validate(data: unknown): boolean - post-migration validation
 *    - description: string - human-readable description
 * 
 * 5. Script must be idempotent: running multiple times should produce the same result
 */

// Re-export migration script interface
export type { MigrationScript as MigrationScriptType } from '../apply'

/**
 * Example migration script paths (for reference):
 * - packages/migration/src/migrations/_template.ts
 * - packages/migration/src/migrations/v1.0.0-to-v1.1.0.ts
 */