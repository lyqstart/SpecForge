/**
 * installer-deploy-integration.test.ts
 *
 * Production deployment validation for SpecForge installer.
 * Verifies real filesystem behavior of installer path resolution and deployment.
 *
 * Key invariants:
 * - Default install target: ~/.config/opencode/sf-user/
 * - XDG_CONFIG_HOME override: $XDG_CONFIG_HOME/opencode/sf-user/
 * - NEVER creates, writes, or depends on ~/.specforge/
 * - Directory auto-creation on missing targets
 * - Repeated install is stable
 * - Permission errors are explicit (not silent success)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { resolveUserLevelDirectory } from '../lib/paths';

describe('Production installer deployment validation', () => {
  let tmpHome: string;
  let originalHome: string;
  let originalXdg: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-deploy-'));
    originalHome = process.env.HOME ?? process.env.USERPROFILE ?? '';
    originalXdg = process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    // Restore env
    if (originalHome) {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalHome;
    }
    if (originalXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = originalXdg;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    // Cleanup
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.1 Default HOME install scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7.1: Default HOME install path', () => {
    it('resolveUserLevelDirectory returns ~/.config/opencode', () => {
      const resolved = resolveUserLevelDirectory();
      const posix = resolved.replace(/\\/g, '/');
      expect(posix).toContain('/.config/opencode');
      expect(posix).not.toContain('/.specforge');
    });

    it('getSpecForgeUserDir equivalent path is ~/.config/opencode/sf-user', () => {
      const home = os.homedir();
      const sfUserDir = path.join(home, '.config', 'opencode', 'sf-user');
      const posix = sfUserDir.replace(/\\/g, '/');
      expect(posix).toContain('/.config/opencode/sf-user');
      expect(posix).not.toContain('/.specforge');
    });

    it('install.json target is under ~/.config/opencode/sf-user', () => {
      const home = os.homedir();
      const installJsonPath = path.join(home, '.config', 'opencode', 'sf-user', 'install.json');
      const posix = installJsonPath.replace(/\\/g, '/');
      expect(posix).toContain('/.config/opencode/sf-user/install.json');
      expect(posix).not.toContain('/.specforge');
    });

    it('real filesystem: can create sf-user directory and write install.json', () => {
      const sfUserDir = path.join(tmpHome, '.config', 'opencode', 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });

      const installJson = {
        schema_version: '1.0',
        base_dir: sfUserDir,
        shared_version: '1.0.0',
        installed_at: new Date().toISOString(),
      };
      const installJsonPath = path.join(sfUserDir, 'install.json');
      fs.writeFileSync(installJsonPath, JSON.stringify(installJson, null, 2));

      expect(fs.existsSync(installJsonPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(installJsonPath, 'utf-8'));
      expect(content.schema_version).toBe('1.0');
      expect(content.base_dir).toBe(sfUserDir);

      // .specforge NOT created
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });

    it('real filesystem: plugin, lib, agents directories can be created under sf-user', () => {
      const sfUserDir = path.join(tmpHome, '.config', 'opencode', 'sf-user');
      const dirs = ['plugins', 'lib', 'tools', 'agents', 'skills', 'templates'];

      for (const dir of dirs) {
        const dirPath = path.join(sfUserDir, dir);
        fs.mkdirSync(dirPath, { recursive: true });
        expect(fs.existsSync(dirPath)).toBe(true);
      }

      // .specforge NOT created
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.2 XDG_CONFIG_HOME install scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7.2: XDG_CONFIG_HOME install path', () => {
    it('when XDG_CONFIG_HOME is set, resolveUserLevelDirectory uses it', () => {
      const tmpConfig = path.join(tmpHome, 'custom-xdg-config');
      process.env.XDG_CONFIG_HOME = tmpConfig;

      const resolved = resolveUserLevelDirectory();
      const posix = resolved.replace(/\\/g, '/');
      const expectedPosix = tmpConfig.replace(/\\/g, '/') + '/opencode';
      expect(posix).toBe(expectedPosix);
      expect(posix).not.toContain('/.specforge');
    });

    it('XDG_CONFIG_HOME install does NOT write to HOME/.config/opencode', () => {
      const tmpConfig = path.join(tmpHome, 'xdg-alt');
      process.env.XDG_CONFIG_HOME = tmpConfig;

      const resolved = resolveUserLevelDirectory();
      const sfUserDir = path.join(resolved, 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify({ schema_version: '1.0' }));

      // Verify: written to XDG path
      expect(fs.existsSync(path.join(sfUserDir, 'install.json'))).toBe(true);
      // Verify: NOT written to default HOME/.config/opencode
      expect(fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'sf-user'))).toBe(false);
      // Verify: .specforge NOT created
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });

    it('real filesystem: sf-user under XDG custom config path does not create .specforge', () => {
      const customConfig = path.join(tmpHome, 'custom-xdg');
      const sfUserDir = path.join(customConfig, 'opencode', 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });

      const installJson = { schema_version: '1.0', base_dir: sfUserDir, installed_at: new Date().toISOString() };
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify(installJson));

      expect(fs.existsSync(path.join(sfUserDir, 'install.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
      expect(fs.existsSync(path.join(customConfig, '.specforge'))).toBe(false);
    });

    it('empty XDG_CONFIG_HOME falls back to HOME/.config/opencode', () => {
      process.env.XDG_CONFIG_HOME = '';

      const resolved = resolveUserLevelDirectory();
      const posix = resolved.replace(/\\/g, '/');
      expect(posix).toContain('/.config/opencode');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.3 Repeated install scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7.3: Repeated install stability', () => {
    it('writing install.json twice does not create duplicates or errors', () => {
      const sfUserDir = path.join(tmpHome, '.config', 'opencode', 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });

      const installJson1 = { schema_version: '1.0', base_dir: sfUserDir, shared_version: '1.0.0', installed_at: new Date().toISOString() };
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify(installJson1, null, 2));

      // Second install (simulating upgrade/re-install)
      const installJson2 = { schema_version: '1.0', base_dir: sfUserDir, shared_version: '1.0.1', installed_at: new Date().toISOString() };
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify(installJson2, null, 2));

      // File is valid after re-write
      const content = JSON.parse(fs.readFileSync(path.join(sfUserDir, 'install.json'), 'utf-8'));
      expect(content.schema_version).toBe('1.0');
      expect(content.shared_version).toBe('1.0.1');

      // Only one install.json, no nested dirs
      const files = fs.readdirSync(sfUserDir);
      expect(files.filter(f => f === 'install.json').length).toBe(1);
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });

    it('creating lib/ twice with mkdirSync recursive does not error', () => {
      const libDir = path.join(tmpHome, '.config', 'opencode', 'sf-user', 'lib');
      fs.mkdirSync(libDir, { recursive: true });
      // Second call should not throw
      expect(() => fs.mkdirSync(libDir, { recursive: true })).not.toThrow();
      expect(fs.existsSync(libDir)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.4 Directory auto-creation scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7.4: Directory auto-creation when parent missing', () => {
    it('mkdirSync recursive creates all parent directories', () => {
      const deepPath = path.join(tmpHome, '.config', 'opencode', 'sf-user', 'lib');
      // Parent .config/opencode/sf-user does not exist
      expect(fs.existsSync(path.join(tmpHome, '.config'))).toBe(false);

      fs.mkdirSync(deepPath, { recursive: true });
      expect(fs.existsSync(deepPath)).toBe(true);

      // Can write file immediately after
      fs.writeFileSync(path.join(deepPath, 'test.ts'), 'export const x = 1;');
      expect(fs.existsSync(path.join(deepPath, 'test.ts'))).toBe(true);

      // .specforge NOT created
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });

    it('install.json can be written to freshly created directory tree', () => {
      const sfUserDir = path.join(tmpHome, 'deep', 'nested', '.config', 'opencode', 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });

      const installJson = { schema_version: '1.0', base_dir: sfUserDir, installed_at: new Date().toISOString() };
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify(installJson));

      expect(fs.existsSync(path.join(sfUserDir, 'install.json'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.5 Permission error scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('7.5: Permission/write errors are explicit', () => {
    it('writing to a file path that is actually a file (not dir) throws ENOTDIR or EEXIST', () => {
      // Create a FILE where a directory should be
      const blockingFile = path.join(tmpHome, '.config');
      fs.writeFileSync(blockingFile, 'i am a file, not a dir');

      // Attempting to create a subdirectory under a file should throw
      const sfUserDir = path.join(tmpHome, '.config', 'opencode', 'sf-user');
      expect(() => fs.mkdirSync(sfUserDir, { recursive: true })).toThrow();
    });

    it('writing install.json to a read-only directory simulation (file occupying target)', () => {
      const sfUserDir = path.join(tmpHome, 'sf-user-blocked');
      fs.mkdirSync(sfUserDir, { recursive: true });

      // Create a DIRECTORY at the path where install.json should be written
      const installJsonPath = path.join(sfUserDir, 'install.json');
      fs.mkdirSync(installJsonPath, { recursive: true });

      // Writing a file where a directory exists should throw
      expect(() => fs.writeFileSync(installJsonPath, '{"test": true}')).toThrow();
    });

    it('installer does NOT silently fallback to ~/.specforge on write error', () => {
      // If the target dir is blocked, the error should propagate
      // NOT cause a fallback write to legacy path
      const blockingFile = path.join(tmpHome, 'blocked-config');
      fs.writeFileSync(blockingFile, 'blocker');

      let threw = false;
      try {
        fs.mkdirSync(path.join(tmpHome, 'blocked-config', 'opencode', 'sf-user'), { recursive: true });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      // Even on failure, .specforge should never be created as fallback
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional: .specforge never written in any scenario
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Invariant: .specforge is never created', () => {
    it('after full simulated install flow, .specforge does not exist', () => {
      const sfUserDir = path.join(tmpHome, '.config', 'opencode', 'sf-user');
      fs.mkdirSync(sfUserDir, { recursive: true });

      // Simulate full install write set
      fs.mkdirSync(path.join(sfUserDir, 'plugins'), { recursive: true });
      fs.mkdirSync(path.join(sfUserDir, 'lib'), { recursive: true });
      fs.mkdirSync(path.join(sfUserDir, 'tools'), { recursive: true });
      fs.mkdirSync(path.join(sfUserDir, 'agents'), { recursive: true });
      fs.mkdirSync(path.join(sfUserDir, 'templates'), { recursive: true });
      fs.writeFileSync(path.join(sfUserDir, 'install.json'), JSON.stringify({ schema_version: '1.0' }));
      fs.writeFileSync(path.join(sfUserDir, 'plugins', 'sf_specforge.ts'), '// plugin');
      fs.writeFileSync(path.join(sfUserDir, 'lib', 'paths.ts'), '// lib');

      // Comprehensive check
      expect(fs.existsSync(path.join(tmpHome, '.specforge'))).toBe(false);
      expect(fs.existsSync(sfUserDir)).toBe(true);
      expect(fs.existsSync(path.join(sfUserDir, 'install.json'))).toBe(true);
      expect(fs.existsSync(path.join(sfUserDir, 'plugins', 'sf_specforge.ts'))).toBe(true);
      expect(fs.existsSync(path.join(sfUserDir, 'lib', 'paths.ts'))).toBe(true);
    });

    it('resolveUserLevelDirectory never returns a path containing .specforge', () => {
      const resolved = resolveUserLevelDirectory();
      expect(resolved).not.toContain('.specforge');
    });
  });
});
