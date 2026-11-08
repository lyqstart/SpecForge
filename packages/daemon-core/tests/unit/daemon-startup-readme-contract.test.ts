import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenCodeHttpRuntimeClient } from '../../../opencode-adapter/src/integration/OpenCodeHttpRuntimeClient';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const readRepo = (relativePath: string): string =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8');

describe('ERR-167 daemon startup README contract', () => {
  it('opens the documented interactive Kernel on the actual Adapter default endpoint', async () => {
    const observed: string[] = [];
    const client = new OpenCodeHttpRuntimeClient({
      fetchFn: async input => {
        observed.push(String(input));
        return new Response(JSON.stringify({ healthy: true, version: 'test-only' }), { status: 200 });
      },
    });
    expect(await client.getVersion()).toBe('test-only');
    expect(observed).toHaveLength(1);
    const endpoint = new URL(observed[0]!);
    expect(endpoint.hostname).toBe('127.0.0.1');
    for (const document of ['README.md', 'docs/user/quick-start.md']) {
      const startup = readRepo(document).match(/^opencode\s+--port\s+([0-9]+)\s*$/m);
      expect(startup, `${document} must expose the Kernel endpoint used by the Adapter`).not.toBeNull();
      expect(startup![1]).toBe(endpoint.port);
    }
  });

  it('documents the real daemon entry and canonical health endpoint', () => {
    const rootReadme = readRepo('README.md');
    const daemonReadme = readRepo('packages/daemon-core/README.md');

    for (const text of [rootReadme, daemonReadme]) {
      expect(text).toContain('specforge daemon start --detach');
      expect(text).toContain('/api/v1/healthz');
    }

    expect(rootReadme).toContain('specforge daemon start --detach');
    expect(rootReadme).toContain('specforge daemon status');
    expect(rootReadme).toContain('specforge daemon stop');
    expect(rootReadme).toContain('安装器不静默修改用户 PATH');
    expect(daemonReadme).not.toContain('bun run src/index.ts --detach');
  });

  it('documents one-time PATH setup instead of requiring absolute lifecycle commands', () => {
    const installGuide = readRepo('docs/cli/installation-setup.md');
    const userInstall = readRepo('docs/user/install.md');

    expect(installGuide).toContain("[Environment]::SetEnvironmentVariable('Path'");
    expect(installGuide).toContain('日常操作统一使用 `specforge`');
    expect(userInstall).toContain('安装器不会静默修改用户 PATH');
    expect(userInstall).toContain('specforge daemon restart');
  });

  it('documents CLI daemon lifecycle commands as supported deployment entrypoints', () => {
    const cliReadme = readRepo('packages/cli/README.md');

    expect(cliReadme).toContain('specforge daemon start --detach');
    expect(cliReadme).toContain('specforge daemon status');
    expect(cliReadme).toContain('specforge daemon stop');
    expect(cliReadme).not.toContain('legacy client placeholders');
  });

  it('keeps documentation aligned with daemon startup and HTTP routing facts', () => {
    const daemonEntry = readRepo('packages/daemon-core/src/index.ts');
    const daemonClient = readRepo('packages/cli/src/commands/daemon-client.ts');
    const httpServer = readRepo('packages/daemon-core/src/http/HTTPServer.ts');
    const daemonConfig = readRepo('packages/daemon-core/src/daemon/DaemonConfig.ts');

    expect(daemonEntry).toContain('const daemon = new Daemon()');
    expect(daemonEntry).toContain('await daemon.start()');

    expect(daemonClient).toContain("'specforged.exe'");
    expect(daemonClient).toContain(".option('detach'");
    expect(daemonClient).toContain("'/api/v1/healthz'");
    expect(daemonClient).toContain("'/api/v1/admin/stop'");
    expect(daemonClient).not.toContain("'/api/daemon/start'");
    expect(daemonClient).not.toContain("'/api/daemon/health'");
    expect(httpServer).not.toContain("addExactRoute('POST', '/api/daemon/start'");
    expect(httpServer).not.toContain("addExactRoute('GET', '/api/daemon/health'");
    expect(httpServer).toContain("addExactRoute('GET', '/api/v1/healthz'");
    expect(daemonConfig).toContain('background mode - not yet supported');
  });
});
