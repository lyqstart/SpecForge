import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('current release runtime version boundary', () => {
  it('uses the version-unification authority in both executable entries', async () => {
    const [help, daemon, daemonManifestText] = await Promise.all([
      readFile(resolve(ROOT, 'packages/cli/src/commands/help.ts'), 'utf8'),
      readFile(resolve(ROOT, 'packages/daemon-core/src/specforged.ts'), 'utf8'),
      readFile(resolve(ROOT, 'packages/daemon-core/package.json'), 'utf8'),
    ]);
    const daemonManifest = JSON.parse(daemonManifestText) as {
      dependencies?: Record<string, string>;
    };

    expect(help).not.toContain("version: '0.1.0'");
    expect(help).not.toContain('SpecForge CLI v0.1.0');
    expect(daemon).toContain("import { getCodeVersion } from '@specforge/version-unification'");
    expect(daemon).not.toContain("SPECFORGED_VERSION = '1.0.0'");
    expect(daemonManifest.dependencies?.['@specforge/version-unification']).toBe('workspace:*');
  });

  it('supports build-time injection while retaining repository-root development fallback', async () => {
    const source = await readFile(
      resolve(ROOT, 'packages/version-unification/src/code-version.ts'),
      'utf8',
    );

    expect(source).toContain('__SPECFORGE_BUILD_VERSION__');
    expect(source).toContain('findRootDir()');
  });
});
