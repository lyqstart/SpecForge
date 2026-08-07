import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const readRepo = (relativePath: string): string =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8');

describe('ERR-167 daemon startup README contract', () => {
  it('documents the real daemon entry and canonical health endpoint', () => {
    const rootReadme = readRepo('README.md');
    const daemonReadme = readRepo('packages/daemon-core/README.md');

    for (const text of [rootReadme, daemonReadme]) {
      expect(text).toContain('bun run packages/daemon-core/src/index.ts');
      expect(text).toContain('/api/v1/healthz');
    }

    expect(rootReadme).not.toMatch(/^specforge daemon (start|status|stop)$/m);
    expect(daemonReadme).not.toContain('bun run src/index.ts --detach');
  });

  it('marks CLI daemon lifecycle commands as unsupported placeholders', () => {
    const cliReadme = readRepo('packages/cli/README.md');

    expect(cliReadme).toContain(
      'The current CLI daemon subcommands are legacy client placeholders'
    );
    expect(cliReadme).toContain(
      'Do not use `specforge daemon start`, `specforge daemon status`, `specforge daemon stop`'
    );
  });

  it('keeps documentation aligned with daemon startup and HTTP routing facts', () => {
    const daemonEntry = readRepo('packages/daemon-core/src/index.ts');
    const daemonClient = readRepo('packages/cli/src/commands/daemon-client.ts');
    const httpServer = readRepo('packages/daemon-core/src/http/HTTPServer.ts');
    const daemonConfig = readRepo('packages/daemon-core/src/daemon/DaemonConfig.ts');

    expect(daemonEntry).toContain('const daemon = new Daemon()');
    expect(daemonEntry).toContain('await daemon.start()');

    expect(daemonClient).toContain("'/api/daemon/start'");
    expect(daemonClient).toContain("'/api/daemon/health'");
    expect(httpServer).not.toContain("addExactRoute('POST', '/api/daemon/start'");
    expect(httpServer).not.toContain("addExactRoute('GET', '/api/daemon/health'");
    expect(httpServer).toContain("addExactRoute('GET', '/api/v1/healthz'");
    expect(daemonConfig).toContain('background mode - not yet supported');
  });
});
