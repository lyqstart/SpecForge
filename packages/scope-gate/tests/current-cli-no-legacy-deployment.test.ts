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
});
