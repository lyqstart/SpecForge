import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

describe('Daemon Wiring Integrity', () => {
  it('DaemonConfig delegates runtime and handshake paths to the path resolver', () => {
    const content = readRepoFile('packages/daemon-core/src/daemon/DaemonConfig.ts');

    expect(content).toContain('path-resolver');
    expect(content).toContain('getPathResolver()');
    expect(content).toContain('resolveDaemonRuntimeDir()');
    expect(content).toContain('resolveHandshakePath()');
    expect(content).not.toContain('daemon.sock.json');
  });

  it('path-resolver owns the userlevel runtime handshake location', () => {
    const content = readRepoFile('packages/daemon-core/src/daemon/path-resolver.ts');

    expect(content).toContain('resolveUserLevelDirectory');
    expect(content).toContain('sf-user');
    expect(content).toContain('runtime');
    expect(content).toContain('handshake.json');
  });

  it('Daemon composes the current cross-package runtime subsystems', () => {
    const content = readRepoFile('packages/daemon-core/src/daemon/Daemon.ts');

    expect(content).toContain('PermissionEngine');
    expect(content).toContain('WorkflowEngine');
    expect(content).toContain('ToolDispatcher');
    expect(content).toContain('EventBus');
    expect(content).toContain('HandshakeManager');
  });

  it('HTTPServer still receives the daemon tool dispatcher dependency', () => {
    const content = readRepoFile('packages/daemon-core/src/daemon/Daemon.ts');

    expect(content).toContain('toolDispatcher: new ToolDispatcher');
    expect(content).toContain('permissionEngine: this.permissionEngine');
    expect(content).toContain('workflowEngine: this.workflowEngine');
  });
});
