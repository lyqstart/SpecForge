import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('current release installer manifest boundary', () => {
  it('makes install and upgrade consume the verified release manifest set only', async () => {
    const source = await readFile(resolve(ROOT, 'scripts/sf-installer.ts'), 'utf8');

    expect(source).toContain('loadVerifiedReleaseInstallSet');
    expect(source).not.toContain('for (const entry of SHARED_COMPONENT_REGISTRY)');
    expect(source).not.toContain('deployTemplates(');
    expect(source).not.toContain('deployScriptsPackageJson(');
    expect(source).not.toContain('setup/userlevel-scripts-lib');
    expect(source).not.toContain('path.join(userLevelDir, "install.json")');
  });

  it('binds the project Thin Plugin to the current SpecForge user root only', async () => {
    const plugin = await readFile(
      resolve(ROOT, 'setup/userlevel-opencode/plugins/sf_specforge.ts'),
      'utf8',
    );

    expect(plugin).toContain("homedir(), '.specforge'");
    expect(plugin).toContain("'lib', 'sf_plugin_client.ts'");
    expect(plugin).toContain("'bin', executableName");
    expect(plugin).not.toContain('sf-user');
    expect(plugin).not.toContain('OPENCODE_CONFIG_DIR');
    expect(plugin).not.toContain('XDG_CONFIG_HOME');
  });
});
