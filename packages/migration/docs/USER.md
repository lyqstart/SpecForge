# Migration Subsystem User Guide

This guide explains how to use SpecForge's migration system to upgrade your data when upgrading SpecForge, and how to repair inconsistent states.

---

## Table of Contents

1. [Understanding Migration](#1-understanding-migration)
2. [Automatic Migration Process](#2-automatic-migration-process)
3. [Manual Migration](#3-manual-migration)
4. [Recovery Repair](#4-recovery-repair)
5. [Troubleshooting Guide](#5-troubleshooting-guide)
6. [Configuration](#6-configuration)

---

## 1. Understanding Migration

### What is Schema Version?

Schema version is a version number in SpecForge's data files (like `state.json` and `events.jsonl`) that indicates the file format version. When SpecForge is upgraded, the schema version in the code may be newer than the version in your data files. The migration system handles this difference automatically.

### When is Migration Needed?

Migration is needed when:
- You upgrade SpecForge to a new version
- The new version has a different file format than your current version

### Version Comparison Logic

| Scenario | What Happens |
|----------|---------------|
| Code version > File version | Automatic migration runs |
| Code version = File version | Normal startup |
| Code version < File version | Startup blocked, upgrade prompt shown |

---

## 2. Automatic Migration Process

### How Automatic Migration Works

When you start SpecForge after upgrading:

1. **Version Detection**: SpecForge checks the schema version in your data files
2. **Migration Discovery**: If needed, it finds the appropriate migration scripts
3. **Backup Creation**: Before any changes, a backup is created in `~/.specforge/backups/`
4. **Migration Execution**: Migration scripts transform your data to the new format
5. **Validation**: After migration, SpecForge validates the result
6. **Completion**: If successful, the new schema version is recorded

### Migration Backup

Before migration, SpecForge automatically creates backups:

- **Backup Location**: `~/.specforge/backups/<timestamp>/`
- **Default Retention**: 7 days
- **Files Backed Up**: `state.json`, `events.jsonl`, and other persistent files

You can restore from backup if something goes wrong:

```bash
# Restore from backup (example path)
cp ~/.specforge/backups/2024-01-15T10-30-00/state.json ~/.specforge/state.json
```

### Dry-Run Mode

To preview migration changes without applying them, use dry-run mode:

```typescript
import { createMigrationRunner } from '@specforge/migration'

const runner = createMigrationRunner({
  dryRun: true,
  migrationsDir: '.specforge/migrations',
  backupDir: '.specforge/backups'
})

const result = await runner.dryRun(
  { sourceVersion: '1.0.0', targetVersion: '2.0.0' },
  migrationScripts
)

console.log('Changes that would be made:', result.changeSummary)
```

---

## 3. Manual Migration

### Migration Scripts Directory

Migration scripts are stored in: `~/.specforge/migrations/`

Script naming convention: `v<from-version>-to-v<to-version>.ts`

Example: `v1.0.0-to-v1.1.0.ts`

### Creating a Migration Script

If you need to create a custom migration script:

```typescript
// ~/.specforge/migrations/v1.0.0-to-v1.1.0.ts
import { MigrationScript } from '@specforge/migration'

export const migration: MigrationScript = {
  fromVersion: '1.0.0',
  toVersion: '1.1.0',

  async up() {
    // Transform data from 1.0.0 to 1.1.0 format
    const state = await readStateFile()
    
    // Add new fields or transform existing ones
    state.newField = 'default_value'
    
    await writeStateFile(state)
  },

  async down() {
    // Rollback: transform from 1.1.0 back to 1.0.0
    const state = await readStateFile()
    
    delete state.newField
    
    await writeStateFile(state)
  },

  async verify() {
    // Verify migration was successful
    const state = await readStateFile()
    return state.schema_version === '1.1.0'
  }
}
```

### Migration Execution Commands

```bash
# Run migrations (automatic during startup)
specforge daemon start

# Preview migration without executing
specforge migration dry-run

# Force re-run migration
specforge migration run --force

# Check current schema version
specforge migration status
```

---

## 4. Recovery Repair

### What is Recovery Repair?

Recovery repair automatically fixes inconsistent states that may occur after:
- System crash during operation
- Unexpected termination
- Disk errors
- Incomplete write operations

### How Repair Works

When SpecForge starts, it checks for inconsistencies between:
- `events.jsonl` (event log)
- `state.json` (current state)

If inconsistencies are found, the repair engine applies predefined rules to restore consistency.

### Repair Rules

| Rule | Condition | Action |
|------|-----------|--------|
| `rebuild_from_events` | events.jsonl is valid | Rebuild state.json from events.jsonl |
| `use_state_with_warning` | events.jsonl corrupted | Use state.json as fallback |
| `rollback_to_requirements` | Design phase but design.md missing | Roll back to requirements phase |
| `fresh_start` | Both files corrupted | Start with empty state |

### Repair Event Logging

All repair actions are logged with the event type `recovery.repaired`:

```json
{
  "type": "recovery.repaired",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "originalState": "inconsistent",
    "repairedState": "consistent",
    "ruleApplied": "rebuild_from_events",
    "description": "Rebuilt state.json from valid events.jsonl"
  }
}
```

### Manual Repair

You can trigger a manual repair check:

```typescript
import { detectAndRepair } from '@specforge/migration'

const result = await detectAndRepair({
  baseDir: './data',
  codeSchemaVersion: '1.0.0',
  checkDesignPhase: true,
  logEvents: true,
  eventLogger: async (event) => {
    console.log('Repair event:', event)
  }
})

if (result.repaired) {
  console.log('Repaired using rule:', result.ruleApplied)
}
```

---

## 5. Troubleshooting Guide

### Common Issues and Solutions

#### Issue: Migration Fails

**Symptoms:**
- Error message during startup
- Migration failed warning

**Solutions:**
1. Check backup was created
2. Restore from backup:
   ```bash
   cp ~/.specforge/backups/<timestamp>/state.json ~/.specforge/state.json
   ```
3. Check migration script for errors
4. Try dry-run mode to see what would happen

#### Issue: Version Downgrade Blocked

**Symptoms:**
- "Upgrade required" message
- Daemon refuses to start

**Solutions:**
1. Upgrade SpecForge to the required version:
   ```bash
   # Check latest version
   specforge --version
   
   # Update to latest
   specforge update
   ```
2. If you must use older version, manually edit schema_version in state.json (not recommended)

#### Issue: Repair Loop

**Symptoms:**
- System repairs on every startup
- Events repeatedly logged

**Solutions:**
1. Check for persistent hardware issues
2. Run integrity check on disk
3. Consider resetting state if data is corrupted:
   ```bash
   # Backup current state first
   cp ~/.specforge/state.json ~/state.backup.json
   cp ~/.specforge/events.jsonl ~/events.backup.jsonl
   
   # Reset to fresh state
   rm ~/.specforge/state.json
   rm ~/.specforge/events.jsonl
   ```

#### Issue: Backup Not Created

**Symptoms:**
- No backup directory exists after failed migration

**Solutions:**
1. Check disk space is available
2. Verify write permissions for `~/.specforge/backups/`
3. Check disk is not full

#### Issue: Inconsistent State Not Detected

**Symptoms:**
- System starts but behaves unexpectedly
- Missing data or corrupted files

**Solutions:**
1. Run manual repair:
   ```typescript
   import { detectAndRepair } from '@specforge/migration'
   
   await detectAndRepair({
     baseDir: './data',
     codeSchemaVersion: '1.0.0'
   })
   ```
2. Check events.jsonl for corruption:
   ```bash
   # Validate JSONL format
   cat events.jsonl | jq -s '.'
   ```

#### Issue: Migration Script Timeout

**Symptoms:**
- "Migration timeout" error
- Script takes too long

**Solutions:**
1. Increase timeout in configuration:
   ```typescript
   const runner = createMigrationRunner({
     scriptTimeoutMs: 60000  // 60 seconds
   })
   ```
2. Check migration script for infinite loops
3. Simplify migration script if data is large

### Error Messages Reference

| Error Message | Meaning | Resolution |
|---------------|---------|------------|
| `Migration script not found` | Required migration script missing | Check ~/.specforge/migrations/ directory |
| `Backup failed` | Could not create backup | Check disk space and permissions |
| `Validation failed` | Post-migration check failed | Check data integrity, try restoring backup |
| `Version too old` | Version difference too large | May need multiple sequential migrations |
| `Repair failed` | Could not repair inconsistency | Check disk health, consider fresh start |

### Getting Help

If you encounter issues not covered here:

1. Check the logs in `~/.specforge/logs/`
2. Run with verbose logging:
   ```bash
   specforge daemon start --verbose
   ```
3. Review backup files in `~/.specforge/backups/`
4. Contact support with error messages and logs

---

## 6. Configuration

### Configuration Options

You can customize migration behavior in your configuration:

```typescript
const config = {
  migration: {
    // Enable automatic migration (default: true)
    autoMigrate: true,
    
    // Enable repair engine (default: true)
    enableRepair: true,
    
    // Block startup on version downgrade (default: true)
    blockOnDowngrade: true,
    
    // Backup retention days (default: 7)
    backupRetentionDays: 7,
    
    // Script timeout in milliseconds (default: 30000)
    scriptTimeoutMs: 30000,
    
    // Migration scripts directory
    migrationsDir: '.specforge/migrations',
    
    // Backup directory
    backupDir: '.specforge/backups'
  }
}
```

### Configuration File Location

Configuration can be set in:
- `~/.specforge/config.json` (user-level)
- Project-level config files

### Viewing Current Configuration

```bash
# Show migration configuration
specforge config get migration
```

---

## Appendix: File Locations

| Purpose | Location |
|---------|----------|
| Data directory | `~/.specforge/` |
| Migration scripts | `~/.specforge/migrations/` |
| Backups | `~/.specforge/backups/<timestamp>/` |
| Logs | `~/.specforge/logs/` |
| State file | `~/.specforge/state.json` |
| Events log | `~/.specforge/events.jsonl` |

---

## Quick Reference

### Starting SpecForge After Upgrade
```bash
specforge daemon start
```

### Checking Schema Version
```bash
cat ~/.specforge/state.json | jq '.schema_version'
```

### Running Manual Repair
```bash
specforge repair run
```

### Restoring from Backup
```bash
# List backups
ls ~/.specforge/backups/

# Restore specific backup
cp ~/.specforge/backups/2024-01-15T10-30-00/state.json ~/.specforge/state.json
```

### Previewing Migration
```bash
specforge migration dry-run
```