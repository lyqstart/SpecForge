import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyInstallation } from '../../../scripts/lib/verify';

const roots: string[] = [];
const bytes = 'synthetic installed binary';
const entry = {
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: Buffer.byteLength(bytes),
  type: 'runtime',
};
async function fixture(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sf-verify-invalid-'));
  roots.push(root);
  await mkdir(join(root, 'sf-user/bin'), { recursive: true });
  await writeFile(join(root, 'sf-user/bin/specforged.exe'), bytes);
  await writeFile(
    join(root, 'specforge-manifest.json'),
    JSON.stringify({
      schema_version: '1.0',
      shared_version: '1.0.1',
      install_mode: 'user_level',
      installed_at: '2026-11-16T00:00:00.000Z',
      updated_at: '2026-11-16T00:00:00.000Z',
      managed_agents: [],
      managed_agent_hashes: {},
      files,
    })
  );
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('installer verify refuses an incomplete validated manifest', () => {
  for (const [name, value] of Object.entries({
    invalid_hash: { ...entry, sha256: 'invalid' },
    invalid_size: { ...entry, size: -1 },
    invalid_type: { ...entry, type: 'unknown' },
  })) {
    it(`rejects ${name} even when another installed entry is valid`, async () => {
      const root = await fixture({
        'sf-user/bin/specforged.exe': entry,
        'sf-user/bin/omitted.exe': value,
      });
      await expect(verifyInstallation(root)).rejects.toThrow(/Manifest 无效.*条目/);
    });
  }
  it('rejects an entirely filtered manifest instead of passing zero files', async () => {
    const root = await fixture({ 'sf-user/bin/missing.exe': { ...entry, sha256: 'invalid' } });
    await expect(verifyInstallation(root)).rejects.toThrow(/Manifest 无效.*条目/);
  });
  it('rejects an empty manifest instead of passing zero files', async () => {
    await expect(verifyInstallation(await fixture({}))).rejects.toThrow(/Manifest 无效.*空/);
  });
  it('verifies valid installed bytes without treating an older version as corruption', async () => {
    const root = await fixture({ 'sf-user/bin/specforged.exe': entry });
    const result = await verifyInstallation(root);
    expect(result.allMatch).toBe(true);
    expect(result.totalFiles).toBe(1);
    await writeFile(join(root, 'sf-user/bin/specforged.exe'), 'corrupt');
    const changed = await verifyInstallation(root);
    expect(changed.allMatch).toBe(false);
    expect(changed.mismatches).toHaveLength(1);
  });
});
