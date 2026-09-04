import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { runDoctorCommand } from '../src/commands/doctor';
import { projectSpecManifest } from '../src/utils/directory-layout';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))
  );
});

describe('current release CLI project layout boundary', () => {
  it('Doctor reads only the current Project Spec manifest and reports schema_version', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-cli-current-project-'));
    temporaryRoots.push(projectDir);
    const currentManifestPath = projectSpecManifest(projectDir);
    await fs.mkdir(path.dirname(currentManifestPath), { recursive: true });
    await fs.writeFile(
      currentManifestPath,
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        project_name: 'current-project',
      }),
      'utf8'
    );

    let stdout = '';
    let stderr = '';
    const exitCode = await runDoctorCommand({
      projectDir,
      userManifestPath: path.join(projectDir, 'user-manifest.json'),
      write: chunk => {
        stdout += chunk;
      },
      writeErr: chunk => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(`project_manifest_path     : ${currentManifestPath}`);
    expect(stdout).toMatch(/schema_version\s+:\s+1\.0/);
    expect(stdout).not.toContain('data_schema_version');
  });

  it('contains no current runtime consumer for the retired CLI project compatibility path', async () => {
    const sourceRoot = path.resolve(import.meta.dirname, '../src');
    const [layoutSource, cliSource, doctorSource] = await Promise.all([
      fs.readFile(path.join(sourceRoot, 'utils/directory-layout.ts'), 'utf8'),
      fs.readFile(path.join(sourceRoot, 'cli.ts'), 'utf8'),
      fs.readFile(path.join(sourceRoot, 'commands/doctor.ts'), 'utf8'),
    ]);

    expect(layoutSource).not.toContain('legacyPaths');
    expect(layoutSource).not.toContain('legacyUserLayoutReadOnly');
    expect(layoutSource).not.toContain('isLegacySpecPath');
    expect(cliSource).not.toContain('StartupCompatibilityChecker');
    expect(cliSource).not.toContain('MigrationRunner');
    expect(cliSource).not.toContain('runStartupCheck');
    expect(doctorSource).not.toContain('data_schema_version');
    expect(doctorSource).not.toContain('LAYOUT.manifest');
    await expect(
      fs.stat(path.join(sourceRoot, 'reporter/version-leak-filter.ts'))
    ).rejects.toThrow();
    await expect(fs.stat(path.join(sourceRoot, 'reporter/index.ts'))).rejects.toThrow();
  });
});
