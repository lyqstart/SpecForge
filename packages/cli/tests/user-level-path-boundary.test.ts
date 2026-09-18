import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDefaultHandshakePath, getRuntimeDirPath } from '../src/auth/AuthManager';
import {
  resolveOpenCodeConfigRoot,
  resolveSpecForgeManifestPath,
  resolveSpecForgeUserRoot,
  resolveSpecForgeUserPath,
} from '@specforge/types/user-level-paths';

const originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalOpenCodeConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
  }
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }
});

describe('CLI user-level path boundary', () => {
  it('routes CLI runtime and handshake under <OpenCode config>/sf-user', () => {
    const configRoot = path.resolve(process.cwd(), '.tmp-user-level-path-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    delete process.env.XDG_CONFIG_HOME;
    const userRoot = path.join(configRoot, 'sf-user');

    expect(resolveOpenCodeConfigRoot()).toBe(configRoot);
    expect(resolveSpecForgeUserRoot()).toBe(userRoot);
    expect(getRuntimeDirPath()).toBe(path.join(userRoot, 'runtime'));
    expect(getDefaultHandshakePath()).toBe(
      path.join(userRoot, 'runtime', 'handshake.json'),
    );
    expect(resolveSpecForgeUserPath('logs')).toBe(path.join(userRoot, 'logs'));
  });

  it('keeps the installer manifest at the OpenCode config root', () => {
    const configRoot = path.resolve(process.cwd(), '.tmp-user-level-manifest-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveSpecForgeManifestPath()).toBe(
      path.join(configRoot, 'specforge-manifest.json'),
    );
  });
});
