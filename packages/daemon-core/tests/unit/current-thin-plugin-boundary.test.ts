import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

describe('current Thin Plugin boundary', () => {
  it('keeps OpenCode discovery entrypoint to one runtime function export', async () => {
    const module = await import(
      resolve(repositoryRoot, 'setup/userlevel-opencode/plugins/sf_specforge.ts')
    );
    const pluginFunctions = Object.values(module).filter((value) => typeof value === 'function');

    expect(pluginFunctions).toHaveLength(1);
    expect(pluginFunctions[0]).toBe(module.default);
  });

  it('keeps dependency-injected implementation outside the discovery entrypoint', async () => {
    const implementation = await import(
      resolve(repositoryRoot, 'setup/userlevel-opencode/scripts/lib/sf_thin_plugin.ts')
    );
    expect(implementation.createSpecForgeThinPlugin).toBeTypeOf('function');
  });

  it('installs one global plugin and its non-discovery implementation helper', async () => {
    const registry = await readFile(resolve(repositoryRoot, 'scripts/lib/registry.ts'), 'utf8');
    expect(registry).toContain('path: "plugins/sf_specforge.ts"');
    expect(registry).toContain('path: "sf-user/lib/sf_thin_plugin.ts"');
    expect(registry).not.toContain('integrations/opencode/sf_specforge.ts');
  });

  it('does not project an OpenCode plugin into project initialization', async () => {
    const projectInit = await readFile(
      resolve(repositoryRoot, 'packages/daemon-core/src/tools/lib/sf_project_init_core.ts'),
      'utf8',
    );
    const httpServer = await readFile(
      resolve(repositoryRoot, 'packages/daemon-core/src/http/HTTPServer.ts'),
      'utf8',
    );

    expect(projectInit).not.toContain('ensureProjectThinPlugin');
    expect(projectInit).not.toContain("join(projectRoot, '.opencode'");
    expect(httpServer).not.toContain('ensureProjectThinPlugin');
  });
});
