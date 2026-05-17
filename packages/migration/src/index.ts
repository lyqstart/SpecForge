/**
 * Migration subsystem for SpecForge V6
 * 
 * This module provides migration capabilities for the V6 architecture,
 * handling data transformations, schema migrations, and version upgrades.
 */

// Export types (MigrationScript from types.ts is the canonical one)
export * from './types'
export * from './runner'
export * from './schema-detector'

// Export schema validator
export * from './schema-validator'

// Export apply module but exclude duplicates that are in discovery
export { 
  applyMigrations, 
  buildExecutionPlan,
  parseMigrationFilename,
  parseMigrationMetadata,
  type MigrationScriptInfo,
  type MigrationExecutionPlan,
  type MigrationStepResult
} from './apply'

// Export backup-manager (has its own cleanupOldBackups)
export * from './backup-manager'

// Export discovery (has its own MigrationScript and discoverMigrationScripts)
export * from './discovery'

// Export migrations
export * from './migrations'

// Export inconsistency detector (Task 4.1)
export * from './inconsistency-detector'

// Export repair engine (Task 4.2)
export * from './repair-engine'

// Export recovery event logger (Task 4.3)
export * from './recovery-event-logger'

// Export daemon startup integration (Task 5.1)
export * from './daemon-startup-integration'

// Export error handler (Task 5.2)
export * from './error-handler'

// Export configuration integration (Task 5.3)
export * from './migration-config'

// Export dry-run types
export type {
  DryRunChange,
  DryRunValidationResult,
  DryRunResult
} from './runner'