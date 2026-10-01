import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  posixToNative,
  resolveSpecForgeInstallRoot,
  resolveSpecForgePrivateRoot,
  resolveUserLevelDirectory,
  toPosix,
} from '../../../scripts/lib/paths';

describe('current installer paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses OPENCODE_CONFIG_DIR as the current install root', () => {
    process.env.OPENCODE_CONFIG_DIR = '/custom/opencode/dir';
    process.env.XDG_CONFIG_HOME = '/custom/xdg';

    expect(resolveSpecForgeInstallRoot()).toBe(
      path.resolve(path.normalize('/custom/opencode/dir')),
    );
  });

  it('uses XDG_CONFIG_HOME/opencode when no explicit override exists', () => {
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = '/custom/xdg';

    expect(resolveUserLevelDirectory()).toBe(
      path.join('/custom/xdg', 'opencode'),
    );
  });

  it('defaults to the home OpenCode configuration root', () => {
    delete process.env.OPENCODE_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveUserLevelDirectory()).toBe(
      path.join(os.homedir(), '.config', 'opencode'),
    );
  });

  it('places private SpecForge data below sf-user', () => {
    process.env.OPENCODE_CONFIG_DIR = '/custom/opencode/dir';

    expect(resolveSpecForgePrivateRoot()).toBe(
      path.join(path.resolve('/custom/opencode/dir'), 'sf-user'),
    );
  });

  it('converts POSIX relative paths to native separators', () => {
    expect(posixToNative('tools/lib/file.ts')).toBe(
      ['tools', 'lib', 'file.ts'].join(path.sep),
    );
  });

  it('converts native paths to POSIX separators', () => {
    expect(toPosix('tools\\lib\\file.ts')).toBe('tools/lib/file.ts');
  });
});
