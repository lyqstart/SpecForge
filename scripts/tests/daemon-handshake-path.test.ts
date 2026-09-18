/**
 * Current user-level Daemon handshake path governance.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  EnterprisePathResolver,
  PersonalPathResolver,
} from '../../packages/daemon-core/src/daemon/path-resolver';

describe('Daemon handshake path governance', () => {
  let savedOpenCodeConfigDir: string | undefined;
  let savedXdgConfigHome: string | undefined;

  beforeEach(() => {
    savedOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
    savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    if (savedOpenCodeConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = savedOpenCodeConfigDir;
    if (savedXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdgConfigHome;
  });

  it.each([
    ['personal', () => new PersonalPathResolver()],
    ['enterprise', () => new EnterprisePathResolver()],
  ])('%s mode uses the single current SpecForge handshake path', (_mode, createResolver) => {
    const configRoot = path.join(os.tmpdir(), 'specforge-opencode-config');
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    delete process.env.XDG_CONFIG_HOME;

    const resolver = createResolver();
    const runtimeDir = path.join(configRoot, 'sf-user', 'runtime');

    expect(resolver.resolveDaemonRuntimeDir()).toBe(runtimeDir);
    expect(resolver.resolveHandshakePath()).toBe(
      path.join(runtimeDir, 'handshake.json'),
    );
  });

  it('honors OPENCODE_CONFIG_DIR ahead of XDG_CONFIG_HOME', () => {
    const configRoot = path.join(os.tmpdir(), 'alternate-opencode-config');
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    process.env.XDG_CONFIG_HOME = path.join(os.tmpdir(), 'alternate-xdg-config');

    const resolver = new PersonalPathResolver();
    expect(resolver.resolveHandshakePath()).toBe(
      path.join(configRoot, 'sf-user', 'runtime', 'handshake.json'),
    );
  });
});
