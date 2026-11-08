import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('current CLI deployment boundary', () => {
  it('does not expose the retired specforge init deployment command', async () => {
    const cli = await readFile(resolve(ROOT, 'packages/cli/src/cli.ts'), 'utf8');

    expect(cli).not.toContain("from './commands/init'");
    expect(cli).not.toContain('function addInitCommands(');
    expect(cli).not.toContain('addInitCommands(');
  });

  it('does not advertise user-home ~/.specforge as a current deployment location', async () => {
    const [cli, installer, helpSystem] = await Promise.all([
      readFile(resolve(ROOT, 'packages/cli/src/cli.ts'), 'utf8'),
      readFile(resolve(ROOT, 'scripts/sf-installer.ts'), 'utf8'),
      readFile(resolve(ROOT, 'packages/cli/src/help/HelpSystem.ts'), 'utf8'),
    ]);

    expect(cli).not.toContain('defaults to ~/.specforge');
    expect(installer).not.toContain('部署共享组件到 ~/.specforge/');
    expect(helpSystem).not.toContain('specforge init');
    expect(helpSystem).not.toContain('write permissions to ~/.specforge/');
    expect(helpSystem).not.toContain('logs under ~/.specforge/');
    await expect(access(resolve(ROOT, 'scripts/smoke-runner.ts'))).rejects.toThrow();
    await expect(access(resolve(ROOT, 'packages/cli/src/distribution/smoke-runner-core.ts'))).rejects.toThrow();
  });

  it('does not retain the unreachable legacy CLI deployment implementation', async () => {
    const retiredPaths = [
      'packages/cli/src/commands/init/index.ts',
      'packages/cli/src/commands/init/options-parser.ts',
      'packages/cli/src/commands/init/output.ts',
      'packages/cli/src/commands/init/resource-check.ts',
      'packages/cli/src/commands/init/wizard.ts',
      'packages/cli/src/distribution/daemon-healthcheck.ts',
      'packages/cli/src/distribution/default-config-generator.ts',
      'packages/cli/src/distribution/error-payload.ts',
      'packages/cli/src/distribution/installation-record.ts',
      'packages/cli/src/utils/filesystem-adapter.ts',
      'packages/cli/src/utils/lock-manager.ts',
      'tests/integration/distribution/downgrade-rejection.test.ts',
      'tests/integration/distribution/init-concurrent-lock.test.ts',
      'tests/integration/distribution/init-end-to-end.test.ts',
      'tests/integration/distribution/pack-and-install.test.ts',
      'tests/integration/distribution/uninstall-preserves-data.test.ts',
      'tests/integration/distribution/upgrade-in-place.test.ts',
    ];

    for (const retiredPath of retiredPaths) {
      await expect(access(resolve(ROOT, retiredPath))).rejects.toThrow();
    }

    const [pathResolver, schemaVersionManager] = await Promise.all([
      readFile(resolve(ROOT, 'packages/cli/src/utils/path-resolver.ts'), 'utf8'),
      readFile(resolve(ROOT, 'packages/cli/src/distribution/schema-version-manager.ts'), 'utf8'),
    ]);

    expect(pathResolver).not.toContain('installSourceFromArgv');
    expect(pathResolver).not.toContain('INIT_HOME_NOT_SET');
    expect(schemaVersionManager).not.toContain('compareForHealthCheck');
  });
});
