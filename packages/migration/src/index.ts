/**
 * Migration subsystem for SpecForge V6
 * 
 * This module provides migration capabilities for the V6 architecture,
 * handling data transformations, schema migrations, and version upgrades.
 */

// Export types (MigrationScript from types.ts is the canonical one)
export * from './types'
export * from './schema-detector'
export * from './schema-descriptor-registry'
export * from './work-item-metadata-schema-descriptor'
export * from './user-decision-schema-descriptor'

// Export schema validator (exclude types already exported from ./types)
export * from './schema-validator'

// Export backup-manager (has its own cleanupOldBackups)
export * from './backup-manager'

// Export inconsistency detector (Task 4.1)
export * from './inconsistency-detector'

// Export repair engine (Task 4.2)
export * from './repair-engine'

// Export recovery event logger (Task 4.3)
export * from './recovery-event-logger'

// Export error handler (Task 5.2)
export * from './error-handler'
