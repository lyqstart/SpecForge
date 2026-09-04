import { afterEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  resolveSpecForgeInstallRoot,
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
    expect(resolveSpecForgeInstallRoot()).toBe(path.join(os.homedir(), '.specforge'));
  });

  it('does not let XDG_CONFIG_HOME redirect SpecForge runtime assets', () => {
    process.env.XDG_CONFIG_HOME = path.resolve('C:/tmp/specforge-xdg-boundary');

    expect(resolveSpecForgeInstallRoot()).toBe(path.join(os.homedir(), '.specforge'));
    expect(resolveSpecForgeInstallRoot()).not.toContain('sf-user');
  });
});
