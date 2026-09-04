import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveSpecForgeInstallRoot,
  resolveUserLevelDirectory,
} from '../../../scripts/lib/paths';

const originalOpenCodeConfig = process.env.OPENCODE_CONFIG_DIR;
const originalXdg = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalOpenCodeConfig === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfig;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
});

describe('current release installer root contract', () => {
  it('separates the OpenCode integration root from the SpecForge install root', () => {
    const openCodeRoot = path.resolve('C:/tmp/specforge-opencode-boundary');
    process.env.OPENCODE_CONFIG_DIR = openCodeRoot;

    expect(resolveUserLevelDirectory()).toBe(openCodeRoot);
    expect(resolveSpecForgeInstallRoot()).toBe(path.join(os.homedir(), '.specforge'));
  });

  it('does not let XDG_CONFIG_HOME create an sf-user runtime root', () => {
    process.env.XDG_CONFIG_HOME = path.resolve('C:/tmp/specforge-xdg-boundary');

    expect(resolveSpecForgeInstallRoot()).toBe(path.join(os.homedir(), '.specforge'));
    expect(resolveSpecForgeInstallRoot()).not.toContain('sf-user');
  });

  it('makes the installer consume only the current root without legacy migration branches', () => {
    const installer = fs.readFileSync(
      path.resolve(process.cwd(), '../../scripts/sf-installer.ts'),
      'utf8',
    );
    const registry = fs.readFileSync(
      path.resolve(process.cwd(), '../../scripts/lib/registry.ts'),
      'utf8',
    );

    expect(installer).toContain('resolveSpecForgeInstallRoot');
    expect(installer).not.toContain('const userLevelDir = resolveUserLevelDirectory()');
    expect(installer).not.toContain('getLegacySpecForgeDir');
    expect(installer).not.toContain('runMigrateManifestCommand');
    expect(installer).not.toContain('migrate-manifest');
    expect(installer).not.toContain('mergeOpenCodeJsonUserLevel');
    expect(installer).not.toContain('removeSfAgentsFromOpenCodeJson');
    expect(installer).not.toContain('backupFile(userLevelDir, "opencode.json")');
    expect(registry).toContain('integrations/opencode/sf_specforge.ts');
    expect(registry).not.toMatch(/path:\s*["']plugins\/sf_specforge\.ts/);
    expect(registry).not.toMatch(/path:\s*["']sf-user\//);
  });

  it('keeps current installer state independent from removed legacy compatibility adapters', () => {
    const repositoryRoot = path.resolve(process.cwd(), '../..');
    const stateSources = [
      path.join(repositoryRoot, 'scripts/lib/state.ts'),
      path.join(repositoryRoot, 'setup/userlevel-scripts-lib/state.ts'),
    ];

    for (const stateSourcePath of stateSources) {
      const stateSource = fs.readFileSync(stateSourcePath, 'utf8');
      expect(stateSource).toContain('export function inferComponentTypeFromPath');
      expect(stateSource).not.toContain('legacy_manifest_adapter');
      expect(stateSource).not.toMatch(/\binferComponentType\s*\(/);
    }

    const removedCompatibilityFiles = [
      'scripts/lib/legacy_manifest_adapter.ts',
      'setup/userlevel-scripts-lib/legacy_manifest_adapter.ts',
      'scripts/lib/compatibility.ts',
      'setup/userlevel-scripts-lib/compatibility.ts',
    ];
    for (const relativePath of removedCompatibilityFiles) {
      expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(false);
    }

    const currentUtilitySources = [
      'setup/userlevel-opencode/tools/lib/utils.ts',
      'packages/daemon-core/src/tools/lib/utils.ts',
    ];
    for (const relativePath of currentUtilitySources) {
      const utilitySource = fs.readFileSync(
        path.join(repositoryRoot, relativePath),
        'utf8',
      );
      expect(utilitySource).not.toContain('sf-user');
      expect(utilitySource).not.toContain('compatibility.ts');
      expect(utilitySource).not.toContain('checkCompatibilityAtEntry');
    }
  });

  it('keeps only the current user-level installer manifest contract', () => {
    const repositoryRoot = path.resolve(process.cwd(), '../..');
    for (const relativePath of [
      'scripts/lib/types.ts',
      'setup/userlevel-scripts-lib/types.ts',
    ]) {
      const source = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
      expect(source).toMatch(/interface UserLevelManifest[\s\S]*install_mode: "user_level"/);
      expect(source).not.toContain('interface ProjectLevelManifest');
      expect(source).not.toContain('interface RuntimeManifest');
      expect(source).not.toContain('"user_level" | "project_level"');
    }

    for (const relativePath of [
      'scripts/lib/runtime_manifest.ts',
      'setup/userlevel-scripts-lib/runtime_manifest.ts',
    ]) {
      expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(false);
    }

    const verifierAgent = fs.readFileSync(
      path.join(repositoryRoot, 'setup/userlevel-opencode/agents/sf-verifier.md'),
      'utf8',
    );
    expect(verifierAgent).toContain('.specforge/project/spec_manifest.json');
    expect(verifierAgent).not.toContain('.specforge/runtime-manifest.json');
  });
});
