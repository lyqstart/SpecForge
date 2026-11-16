import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { cmdInstall, cmdUpgrade } from '../../../scripts/sf-installer';
import { buildUserManifest } from '../../../scripts/lib/manifest';
import { loadVerifiedReleaseInstallSet } from '../../../scripts/lib/release-manifest-producer';

const candidateRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
const options = { subcommand: 'upgrade' as const, force: false, showVersion: false };
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('installer target integrity against verified release bytes', () => {
  for (const defect of ['corrupt', 'same_size_corrupt', 'missing'] as const) {
    it(`repairs ${defect} unchanged-release target without laundering its manifest`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'sf-target-integrity-'));
      roots.push(root);
      const release = await loadVerifiedReleaseInstallSet({
        candidateRoot,
        expectedReleaseId: 'specforge-current',
      });
      expect(release.ok, release.errors.join('\n')).toBe(true);
      await cmdInstall({ ...options, subcommand: 'install' }, root);
      const entry = release.files.find((file) => file.type === 'agent')!;
      expect(entry).toBeDefined();
      const target = join(root, entry.targetPath);
      if (defect === 'same_size_corrupt') {
        const bytes = await readFile(target);
        bytes[0] ^= 1;
        await writeFile(target, bytes);
      } else if (defect === 'corrupt') await writeFile(target, 'corrupted managed bytes');
      else await rm(target);
      await cmdUpgrade(options, root);
      const manifest = JSON.parse(await readFile(join(root, 'specforge-manifest.json'), 'utf8'));
      expect(Object.keys(manifest.files).sort()).toEqual(
        release.files.map((file) => file.targetPath).sort()
      );
      for (const file of release.files) {
        const bytes = await readFile(join(root, file.targetPath));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
        expect(manifest.files[file.targetPath]).toEqual({
          sha256: file.sha256,
          size: file.size,
          type: file.type,
        });
      }
    }, 30_000);
  }

  for (const defect of ['corrupt', 'same_size_corrupt', 'missing'] as const) {
    it(`refuses manifest creation for a ${defect} target`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'sf-manifest-integrity-'));
      roots.push(root);
      const release = await loadVerifiedReleaseInstallSet({
        candidateRoot,
        expectedReleaseId: 'specforge-current',
      });
      expect(release.ok, release.errors.join('\n')).toBe(true);
      await cmdInstall({ ...options, subcommand: 'install' }, root);
      const prior = await readFile(join(root, 'specforge-manifest.json'));
      const entry = release.files.find((file) => file.type === 'agent')!;
      if (defect === 'same_size_corrupt') {
        const target = join(root, entry.targetPath);
        const bytes = await readFile(target);
        bytes[0] ^= 1;
        await writeFile(target, bytes);
      } else if (defect === 'corrupt')
        await writeFile(join(root, entry.targetPath), 'different bytes');
      else await rm(join(root, entry.targetPath));
      await expect(
        buildUserManifest(root, {}, release.version, release.files)
      ).rejects.toBeDefined();
      expect(await readFile(join(root, 'specforge-manifest.json'))).toEqual(prior);
    }, 30_000);
  }
});
