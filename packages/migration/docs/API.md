# Migration Subsystem API Documentation

The migration subsystem provides comprehensive APIs for schema versioning, automatic migration scripts, and recovery repair logic.

## Table of Contents

- [Migration Script API](#migration-script-api)
- [Backup Manager API](#backup-manager-api)
- [Recovery Repair API](#recovery-repair-api)
- [Schema Detection API](#schema-detection-api)
- [Configuration API](#configuration-api)

---

## Migration Script API

### MigrationScript Interface

Core interface that all migration scripts must implement.

```typescript
interface MigrationScript {
  /** Source schema version (from) */
  fromVersion: string
  /** Target schema version (to) */
  toVersion: string

  /** Executes forward migration */
  up(): Promise<void>

  /** Rolls back to previous version */
  down(): Promise<void>

  /** Verifies migration success */
  verify(): Promise<boolean>
}
```

### MigrationRunner Class

Provides transactional migration execution with automatic rollback on failure.

```typescript
import { MigrationRunner, createMigrationRunner } from '@specforge/migration'

// Create runner with options
const runner = createMigrationRunner({
  migrationsDir: '.specforge/migrations',
  backupDir: '.specforge/backups',
  filesToBackup: ['./state.json', './events.jsonl'],
  scriptTimeoutMs: 30000,
  dryRun: false,
  validateAfterEach: true,
  retentionDays: 7
})

// Run migrations
const result = await runner.run(
  { sourceVersion: '1.0.0', targetVersion: '2.0.0' },
  [migrationScript1, migrationScript2]
)

// Check result
if (result.success) {
  console.log(`Migrated in ${result.totalDurationMs}ms`)
} else {
  console.error('Migration failed:', result.errors)
  if (result.rolledBack) {
    console.log('Rolled back to pre-migration state')
  }
}
```

#### TransactionalMigrationOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `migrationsDir` | string | `.specforge/migrations` | Directory containing migration scripts |
| `backupDir` | string | `.specforge/backups` | Directory for backups |
| `filesToBackup` | string[] | `[]` | Files to backup before migration |
| `scriptTimeoutMs` | number | `30000` | Timeout for each migration script |
| `dryRun` | boolean | `false` | Enable dry-run mode |
| `validateAfterEach` | boolean | `true` | Validate after each migration |
| `validate` | function | `undefined` | Custom validation function |
| `retentionDays` | number | `7` | Backup retention days |
| `skipBackup` | boolean | `false` | Skip backup creation (testing) |

#### TransactionalMigrationResult

```typescript
interface TransactionalMigrationResult {
  success: boolean
  executed: MigrationExecutionDetails[]
  backupSession?: BackupSession
  errors: MigrationError[]
  totalDurationMs: number
  rolledBack: boolean
}
```

### Dry-Run Mode

Preview changes without applying them.

```typescript
const dryRunResult = await runner.dryRun(
  { sourceVersion: '1.0.0', targetVersion: '2.0.0' },
  [migrationScript1, migrationScript2]
)

console.log('Would upgrade from:', dryRunResult.willUpgradeFrom)
console.log('Would upgrade to:', dryRunResult.willUpgradeTo)
console.log('Changes:', dryRunResult.changeSummary)
console.log('Valid:', dryRunResult.validation.valid)
```

---

## Migration Discovery API

### discoverMigrationScripts

Discovers migration scripts in a directory and validates the migration graph.

```typescript
import { discoverMigrationScripts } from '@specforge/migration'

const result = await discoverMigrationScripts('./migrations')

if (result.ok) {
  for (const script of result.scripts) {
    console.log(`${script.fromVersion} -> ${script.toVersion}`)
    console.log('  File:', script.filePath)
  }
} else {
  console.error('Discovery errors:', result.errors)
}
```

#### DiscoveryResult

```typescript
interface DiscoveryResult {
  ok: boolean
  scripts: MigrationScript[]
  errors: DiscoveryError[]
}

interface MigrationScript {
  fromVersion: string   // e.g., "1.0.0"
  toVersion: string     // e.g., "1.1.0"
  filePath: string      // Absolute path
  scriptName: string    // Filename
}

interface DiscoveryError {
  code: 'MALFORMED_FILENAME' | 'INVALID_VERSION' | 'SELF_LOOP' | 
        'BACKWARD_EDGE' | 'DUPLICATE_EDGE' | 'BRANCH' | 'MERGE' | 'IO_ERROR'
  message: string
  scriptName?: string
  related?: string[]
}
```

### buildExecutionPlan

Builds an ordered execution plan for version upgrade.

```typescript
import { buildExecutionPlan } from '@specforge/migration'

const plan = await buildExecutionPlan(
  './migrations',
  '1.0.0',  // from version
  '2.0.0'   // to version
)

console.log('Steps:', plan.totalSteps)
console.log('Duration (est):', plan.estimatedDurationMs, 'ms')
console.log('Path:', plan.willUpgradeFrom, '->', plan.willUpgradeTo)

for (const step of plan.scripts) {
  console.log(`  ${step.fromVersion} -> ${step.toVersion}`)
}
```

---

## Backup Manager API

### backupFile

Create a backup of a single file.

```typescript
import { backupFile, generateTimestamp } from '@specforge/migration'

const info = await backupFile('./state.json', {
  backupDir: '.specforge/backups',
  sessionName: 'pre-migration-001',
  calculateHash: true,
  fromVersion: '1.0.0',
  toVersion: '1.1.0'
})

console.log('Backed up:', info.originalPath)
console.log('Backup location:', info.backupPath)
console.log('Hash:', info.hash)
```

### backupFiles

Backup multiple files in a single session.

```typescript
import { backupFiles } from '@specforge/migration'

const session = await backupFiles(
  ['./state.json', './events.jsonl'],
  {
    backupDir: '.specforge/backups',
    sessionName: 'migration-session',
    calculateHash: true,
    fromVersion: '1.0.0',
    toVersion: '2.0.0'
  }
)

console.log('Session:', session.timestamp)
console.log('Backed up:', session.backups.length, 'files')
```

### restoreFromBackup

Restore a file from backup.

```typescript
import { restoreFromBackup } from '@specforge/migration'

const restoredPath = await restoreFromBackup(
  './backups/2024-01-15T10-30-00-000/state.json',
  {
    restoreToOriginal: true,
    verifyHash: true
  }
)
```

### cleanupOldBackups

Clean up backups older than retention period.

```typescript
import { cleanupOldBackups } from '@specforge/migration'

const result = await cleanupOldBackups(
  '.specforge/backups',
  7  // retention days
)

console.log('Deleted:', result.deleted)
console.log('Retained:', result.retained)
console.log('Freed:', result.freedBytes, 'bytes')
```

### listBackupSessions

List all backup sessions.

```typescript
import { listBackupSessions } from '@specforge/migration'

const { sessions, totalBackups, totalSize } = await listBackupSessions(
  '.specforge/backups'
)

for (const session of sessions) {
  console.log(`${session.name}: ${session.fileCount} files, ${session.totalSize} bytes`)
}
```

---

## Recovery Repair API

### detectAndRepair

Main entry point for detecting and repairing inconsistencies.

```typescript
import { detectAndRepair } from '@specforge/migration'

const result = await detectAndRepair({
  baseDir: './data',
  codeSchemaVersion: '1.0.0',
  checkDesignPhase: true,
  logEvents: true,
  eventLogger: async (event) => {
    // Log to your event system
    console.log('Repair event:', event)
  }
})

if (result.repaired) {
  console.log('Repaired using rule:', result.ruleApplied)
  console.log('Description:', result.description)
} else {
  console.error('Repair failed:', result.error)
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings)
}
```

### RepairEngine Class

Class-based interface for repairs.

```typescript
import { RepairEngine } from '@specforge/migration'

const engine = new RepairEngine({
  baseDir: './data',
  codeSchemaVersion: '1.0.0',
  checkDesignPhase: true,
  logEvents: true,
  eventLogger: myEventLogger
})

// Detect only
const detection = await engine.detect()
console.log('Has inconsistency:', detection.hasInconsistency)

// Get recommended rule without applying
const recommended = await engine.getRecommendedRule()
console.log('Recommended rule:', recommended)

// Apply specific rule manually
const result = await engine.applyRule('rollback_to_requirements')
```

### InconsistencyDetector

Detect inconsistencies between events.jsonl and state.json.

```typescript
import { InconsistencyDetector, detectInconsistencies } from '@specforge/migration'

// Function-based
const result = await detectInconsistencies({
  baseDir: './data',
  codeSchemaVersion: '1.0.0',
  checkDesignPhase: true
})

if (result.hasInconsistency) {
  for (const issue of result.inconsistencies) {
    console.log(`[${issue.severity}] ${issue.type}: ${issue.message}`)
  }
}

// Class-based
const detector = new InconsistencyDetector({
  baseDir: './data',
  codeSchemaVersion: '1.0.0'
})

const hasIssues = await detector.hasInconsistency()
const critical = await detector.getCritical()
const recommendations = await detector.getRepairRecommendations()
```

#### Inconsistency Types

| Type | Severity | Description |
|------|----------|-------------|
| `events_missing` | critical | events.jsonl file is missing |
| `events_corrupted` | critical | events.jsonl has invalid JSON |
| `events_empty` | info | events.jsonl is empty |
| `state_missing` | warning | state.json file is missing |
| `state_corrupted` | critical | state.json has invalid JSON |
| `state_invalid_structure` | warning | state.json lacks required fields |
| `design_missing` | warning | State indicates design phase but design.md missing |
| `both_missing` | critical | Both files are missing |
| `both_corrupted` | critical | Both files are corrupted |
| `sequence_mismatch` | warning | Event count mismatch between files |
| `version_mismatch` | warning | Schema version mismatch |

### Repair Rule IDs

| Rule ID | Description |
|---------|-------------|
| `rebuild_from_events` | Rebuild state.json from valid events.jsonl |
| `use_state_with_warning` | Use state.json as fallback (events corrupted) |
| `rollback_to_requirements` | Roll back to requirements phase (design.md missing) |
| `fresh_start` | Start fresh (both files corrupted) |

---

## Schema Detection API

### detectSchemaVersion

Detect schema version from a file.

```typescript
import { detectSchemaVersion, compareVersions, compareWithCodeVersion } from '@specforge/migration'

// Detect from single file
const result = await detectSchemaVersion('./state.json')
console.log('Version:', result.schemaVersion)
console.log('Detected:', result.detected)
if (result.error) {
  console.error('Error:', result.error.message)
}

// Compare versions
console.log(compareVersions('1.0.0', '1.1.0'))  // -1 (1.0.0 < 1.1.0)
console.log(compareVersions('2.0.0', '1.0.0'))  // 1 (2.0.0 > 1.0.0)
console.log(compareVersions('1.0.0', '1.0.0'))  // 0 (equal)

// Compare with code version
const comparison = compareWithCodeVersion('1.0.0', '1.0.0')
console.log('Comparison:', comparison.comparison)  // 'equal'
console.log('Needs migration:', comparison.needsMigration)
console.log('Needs downgrade:', comparison.needsDowngrade)
```

### detectFromDirectory

Detect schema versions from all standard files in a directory.

```typescript
import { detectFromDirectory } from '@specforge/migration'

const result = await detectFromDirectory('./data', '1.0.0')

console.log('Events version:', result.events.schemaVersion)
console.log('State version:', result.state.schemaVersion)
console.log('Overall:', result.overall.comparison)
```

---

## Configuration API

### MigrationConfig

Configuration interface for the migration subsystem.

```typescript
import { 
  MigrationConfig, 
  DEFAULT_MIGRATION_CONFIG,
  createMigrationConfig,
  MIGRATION_CONFIG_KEYS
} from '@specforge/migration'

// Default configuration
const defaults = DEFAULT_MIGRATION_CONFIG

// Create from config layer data
const config = createMigrationConfig({
  migration: {
    autoMigrate: true,
    enableRepair: true,
    blockOnDowngrade: true,
    backupRetentionDays: 14,
    scriptTimeoutMs: 60000
  }
})
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema_version` | string | `1.0.0` | Config schema version |
| `autoMigrate` | boolean | `true` | Enable automatic migration |
| `enableRepair` | boolean | `true` | Enable repair engine |
| `blockOnDowngrade` | boolean | `true` | Block startup on version downgrade |
| `blockOnMigrationFailure` | boolean | `false` | Block startup on migration failure |
| `migrationsDir` | string | `.specforge/migrations` | Migration scripts directory |
| `backupDir` | string | `.specforge/backups` | Backup directory |
| `backupRetentionDays` | number | `7` | Backup retention days |
| `scriptTimeoutMs` | number | `30000` | Script timeout in ms |
| `dryRun` | boolean | `false` | Run in preview mode |
| `validateAfterEach` | boolean | `true` | Validate after each migration |
| `filesToBackup` | string[] | `[]` | Files to backup |
| `codeSchemaVersion` | string | `undefined` | Override code schema version |
| `targetFiles` | string | `all` | Target files to check |

### Configuration Keys

```typescript
// Access via configuration system
MIGRATION_CONFIG_KEYS.AUTO_MIGRATE          // 'migration.autoMigrate'
MIGRATION_CONFIG_KEYS.ENABLE_REPAIR         // 'migration.enableRepair'
MIGRATION_CONFIG_KEYS.BLOCK_ON_DOWNGRADE    // 'migration.blockOnDowngrade'
MIGRATION_CONFIG_KEYS.MIGRATIONS_DIR        // 'migration.migrationsDir'
MIGRATION_CONFIG_KEYS.BACKUP_DIR            // 'migration.backupDir'
MIGRATION_CONFIG_KEYS.BACKUP_RETENTION_DAYS // 'migration.backupRetentionDays'
MIGRATION_CONFIG_KEYS.SCRIPT_TIMEOUT_MS     // 'migration.scriptTimeoutMs'
MIGRATION_CONFIG_KEYS.DRY_RUN               // 'migration.dryRun'
```

---

## Error Handling

### MigrationError Classes

```typescript
import { 
  MigrationError,
  MigrationExecutionError,
  MigrationVerificationError,
  MigrationRollbackError,
  MigrationBackupError,
  InvalidVersionError,
  ScriptLoadError
} from '@specforge/migration'

try {
  await runner.run(context, scripts)
} catch (err) {
  if (err instanceof MigrationExecutionError) {
    console.error('Script failed:', err.scriptPath)
    console.error('From:', err.fromVersion, 'To:', err.toVersion)
    console.error('Original:', err.originalError?.message)
  } else if (err instanceof MigrationBackupError) {
    console.error('Backup operation:', err.operation)
    console.error('Path:', err.path)
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `MIGRATION_ALREADY_EXISTS` | Migration already applied |
| `MIGRATION_NOT_FOUND` | Required migration not found |
| `MIGRATION_FAILED` | Migration script execution failed |
| `MIGRATION_VERIFICATION_FAILED` | Post-migration validation failed |
| `MIGRATION_ROLLBACK_FAILED` | Rollback after failure failed |
| `MIGRATION_BACKUP_FAILED` | Backup creation failed |
| `MIGRATION_RESTORE_FAILED` | Restore from backup failed |
| `MIGRATION_TIMEOUT` | Script execution timeout |
| `MIGRATION_INVALID_VERSION` | Invalid version format |
| `MIGRATION_IN_PROGRESS` | Migration already running |
| `MIGRATION_NOT_REVERSIBLE` | Migration cannot be rolled back |
| `SCRIPT_LOAD_ERROR` | Failed to load migration script |
| `SCRIPT_VALIDATION_ERROR` | Migration script validation failed |

---

## Complete Usage Example

```typescript
import {
  MigrationRunner,
  createMigrationRunner,
  discoverMigrationScripts,
  detectAndRepair,
  detectSchemaVersion,
  createMigrationConfig,
  cleanupOldBackups
} from '@specforge/migration'

async function main() {
  // 1. Load configuration
  const config = createMigrationConfig(userConfig)
  
  // 2. Ensure directories exist
  // (Your directory setup code)
  
  // 3. Check and repair if needed
  const repairResult = await detectAndRepair({
    baseDir: './data',
    codeSchemaVersion: config.codeSchemaVersion || '1.0.0',
    checkDesignPhase: true,
    logEvents: true,
    eventLogger: logRepairEvent
  })
  
  if (!repairResult.repaired) {
    console.error('Repair failed:', repairResult.error)
    process.exit(1)
  }
  
  // 4. Detect current schema version
  const versionResult = await detectSchemaVersion('./data/state.json')
  const currentVersion = versionResult.schemaVersion
  
  // 5. Discover and execute migrations if needed
  const codeVersion = config.codeSchemaVersion || '1.0.0'
  
  if (currentVersion && currentVersion !== codeVersion) {
    const discovery = await discoverMigrationScripts(config.migrationsDir)
    
    if (discovery.ok) {
      const runner = createMigrationRunner({
        backupDir: config.backupDir,
        filesToBackup: ['./data/state.json', './data/events.jsonl'],
        scriptTimeoutMs: config.scriptTimeoutMs,
        retentionDays: config.backupRetentionDays
      })
      
      const result = await runner.run(
        { sourceVersion: currentVersion, targetVersion: codeVersion },
        discovery.scripts.map(loadScript)
      )
      
      if (result.success) {
        console.log('Migration completed successfully')
      } else {
        console.error('Migration failed:', result.errors)
        if (config.blockOnMigrationFailure) {
          process.exit(1)
        }
      }
    }
  }
  
  // 6. Cleanup old backups
  await cleanupOldBackups(config.backupDir, config.backupRetentionDays)
}

main()
```