import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadVerifiedReleaseInstallSet,
  produceReleaseManifest,
  produceRuntimeEntrySurfaceReport,
} from '../../../scripts/lib/release-manifest-producer';
import type { ComponentEntry } from '../../../scripts/lib/types';

const tempRoots: string[] = [];

const registry: ComponentEntry[] = [
  {
    path: 'sf-user/bin/specforge',
    type: 'runtime',
    sourcePath: 'release/bin/specforge',
    platformExecutable: true,
  },
  {
    path: 'sf-user/bin/specforged',
    type: 'runtime',
    sourcePath: 'release/bin/specforged',
    platformExecutable: true,
  },
  {
    path: 'plugins/sf_specforge.ts',
    type: 'plugin',
    sourcePath: 'setup/userlevel-opencode/plugins/sf_specforge.ts',
  },
  {
    path: 'sf-user/lib/sf_plugin_client.ts',
    type: 'tool_lib',
    sourcePath: 'setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts',
  },
  { path: 'AGENTS.md', type: 'config' },
  {
    path: 'sf-user/workflows/builtin/feature_spec.json',
    type: 'workflow',
    sourcePath: 'configs/workflows/builtin/feature_spec.json',
  },
];

async function candidate(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-release-manifest-'));
  tempRoots.push(root);
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ version: '6.0.0' }),
    'packages/core/package.json': JSON.stringify({
      name: '@specforge/core',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    }),
    'packages/core/dist/index.js': 'export const core = true;',
    'packages/core/dist/index.d.ts': 'export declare const core: boolean;',
    'packages/daemon-core/package.json': JSON.stringify({
      name: '@specforge/daemon-core',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    }),
    'packages/daemon-core/dist/index.js': 'export class Daemon {}',
    'packages/daemon-core/dist/index.d.ts': 'export declare class Daemon {}',
    'release/bin/specforge.exe': 'specforge-binary',
    'release/bin/specforged.exe': 'specforged-binary',
    'setup/userlevel-opencode/plugins/sf_specforge.ts': 'export default async function plugin() {}',
    'setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts': 'export function client() {}',
    'setup/userlevel-opencode/AGENTS.md': 'current config',
    'configs/workflows/builtin/feature_spec.json': '{"id":"feature_spec"}',
    'scripts/sf-installer.ts': 'export async function install() {}',
    'packages/daemon-core/src/daemon/HandshakeManager.ts': 'export class HandshakeManager {}',
  };
  await Promise.all(Object.entries(files).map(async ([path, content]) => {
    const absolute = join(root, ...path.split('/'));
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release manifest and runtime entry producers', () => {
  it('writes a deterministic hash/size manifest from package builds and installer-owned assets', async () => {
    const root = await candidate();
    const result = await produceReleaseManifest({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
      platform: 'win32',
      registry,
    });

    expect(result.errors).toEqual([]);
    expect(result.document.complete).toBe(true);
    expect(result.document.version).toBe('6.0.0');
    expect(result.document.artifacts.map((artifact) => artifact.id)).toEqual([
      '@specforge/core',
      '@specforge/daemon-core',
      'plugin:sf_specforge',
      'release:installer',
      'runtime:current-config',
      'runtime:specforge',
      'runtime:specforged',
      'thin-plugin:daemon-start',
      'thin-plugin:event-reporting',
      'thin-plugin:recovery-display',
      'workflow:feature_spec',
    ]);
    expect(result.document.artifacts.every((artifact) => artifact.sha256.length === 64)).toBe(true);
    expect(result.document.artifacts.every((artifact) => artifact.size > 0)).toBe(true);
    expect(result.document.installFiles.map((file) => file.targetPath)).toEqual([
      'AGENTS.md',
      'plugins/sf_specforge.ts',
      'sf-user/bin/specforge.exe',
      'sf-user/bin/specforged.exe',
      'sf-user/lib/sf_plugin_client.ts',
      'sf-user/workflows/builtin/feature_spec.json',
    ]);
    expect(result.document.installFiles.every((file) => file.sha256.length === 64)).toBe(true);
    expect(result.report.complete).toBe(true);
    expect(result.report.items.some((item) => item.id === 'release:release-manifest')).toBe(true);
  });

  it('loads the manifest-owned physical install set and rejects source drift before installation', async () => {
    const root = await candidate();
    await produceReleaseManifest({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
      platform: 'win32',
      registry,
    });

    const verified = await loadVerifiedReleaseInstallSet({
      candidateRoot: root,
      expectedReleaseId: 'specforge-v6-current',
    });
    expect(verified.ok).toBe(true);
    expect(verified.errors).toEqual([]);
    expect(verified.version).toBe('6.0.0');
    expect(verified.files.map((file) => file.targetPath)).toEqual([
      'AGENTS.md',
      'plugins/sf_specforge.ts',
      'sf-user/bin/specforge.exe',
      'sf-user/bin/specforged.exe',
      'sf-user/lib/sf_plugin_client.ts',
      'sf-user/workflows/builtin/feature_spec.json',
    ]);

    await writeFile(join(root, 'setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts'), 'tampered');
    const drifted = await loadVerifiedReleaseInstallSet({
      candidateRoot: root,
      expectedReleaseId: 'specforge-v6-current',
    });
    expect(drifted.ok).toBe(false);
    expect(drifted.errors).toContain(
      'release_install_set:hash_mismatch:sf-user/lib/sf_plugin_client.ts',
    );
  });

  it('fails closed and does not claim a complete manifest when a registry source is missing', async () => {
    const root = await candidate();
    await rm(join(root, 'release/bin/specforged.exe'));

    const result = await produceReleaseManifest({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
      platform: 'win32',
      registry,
    });

    expect(result.document.complete).toBe(false);
    expect(result.report.complete).toBe(false);
    expect(result.errors).toContain('release_manifest:source_missing:release/bin/specforged.exe');
  });

  it('binds all current runtime entries to manifest artifacts or the real handshake producer', async () => {
    const root = await candidate();
    const manifest = await produceReleaseManifest({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
      platform: 'win32',
      registry,
    });
    const runtime = await produceRuntimeEntrySurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(manifest.errors).toEqual([]);
    expect(runtime.errors).toEqual([]);
    expect(runtime.report.items.map((item) => item.id)).toEqual([
      'plugin:sf_specforge',
      'release:installer',
      'release:release-manifest',
      'runtime:handshake',
      'runtime:specforge',
      'runtime:specforged',
      'thin-plugin:daemon-start',
      'thin-plugin:event-reporting',
      'thin-plugin:recovery-display',
    ]);
  });

  it('fails runtime entry evidence when an artifact no longer matches the release manifest', async () => {
    const root = await candidate();
    await produceReleaseManifest({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
      platform: 'win32',
      registry,
    });
    await writeFile(join(root, 'release/bin/specforged.exe'), 'tampered');

    const runtime = await produceRuntimeEntrySurfaceReport({
      candidateRoot: root,
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-1',
    });

    expect(runtime.report.complete).toBe(false);
    expect(runtime.errors).toContain('runtime_entry:hash_mismatch:runtime:specforged');
  });
});
