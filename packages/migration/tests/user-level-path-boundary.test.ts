import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSpecForgeUserRoot } from '@specforge/types/user-level-paths'
import { DEFAULT_BACKUP_DIR } from '../src/backup-manager'
import { getBackupDir, getMigrationDir } from '../src/daemon-startup-integration'
import { DEFAULT_MIGRATION_CONFIG } from '../src/migration-config'

describe('user-level path boundary', () => {
  const userRoot = resolveSpecForgeUserRoot()

  it('keeps migration runtime data under sf-user', () => {
    expect(getMigrationDir()).toBe(path.join(userRoot, 'migrations'))
    expect(DEFAULT_MIGRATION_CONFIG.migrationsDir).toBe(path.join(userRoot, 'migrations'))
  })

  it('keeps migration backups under sf-user', () => {
    expect(getBackupDir()).toBe(path.join(userRoot, 'backups'))
    expect(DEFAULT_BACKUP_DIR).toBe(path.join(userRoot, 'backups'))
    expect(DEFAULT_MIGRATION_CONFIG.backupDir).toBe(path.join(userRoot, 'backups'))
  })
})
