import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseRuntimeArtifacts,
  getReleaseRuntimeArtifactPlan,
} from '../../../scripts/lib/release-runtime-artifact-producer';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release runtime artifact producer', () => {
  it('uses canonical platform executable paths for the CLI and daemon', () => {
    expect(getReleaseRuntimeArtifactPlan('win32')).toEqual([
      {
        id: 'runtime:specforge',
        entryPoint: 'packages/cli/src/cli.ts',
        outputPath: 'release/bin/specforge.exe',
      },
      {
        id: 'runtime:specforged',
        entryPoint: 'packages/daemon-core/src/specforged.ts',
        outputPath: 'release/bin/specforged.exe',
      },
    ]);
  });

  it('fails closed when a compile command reports success without an artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'specforge-runtime-producer-'));
    tempRoots.push(root);
    await mkdir(join(root, 'packages/cli/src'), { recursive: true });
    await mkdir(join(root, 'packages/daemon-core/src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '6.0.0-test' }));
    await writeFile(join(root, 'packages/cli/src/cli.ts'), 'cli entry');
    await writeFile(join(root, 'packages/daemon-core/src/specforged.ts'), 'daemon entry');

    await expect(buildReleaseRuntimeArtifacts({
      candidateRoot: root,
      platform: 'win32',
      bunExecutable: 'bun-test',
      runCompile: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    })).rejects.toThrow('RUNTIME_ARTIFACT_MISSING');
  });

  it('returns hash-bound artifacts after both compile outputs exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'specforge-runtime-producer-'));
    tempRoots.push(root);
    await mkdir(join(root, 'packages/cli/src'), { recursive: true });
    await mkdir(join(root, 'packages/daemon-core/src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '6.0.0-test' }));
    await writeFile(join(root, 'packages/cli/src/cli.ts'), 'cli entry');
    await writeFile(join(root, 'packages/daemon-core/src/specforged.ts'), 'daemon entry');

    const result = await buildReleaseRuntimeArtifacts({
      candidateRoot: root,
      platform: 'win32',
      bunExecutable: 'bun-test',
      runCompile: async ({ outputPath, id, version }) => {
        expect(version).toBe('6.0.0-test');
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `compiled:${id}`);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(result.map(({ id, path, sha256 }) => ({ id, path, sha256Length: sha256.length })))
      .toEqual([
        { id: 'runtime:specforge', path: 'release/bin/specforge.exe', sha256Length: 64 },
        { id: 'runtime:specforged', path: 'release/bin/specforged.exe', sha256Length: 64 },
      ]);
    expect(await readFile(join(root, 'release/bin/specforged.exe'), 'utf8'))
      .toBe('compiled:runtime:specforged');
  });
});
