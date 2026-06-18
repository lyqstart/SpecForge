import { afterEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { posixToNative, resolveUserLevelDirectory, toPosix } from '../../scripts/lib/paths';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env.OPENCODE_CONFIG_DIR = originalEnv.OPENCODE_CONFIG_DIR;
  process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
});

describe('Installer reconcile path helpers', () => {
  it('uses OPENCODE_CONFIG_DIR as the highest-priority userlevel directory override', () => {
    const override = path.join(os.tmpdir(), 'specforge-opencode-config-dir');
    process.env.OPENCODE_CONFIG_DIR = override;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveUserLevelDirectory()).toBe(path.resolve(path.normalize(override)));
  });

  it('uses XDG_CONFIG_HOME/opencode when OPENCODE_CONFIG_DIR is not set', () => {
    const xdg = path.join(os.tmpdir(), 'specforge-xdg-config-home');
    delete process.env.OPENCODE_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = xdg;

    expect(resolveUserLevelDirectory()).toBe(path.join(xdg, 'opencode'));
  });

  it('falls back to ~/.config/opencode when no override is set', () => {
    delete process.env.OPENCODE_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;

    expect(resolveUserLevelDirectory()).toBe(path.join(os.homedir(), '.config', 'opencode'));
  });

  it('converts portable POSIX paths and native paths explicitly', () => {
    expect(toPosix('setup\\userlevel-opencode\\tools')).toBe('setup/userlevel-opencode/tools');
    expect(posixToNative('setup/userlevel-opencode/tools')).toBe(path.join('setup', 'userlevel-opencode', 'tools'));
  });
});
