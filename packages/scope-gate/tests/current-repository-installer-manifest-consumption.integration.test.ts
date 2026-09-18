import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadVerifiedReleaseInstallSet } from '../../../scripts/lib/release-manifest-producer';
import { cmdInstall, cmdUpgrade } from '../../../scripts/sf-installer';

const candidateRoot = resolve(import.meta.dirname, '../../..');
const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('current repository installer manifest consumption', () => {
  it('installs exactly the verified physical release set into an isolated SpecForge root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'specforge-current-installer-'));
    tempRoots.push(tempRoot);
    const installRoot = join(tempRoot, 'opencode');
    const releaseIdentity = JSON.parse(
      await readFile(join(candidateRoot, 'release', 'release-manifest.json'), 'utf8'),
    ) as { candidateId: string };
    expect(releaseIdentity.candidateId).toMatch(/^main-[0-9a-f]{8}-working-tree-step[0-9a-z]+$/);

    const release = await loadVerifiedReleaseInstallSet({
      candidateRoot,
      expectedReleaseId: 'specforge-v6-current',
      expectedCandidateId: releaseIdentity.candidateId,
    });
    expect(release.ok, release.errors.join('\n')).toBe(true);

    await cmdInstall(
      { subcommand: 'install', force: true, showVersion: false },
      installRoot,
    );

    const installedManifest = JSON.parse(
      await readFile(join(installRoot, 'specforge-manifest.json'), 'utf8'),
    ) as { shared_version: string; files: Record<string, { sha256: string; size: number }> };
    expect(installedManifest.shared_version).toBe(release.version);
    expect(Object.keys(installedManifest.files).sort()).toEqual(
      release.files.map((file) => file.targetPath).sort(),
    );
    for (const file of release.files) {
      const installed = installedManifest.files[file.targetPath];
      expect(installed?.sha256).toBe(file.sha256);
      expect(installed?.size).toBe(file.size);
      expect((await stat(join(installRoot, ...file.targetPath.split('/')))).isFile()).toBe(true);
    }
    await expect(readFile(join(installRoot, 'install.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await stat(join(installRoot, 'sf-user'))).isDirectory()).toBe(true);
  });

  it('upgrades the isolated current release through the crash-safe transaction owner', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'specforge-current-upgrade-'));
    tempRoots.push(tempRoot);
    const installRoot = join(tempRoot, 'opencode');
    const release = await loadVerifiedReleaseInstallSet({
      candidateRoot,
      expectedReleaseId: 'specforge-v6-current',
    });
    expect(release.ok, release.errors.join('\n')).toBe(true);

    await cmdInstall(
      { subcommand: 'install', force: true, showVersion: false },
      installRoot,
    );
    await mkdir(join(installRoot, 'tools'), { recursive: true });
    await writeFile(join(installRoot, 'tools', 'sf_obsolete.ts'), 'obsolete');

    await cmdUpgrade(
      { subcommand: 'upgrade', force: true, showVersion: false },
      installRoot,
    );

    await expect(readFile(join(installRoot, 'sf-user', 'upgrade_journal.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(installRoot, 'tools', 'sf_obsolete.ts'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const installedManifest = JSON.parse(
      await readFile(join(installRoot, 'specforge-manifest.json'), 'utf8'),
    ) as { schema_version: string; files: Record<string, unknown> };
    expect(installedManifest.schema_version).toBe('1.0');
    expect(Object.keys(installedManifest.files)).toHaveLength(release.files.length);
  });

  it('rolls back earlier replacements when a later current upgrade mutation fails', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'specforge-current-upgrade-failure-'));
    tempRoots.push(tempRoot);
    const installRoot = join(tempRoot, 'opencode');
    const release = await loadVerifiedReleaseInstallSet({
      candidateRoot,
      expectedReleaseId: 'specforge-v6-current',
    });
    expect(release.ok, release.errors.join('\n')).toBe(true);
    expect(release.files.length).toBeGreaterThan(1);

    await cmdInstall(
      { subcommand: 'install', force: true, showVersion: false },
      installRoot,
    );

    const restoredRelativePath = release.files[0].targetPath;
    const blockedRelativePath = release.files[1].targetPath;
    const restoredPath = join(installRoot, ...restoredRelativePath.split('/'));
    const blockedPath = join(installRoot, ...blockedRelativePath.split('/'));
    await writeFile(restoredPath, 'user-local-state');
    await rm(blockedPath, { force: true });
    await mkdir(blockedPath);

    await expect(cmdUpgrade(
      { subcommand: 'upgrade', force: true, showVersion: false },
      installRoot,
    )).rejects.toBeDefined();

    expect(await readFile(restoredPath, 'utf8')).toBe('user-local-state');
    expect((await stat(blockedPath)).isDirectory()).toBe(true);
    const journal = JSON.parse(
      await readFile(join(installRoot, 'sf-user', 'upgrade_journal.json'), 'utf8'),
    ) as { schema_version: string; status: string };
    expect(journal.schema_version).toBe('1.0');
    expect(journal.status).toBe('rolled_back');

    await rm(blockedPath, { recursive: true, force: true });
    await cmdUpgrade(
      { subcommand: 'upgrade', force: true, showVersion: false },
      installRoot,
    );
    await expect(readFile(join(installRoot, 'sf-user', 'upgrade_journal.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
