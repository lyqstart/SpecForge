/**
 * installer-no-legacy-write.test.ts
 *
 * Verifies that the SpecForge installer no longer resolves paths
 * to the legacy ~/.specforge/ directory for write operations.
 *
 * v1.1 compliance requirement: all writes must target ~/.config/opencode/sf-user/
 */

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

// Import the path resolution function used by the installer
import { resolveUserLevelDirectory } from '../lib/paths';

describe('Installer path resolution — no legacy ~/.specforge write', () => {
  const home = os.homedir();
  const legacyDir = path.join(home, '.specforge');
  const legacyDirPosix = `${home.replace(/\\/g, '/')}/.specforge`;

  describe('resolveUserLevelDirectory()', () => {
    it('should NOT resolve to ~/.specforge', () => {
      const resolved = resolveUserLevelDirectory();
      const resolvedPosix = resolved.replace(/\\/g, '/');
      expect(resolvedPosix).not.toContain('/.specforge');
      expect(resolved).not.toBe(legacyDir);
    });

    it('should resolve to ~/.config/opencode', () => {
      const resolved = resolveUserLevelDirectory();
      const resolvedPosix = resolved.replace(/\\/g, '/');
      expect(resolvedPosix).toContain('/.config/opencode');
    });
  });

  describe('getSpecForgeUserDir equivalent path', () => {
    // Replicate the logic from sf-installer.ts getSpecForgeUserDir()
    // Now uses resolveUserLevelDirectory() to respect XDG_CONFIG_HOME
    function getSpecForgeUserDir(): string {
      return path.join(resolveUserLevelDirectory(), 'sf-user');
    }

    it('should NOT point to ~/.specforge', () => {
      const sfUserDir = getSpecForgeUserDir();
      const sfUserDirPosix = sfUserDir.replace(/\\/g, '/');
      expect(sfUserDirPosix).not.toContain('/.specforge');
    });

    it('should point to ~/.config/opencode/sf-user/', () => {
      const sfUserDir = getSpecForgeUserDir();
      const sfUserDirPosix = sfUserDir.replace(/\\/g, '/');
      expect(sfUserDirPosix).toMatch(/\/.config\/opencode\/sf-user$/);
    });

    it('install.json target should NOT be under ~/.specforge', () => {
      const installJsonPath = path.join(getSpecForgeUserDir(), 'install.json');
      expect(installJsonPath.replace(/\\/g, '/')).not.toContain('/.specforge/');
    });

    it('specforge-manifest.json target should NOT be under ~/.specforge', () => {
      const manifestPath = path.join(getSpecForgeUserDir(), 'specforge-manifest.json');
      expect(manifestPath.replace(/\\/g, '/')).not.toContain('/.specforge/');
    });

    it('lib/ deployment target should NOT be under ~/.specforge', () => {
      const libTarget = path.join(getSpecForgeUserDir(), 'lib');
      expect(libTarget.replace(/\\/g, '/')).not.toContain('/.specforge/');
    });

    it('templates/ deployment target should NOT be under ~/.specforge', () => {
      const templatesTarget = path.join(getSpecForgeUserDir(), 'templates');
      expect(templatesTarget.replace(/\\/g, '/')).not.toContain('/.specforge/');
    });

    it('package.json deployment target should NOT be under ~/.specforge', () => {
      const pkgTarget = path.join(getSpecForgeUserDir(), 'package.json');
      expect(pkgTarget.replace(/\\/g, '/')).not.toContain('/.specforge/');
    });
  });
});
