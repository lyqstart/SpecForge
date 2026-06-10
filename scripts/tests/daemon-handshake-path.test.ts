/**
 * daemon-handshake-path.test.ts
 *
 * Verifies that daemon runtime / handshake paths no longer default to
 * ~/.specforge/runtime/ and instead use the unified OpenCode config root:
 *   $OPENCODE_CONFIG_DIR/sf-user/runtime/ or
 *   $XDG_CONFIG_HOME/opencode/sf-user/runtime/ or
 *   ~/.config/opencode/sf-user/runtime/
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the path resolver from daemon-core
import { PersonalPathResolver, EnterprisePathResolver } from '../../packages/daemon-core/src/daemon/path-resolver';

describe('Daemon handshake path governance', () => {
  let savedOCDir: string | undefined;
  let savedXDG: string | undefined;

  beforeEach(() => {
    savedOCDir = process.env.OPENCODE_CONFIG_DIR;
    savedXDG = process.env.XDG_CONFIG_HOME;
    delete process.env.OPENCODE_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    if (savedOCDir !== undefined) process.env.OPENCODE_CONFIG_DIR = savedOCDir;
    else delete process.env.OPENCODE_CONFIG_DIR;
    if (savedXDG !== undefined) process.env.XDG_CONFIG_HOME = savedXDG;
    else delete process.env.XDG_CONFIG_HOME;
  });

  describe('PersonalPathResolver', () => {
    const resolver = new PersonalPathResolver();

    it('resolveDaemonRuntimeDir should NOT contain ~/.specforge', () => {
      const dir = resolver.resolveDaemonRuntimeDir();
      const posix = dir.replace(/\\/g, '/');
      expect(posix).not.toContain('/.specforge/');
      expect(posix).not.toContain('/.specforge\\');
    });

    it('resolveDaemonRuntimeDir should contain sf-user/runtime', () => {
      const dir = resolver.resolveDaemonRuntimeDir();
      const posix = dir.replace(/\\/g, '/');
      expect(posix).toContain('/sf-user/runtime');
    });

    it('resolveHandshakePath should end with sf-user/runtime/handshake.json', () => {
      const hp = resolver.resolveHandshakePath();
      const posix = hp.replace(/\\/g, '/');
      expect(posix).toMatch(/\/sf-user\/runtime\/handshake\.json$/);
    });

    it('resolveHandshakePath should NOT be under ~/.specforge', () => {
      const hp = resolver.resolveHandshakePath();
      const posix = hp.replace(/\\/g, '/');
      expect(posix).not.toContain('/.specforge/');
    });

    it('should use OPENCODE_CONFIG_DIR when set', () => {
      process.env.OPENCODE_CONFIG_DIR = '/tmp/test-oc-config';
      const freshResolver = new PersonalPathResolver();
      const dir = freshResolver.resolveDaemonRuntimeDir();
      expect(dir).toBe(path.resolve('/tmp/test-oc-config/sf-user/runtime'));
    });

    it('should use XDG_CONFIG_HOME when set', () => {
      process.env.XDG_CONFIG_HOME = '/tmp/test-xdg';
      const freshResolver = new PersonalPathResolver();
      const dir = freshResolver.resolveDaemonRuntimeDir();
      const posix = dir.replace(/\\/g, '/');
      expect(posix).toContain('/test-xdg/opencode/sf-user/runtime');
    });

    it('should fall back to ~/.config/opencode/sf-user/runtime', () => {
      delete process.env.OPENCODE_CONFIG_DIR;
      delete process.env.XDG_CONFIG_HOME;
      const freshResolver = new PersonalPathResolver();
      const dir = freshResolver.resolveDaemonRuntimeDir();
      const posix = dir.replace(/\\/g, '/');
      expect(posix).toContain('/.config/opencode/sf-user/runtime');
    });
  });

  describe('EnterprisePathResolver', () => {
    const resolver = new EnterprisePathResolver();

    it('resolveDaemonRuntimeDir should NOT contain ~/.specforge', () => {
      const dir = resolver.resolveDaemonRuntimeDir();
      const posix = dir.replace(/\\/g, '/');
      expect(posix).not.toContain('/.specforge/');
    });

    it('resolveHandshakePath should NOT be under ~/.specforge', () => {
      const hp = resolver.resolveHandshakePath();
      const posix = hp.replace(/\\/g, '/');
      expect(posix).not.toContain('/.specforge/');
    });
  });
});
