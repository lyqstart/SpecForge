import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  beginUpgradeJournal,
  createUpgradeBackup,
  markUpgradeMutationApplied,
  parseUpgradeJournal,
  planUpgradeMutation,
  recoverInterruptedUpgrade,
  rollbackUpgradeJournal,
} from '../../../scripts/lib/upgrade-journal';

async function createRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'specforge-upgrade-journal-'));
}

describe('current upgrade journal transaction contract', () => {
  it('makes the current installer consume the shared transaction owner', async () => {
    const installer = await readFile(
      join(import.meta.dirname, '../../../scripts/sf-installer.ts'),
      'utf8',
    );

    expect(installer.includes('from "./lib/upgrade-journal"')).toBe(true);
    expect(installer.includes('recoverInterruptedUpgrade(userLevelDir)')).toBe(true);
    expect(installer.includes('planUpgradeMutation(userLevelDir, journal')).toBe(true);
    expect(installer.includes('commitUpgradeJournal(userLevelDir, journal)')).toBe(true);
    expect(installer.includes('interface UpgradeJournalFileEntry')).toBe(false);
    expect(installer.includes('status: "removed" as any')).toBe(false);
    expect(installer.includes('JSON.parse(\n          fs.readFileSync(journalPath')).toBe(false);
  });

  it('keeps reconcile from deleting the current installer transaction journal', async () => {
    const generatedFiles = await readFile(
      join(import.meta.dirname, '../../../scripts/lib/generated_files.ts'),
      'utf8',
    );

    expect(generatedFiles.includes('upgrade_journal.json')).toBe(false);
    expect(generatedFiles.includes('UPGRADE_JOURNAL_FILENAME')).toBe(false);
  });

  it('requires the independent current schema and rejects malformed journals', () => {
    expect(() => parseUpgradeJournal({
      schema_version: '1.0',
      transaction_id: '11111111-1111-4111-8111-111111111111',
      started_at: '2026-09-01T00:00:00.000Z',
      from_version: '6.0.0',
      to_version: '6.0.1',
      status: 'in_progress',
      mutations: [],
    })).not.toThrow();

    expect(() => parseUpgradeJournal({
      transaction_id: 'tx-1',
      status: 'in_progress',
      mutations: [],
    })).toThrow(/schema_version/);
  });

  it('persists a planned replacement before the target mutation', async () => {
    const root = await createRoot();
    const journal = await beginUpgradeJournal(root, '6.0.0', '6.0.1');
    await writeFile(join(root, 'existing.txt'), 'old');
    const backup = await createUpgradeBackup(root, journal, 'existing.txt');

    await planUpgradeMutation(root, journal, {
      path: 'existing.txt',
      operation: 'replace',
      existed_before: true,
      ...backup,
    });

    const persisted = parseUpgradeJournal(JSON.parse(
      await readFile(join(root, 'upgrade_journal.json'), 'utf8'),
    ));
    expect(persisted.mutations).toEqual([
      expect.objectContaining({ path: 'existing.txt', state: 'planned' }),
    ]);
  });

  it('restores an existing replaced file during rollback', async () => {
    const root = await createRoot();
    const journal = await beginUpgradeJournal(root, '6.0.0', '6.0.1');
    await writeFile(join(root, 'existing.txt'), 'old');
    const backup = await createUpgradeBackup(root, journal, 'existing.txt');
    const index = await planUpgradeMutation(root, journal, {
      path: 'existing.txt',
      operation: 'replace',
      existed_before: true,
      ...backup,
    });
    await writeFile(join(root, 'existing.txt'), 'new');
    await markUpgradeMutationApplied(root, journal, index);

    await rollbackUpgradeJournal(root, journal);

    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('old');
    expect(journal.status).toBe('rolled_back');
  });

  it('deletes a newly added file during rollback', async () => {
    const root = await createRoot();
    const journal = await beginUpgradeJournal(root, '6.0.0', '6.0.1');
    const index = await planUpgradeMutation(root, journal, {
      path: 'new.txt',
      operation: 'replace',
      existed_before: false,
    });
    await writeFile(join(root, 'new.txt'), 'new');
    await markUpgradeMutationApplied(root, journal, index);

    await rollbackUpgradeJournal(root, journal);

    expect(existsSync(join(root, 'new.txt'))).toBe(false);
  });

  it('restores a removed orphan during rollback', async () => {
    const root = await createRoot();
    const journal = await beginUpgradeJournal(root, '6.0.0', '6.0.1');
    await writeFile(join(root, 'orphan.txt'), 'orphan');
    const backup = await createUpgradeBackup(root, journal, 'orphan.txt');
    const index = await planUpgradeMutation(root, journal, {
      path: 'orphan.txt',
      operation: 'remove',
      existed_before: true,
      ...backup,
    });
    await unlink(join(root, 'orphan.txt'));
    await markUpgradeMutationApplied(root, journal, index);

    await rollbackUpgradeJournal(root, journal);

    expect(await readFile(join(root, 'orphan.txt'), 'utf8')).toBe('orphan');
  });

  it('recovers an interrupted transaction and fails closed on malformed input', async () => {
    const root = await createRoot();
    const journal = await beginUpgradeJournal(root, '6.0.0', '6.0.1');
    const index = await planUpgradeMutation(root, journal, {
      path: 'new.txt',
      operation: 'replace',
      existed_before: false,
    });
    await writeFile(join(root, 'new.txt'), 'new');
    await markUpgradeMutationApplied(root, journal, index);

    await expect(recoverInterruptedUpgrade(root)).resolves.toBe('rolled_back');
    expect(existsSync(join(root, 'new.txt'))).toBe(false);
    await expect(recoverInterruptedUpgrade(root)).resolves.toBe('cleared_rolled_back');
    expect(existsSync(join(root, 'upgrade_journal.json'))).toBe(false);

    const malformedRoot = await createRoot();
    await writeFile(join(malformedRoot, 'upgrade_journal.json'), '{}');
    await expect(recoverInterruptedUpgrade(malformedRoot)).rejects.toThrow(/schema_version/);
  });
});
