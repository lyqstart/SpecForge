/**
 * opencode-plugin-client-path.test.ts
 *
 * Verifies that the sf_specforge plugin's resolveClientPath() logic
 * correctly finds sf_plugin_client.ts in the installer deployment layout.
 *
 * The plugin is deployed to $CONFIG_ROOT/plugins/sf_specforge.ts
 * The client is deployed to $CONFIG_ROOT/sf-user/lib/sf_plugin_client.ts
 *
 * resolveClientPath() uses __dirname-relative paths, so:
 *   __dirname = $CONFIG_ROOT/plugins/
 *   ../sf-user/lib/sf_plugin_client.ts = $CONFIG_ROOT/sf-user/lib/sf_plugin_client.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Plugin client path resolution', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-plugin-path-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Replicate the resolveClientPath() logic from sf_specforge.ts
   * using a custom __dirname to simulate deployed plugin location.
   */
  function resolveClientPath(pluginDir: string): string {
    const { resolve, join } = path;
    const { existsSync } = fs;

    // Primary: sf-user/lib location (v1.1 installer standard deployment)
    const sfUserPath = resolve(pluginDir, '..', 'sf-user', 'lib', 'sf_plugin_client.ts');
    if (existsSync(sfUserPath)) return sfUserPath;

    // Secondary: v1.1 legacy location (sf-runtime)
    const v11Path = join(os.homedir(), '.config', 'opencode', 'sf-runtime', 'sf_plugin_client.ts');
    if (existsSync(v11Path)) return v11Path;

    // Tertiary: plugin-relative bundled client ($CONFIG_ROOT/lib/)
    const localPath = resolve(pluginDir, '..', 'lib', 'sf_plugin_client.ts');
    if (existsSync(localPath)) return localPath;

    // Last resort: workspace packages (dev mode)
    const devPath = resolve(pluginDir, '..', '..', '..', 'packages', 'daemon-client', 'src', 'index.ts');
    if (existsSync(devPath)) return devPath;

    throw new Error(
      `[sf:specforge] Cannot locate sf_plugin_client. ` +
      `Checked: ${sfUserPath}, ${v11Path}, ${localPath}, ${devPath}`
    );
  }

  describe('Installer standard layout: $CONFIG/sf-user/lib/', () => {
    it('should resolve sf_plugin_client.ts from sf-user/lib/', () => {
      // Simulate: $CONFIG/plugins/ (where plugin is deployed)
      const pluginsDir = path.join(tmpDir, 'plugins');
      const sfUserLib = path.join(tmpDir, 'sf-user', 'lib');
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.mkdirSync(sfUserLib, { recursive: true });
      fs.writeFileSync(path.join(sfUserLib, 'sf_plugin_client.ts'), '// client');

      const result = resolveClientPath(pluginsDir);
      expect(result).toBe(path.join(sfUserLib, 'sf_plugin_client.ts'));
    });

    it('sf-user/lib/ takes priority over $CONFIG/lib/', () => {
      const pluginsDir = path.join(tmpDir, 'plugins');
      const sfUserLib = path.join(tmpDir, 'sf-user', 'lib');
      const directLib = path.join(tmpDir, 'lib');
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.mkdirSync(sfUserLib, { recursive: true });
      fs.mkdirSync(directLib, { recursive: true });
      fs.writeFileSync(path.join(sfUserLib, 'sf_plugin_client.ts'), '// sf-user client');
      fs.writeFileSync(path.join(directLib, 'sf_plugin_client.ts'), '// direct client');

      const result = resolveClientPath(pluginsDir);
      // Should prefer sf-user/lib/ (primary path)
      expect(result).toBe(path.join(sfUserLib, 'sf_plugin_client.ts'));
    });
  });

  describe('Legacy fallback: $CONFIG/lib/', () => {
    it('should fall back to $CONFIG/lib/ when sf-user/lib/ does not exist', () => {
      const pluginsDir = path.join(tmpDir, 'plugins');
      const directLib = path.join(tmpDir, 'lib');
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.mkdirSync(directLib, { recursive: true });
      fs.writeFileSync(path.join(directLib, 'sf_plugin_client.ts'), '// legacy client');

      const result = resolveClientPath(pluginsDir);
      expect(result).toBe(path.join(directLib, 'sf_plugin_client.ts'));
    });
  });

  describe('Error when not found', () => {
    it('should throw with all checked paths when sf_plugin_client.ts is missing', () => {
      const pluginsDir = path.join(tmpDir, 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });

      expect(() => resolveClientPath(pluginsDir)).toThrow('[sf:specforge] Cannot locate sf_plugin_client');
    });

    it('error message should list sf-user/lib path', () => {
      const pluginsDir = path.join(tmpDir, 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });

      try {
        resolveClientPath(pluginsDir);
      } catch (e: any) {
        expect(e.message).toContain('sf-user');
        expect(e.message).toContain('sf_plugin_client');
      }
    });
  });

  describe('Does not use real user directory', () => {
    it('primary path is relative to plugin dir, not hardcoded homedir/.config/opencode', () => {
      const pluginsDir = path.join(tmpDir, 'plugins');
      const sfUserLib = path.join(tmpDir, 'sf-user', 'lib');
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.mkdirSync(sfUserLib, { recursive: true });
      fs.writeFileSync(path.join(sfUserLib, 'sf_plugin_client.ts'), '// client');

      const result = resolveClientPath(pluginsDir);
      // Result should be under tmpDir (the simulated config root)
      expect(result.startsWith(tmpDir)).toBe(true);
      // Result should NOT be under the real OpenCode config path
      const realConfigPath = path.join(os.homedir(), '.config', 'opencode');
      expect(result.startsWith(realConfigPath)).toBe(false);
    });
  });
});
