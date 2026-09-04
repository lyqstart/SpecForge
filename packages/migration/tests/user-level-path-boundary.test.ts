import * as path from 'node:path'
import * as os from 'node:os'
import { describe, expect, it } from 'vitest'
import { resolveSpecForgeUserRoot } from '@specforge/types/user-level-paths'
import { DEFAULT_BACKUP_DIR } from '../src/backup-manager'

describe('user-level path boundary', () => {
  const userRoot = resolveSpecForgeUserRoot()

  it('uses the V6 current user root', () => {
    expect(userRoot).toBe(path.join(os.homedir(), '.specforge'))
  })

  it('keeps migration backups under the current user root', () => {
    expect(DEFAULT_BACKUP_DIR).toBe(path.join(userRoot, 'backups'))
  })
})
