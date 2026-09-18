import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';

import {
  resolveSpecForgeInstallRoot,
  resolveSpecForgePrivateRoot,
  resolveUserLevelDirectory,
} from '../lib/paths';

const originalOpenCodeConfig = process.env.OPENCODE_CONFIG_DIR;
const originalXdg = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalOpenCodeConfig === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfig;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
});

describe('current release installer root', () => {
  it('keeps the OpenCode integration root separate', () => {
    const openCodeRoot = path.resolve('C:/tmp/specforge-opencode-boundary');
    process.env.OPENCODE_CONFIG_DIR = openCodeRoot;

    expect(resolveUserLevelDirectory()).toBe(openCodeRoot);
    expect(resolveSpecForgeInstallRoot()).toBe(openCodeRoot);
    expect(resolveSpecForgePrivateRoot()).toBe(path.join(openCodeRoot, 'sf-user'));
  });

  it('uses XDG_CONFIG_HOME for the OpenCode root and keeps private assets under sf-user', () => {
    const xdg = path.resolve('C:/tmp/specforge-xdg-boundary');
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = xdg;

    expect(resolveSpecForgeInstallRoot()).toBe(path.join(xdg, 'opencode'));
    expect(resolveSpecForgePrivateRoot()).toBe(path.join(xdg, 'opencode', 'sf-user'));
  });
});
