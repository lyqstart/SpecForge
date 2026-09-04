import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import * as upgradeJournal from '../../../scripts/lib/upgrade-journal';

async function createRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'specforge-installer-backup-'));
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function createUpgradeBackup(): (
  userLevelDir: string,
  journal: upgradeJournal.UpgradeJournal,
  relativePath: string,
) => Promise<{ backup_path: string; backup_sha256: string }> {
  const candidate = (upgradeJournal as Record<string, unknown>).createUpgradeBackup;
  if (typeof candidate !== 'function') {
    throw new Error('createUpgradeBackup current owner API is missing');
  }
  return candidate as ReturnType<typeof createUpgradeBackup>;
}

describe('current installer backup lifecycle', () => {
  it('makes the installer consume the journal-owned backup API only', async () => {
    const installer = await readFile(
      join(import.meta.dirname, '../../../scripts/sf-installer.ts'),
      'utf8',
    );

    expect(installer.includes('createUpgradeBackup')).toBe(true);
    expect(installer.includes('import { backupFile } from "./lib/atomic"')).toBe(false);
  });

  it('rejects legacy .backup paths and requires a hash-bound transaction backup', () => {
    expect(() => upgradeJournal.parseUpgradeJournal({
      schema_version: '1.0',
      transaction_id: '11111111-1111-4111-8111-111111111111',
      started_at: '2026-09-01T00:00:00.000Z',
      from_version: '6.0.0',
      to_version: '6.0.1',
      status: 'in_progress',
      mutations: [{
        path: 'existing.txt',
        operation: 'replace',
        state: 'planned',
        existed_before: true,
        backup_path: '.backup/existing.txt.bak',
      }],
    })).toThrow(/backup/);
  });

  it('creates an atomic hash-bound backup in the current backups transaction root', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'existing.txt'), 'old bytes');
    const journal = await upgradeJournal.beginUpgradeJournal(root, '6.0.0', '6.0.1');

    const backup = await createUpgradeBackup()(root, journal, 'existing.txt');

    expect(backup.backup_path.startsWith('backups/')).toBe(true);
    expect(backup.backup_path.includes(journal.transaction_id)).toBe(true);
    expect(backup.backup_sha256).toBe(sha256('old bytes'));
    expect(await readFile(join(root, ...backup.backup_path.split('/')), 'utf8')).toBe('old bytes');
    expect(existsSync(join(root, '.backup'))).toBe(false);
  });

  it('verifies every backup hash before changing any rollback target', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'existing.txt'), 'old bytes');
    const journal = await upgradeJournal.beginUpgradeJournal(root, '6.0.0', '6.0.1');
    const backup = await createUpgradeBackup()(root, journal, 'existing.txt');
    const index = await upgradeJournal.planUpgradeMutation(root, journal, {
      path: 'existing.txt',
      operation: 'replace',
      existed_before: true,
      ...backup,
    });
    await writeFile(join(root, 'existing.txt'), 'new bytes');
    await upgradeJournal.markUpgradeMutationApplied(root, journal, index);
    await writeFile(join(root, ...backup.backup_path.split('/')), 'corrupt');

    await expect(upgradeJournal.rollbackUpgradeJournal(root, journal)).rejects.toThrow(/hash/i);
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('new bytes');
  });

  it('removes only the committed transaction backup session on success', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'existing.txt'), 'old bytes');
    const journal = await upgradeJournal.beginUpgradeJournal(root, '6.0.0', '6.0.1');
    const backup = await createUpgradeBackup()(root, journal, 'existing.txt');
    const index = await upgradeJournal.planUpgradeMutation(root, journal, {
      path: 'existing.txt',
      operation: 'replace',
      existed_before: true,
      ...backup,
    });
    await upgradeJournal.markUpgradeMutationApplied(root, journal, index);
    const backupSession = dirname(join(root, ...backup.backup_path.split('/')));
    const unrelatedBackup = join(root, 'backups', 'unrelated-session', 'evidence.bak');
    await mkdir(dirname(unrelatedBackup), { recursive: true });
    await writeFile(unrelatedBackup, 'unrelated');

    await upgradeJournal.commitUpgradeJournal(root, journal);

    expect(existsSync(backupSession)).toBe(false);
    expect(await readFile(unrelatedBackup, 'utf8')).toBe('unrelated');
    expect(existsSync(join(root, 'upgrade_journal.json'))).toBe(false);
  });

  it('retains rolled-back evidence until the next retry then clears the transaction session', async () => {
    const root = await createRoot();
    await writeFile(join(root, 'existing.txt'), 'old bytes');
    const journal = await upgradeJournal.beginUpgradeJournal(root, '6.0.0', '6.0.1');
    const backup = await createUpgradeBackup()(root, journal, 'existing.txt');
    const index = await upgradeJournal.planUpgradeMutation(root, journal, {
      path: 'existing.txt',
      operation: 'replace',
      existed_before: true,
      ...backup,
    });
    await writeFile(join(root, 'existing.txt'), 'new bytes');
    await upgradeJournal.markUpgradeMutationApplied(root, journal, index);
    const backupSession = dirname(join(root, ...backup.backup_path.split('/')));

    await upgradeJournal.rollbackUpgradeJournal(root, journal);
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('old bytes');
    expect(existsSync(backupSession)).toBe(true);

    await expect(upgradeJournal.recoverInterruptedUpgrade(root)).resolves.toBe('cleared_rolled_back');
    expect(existsSync(backupSession)).toBe(false);
    expect(existsSync(join(root, 'upgrade_journal.json'))).toBe(false);
  });
});
