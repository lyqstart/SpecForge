import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { runDoctorCommand } from '../../src/commands/doctor';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))
  );
});

async function makeProject(manifest?: unknown): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-doctor-current-'));
  temporaryRoots.push(projectDir);
  if (manifest !== undefined) {
    const manifestPath = path.join(projectDir, '.specforge', 'project', 'spec_manifest.json');
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  }
  return projectDir;
}

async function run(projectDir: string): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await runDoctorCommand({
    projectDir,
    userManifestPath: path.join(projectDir, 'user-manifest.json'),
    write: chunk => {
      stdout += chunk;
    },
    writeErr: chunk => {
      stderr += chunk;
    },
  });
  return { code, stdout, stderr };
}

describe('runDoctorCommand current project contract', () => {
  it('reports a valid current Project Spec manifest', async () => {
    const projectDir = await makeProject({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
    });

    const result = await run(projectDir);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/code_version\s+:\s+\S+/);
    expect(result.stdout).toMatch(/schema_version\s+:\s+1\.0/);
    expect(result.stdout).toMatch(/project_status\s+:\s+CURRENT/);
    expect(result.stdout).toContain(
      path.join(projectDir, '.specforge', 'project', 'spec_manifest.json')
    );
  });

  it('reports an uninitialized current project without creating files', async () => {
    const projectDir = await makeProject();

    const result = await run(projectDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/schema_version\s+:\s+N\/A/);
    expect(result.stdout).toMatch(
      /project_status\s+:\s+PROJECT_NOT_INITIALIZED_OR_INVALID/
    );
    await expect(fs.stat(path.join(projectDir, '.specforge'))).rejects.toThrow();
  });

  it('does not accept a manifest without the current schema_version field', async () => {
    const projectDir = await makeProject({ data_schema_version: 999 });

    const result = await run(projectDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/schema_version\s+:\s+N\/A/);
    expect(result.stdout).toMatch(
      /project_status\s+:\s+PROJECT_NOT_INITIALIZED_OR_INVALID/
    );
  });
});
