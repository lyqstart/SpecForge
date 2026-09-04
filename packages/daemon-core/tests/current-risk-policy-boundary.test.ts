import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LAYOUT } from '@specforge/types/directory-layout';
import { ensureProjectInit } from '../src/tools/lib/sf_project_init_core';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const temporaryRoots: string[] = [];

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('current risk-policy boundary', () => {
  it('does not expose a configuration surface with no production consumer', async () => {
    expect('riskPolicy' in LAYOUT.configFiles).toBe(false);

    const userlevelLayout = await readFile(
      join(repositoryRoot, 'setup', 'userlevel-opencode', 'AGENTS.md'),
      'utf8',
    );
    expect(userlevelLayout).not.toContain('configFiles.riskPolicy');
    expect(userlevelLayout).not.toContain('config/risk_policy.json');
  });

  it('does not create an inert risk policy during current project bootstrap', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'specforge-current-risk-policy-'));
    temporaryRoots.push(projectRoot);

    const result = await ensureProjectInit(projectRoot, 'risk-policy-boundary', {
      ensureHostProfile: async () => undefined,
    });

    expect(result.success).toBe(true);
    expect(await exists(join(projectRoot, '.specforge', 'config', 'risk_policy.json'))).toBe(false);
  });
});
