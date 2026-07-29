import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDefaultHandshakePath, getRuntimeDirPath } from '../src/auth/AuthManager';
import {
  resolveSpecForgeManifestPath,
  resolveSpecForgeUserRoot,
  resolveSpecForgeUserPath,
} from '@specforge/types/user-level-paths';

const originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;

afterEach(() => {
  if (originalOpenCodeConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
  }
});

describe('CLI user-level path boundary', () => {
  it('routes CLI runtime and handshake under sf-user', () => {
    const configRoot = path.join(process.cwd(), '.tmp-user-level-path-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    expect(resolveSpecForgeUserRoot()).toBe(path.join(configRoot, 'sf-user'));
    expect(getRuntimeDirPath()).toBe(path.join(configRoot, 'sf-user', 'runtime'));
    expect(getDefaultHandshakePath()).toBe(
      path.join(configRoot, 'sf-user', 'runtime', 'handshake.json'),
    );
    expect(resolveSpecForgeUserPath('logs')).toBe(path.join(configRoot, 'sf-user', 'logs'));
  });

  it('keeps the manifest outside sf-user', () => {
    const configRoot = path.join(process.cwd(), '.tmp-user-level-manifest-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    expect(resolveSpecForgeManifestPath()).toBe(
      path.join(configRoot, 'specforge-manifest.json'),
    );
  });
});
