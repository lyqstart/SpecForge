import * as path from 'node:path';
import * as os from 'node:os';
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
  it('routes CLI runtime and handshake under the current SpecForge user root', () => {
    const configRoot = path.join(process.cwd(), '.tmp-user-level-path-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    const userRoot = path.join(os.homedir(), '.specforge');

    expect(resolveSpecForgeUserRoot()).toBe(userRoot);
    expect(getRuntimeDirPath()).toBe(path.join(userRoot, 'runtime'));
    expect(getDefaultHandshakePath()).toBe(
      path.join(userRoot, 'runtime', 'daemon.sock.json'),
    );
    expect(resolveSpecForgeUserPath('logs')).toBe(path.join(userRoot, 'logs'));
  });

  it('keeps the manifest inside the current SpecForge user root', () => {
    const configRoot = path.join(process.cwd(), '.tmp-user-level-manifest-boundary');
    process.env.OPENCODE_CONFIG_DIR = configRoot;

    expect(resolveSpecForgeManifestPath()).toBe(
      path.join(os.homedir(), '.specforge', 'specforge-manifest.json'),
    );
  });
});
