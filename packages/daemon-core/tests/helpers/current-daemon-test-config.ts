import * as path from 'node:path';
import { TASK_ARTIFACT_CONTRACT_VERSION } from '@specforge/types';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import type { IPathResolver } from '../../src/daemon/path-resolver';

class TestPathResolver implements IPathResolver {
  constructor(private readonly root: string) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(projectPath, '.specforge', 'runtime');
  }

  resolveStatePath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');
  }

  resolveEventsPath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl');
  }

  resolveSessionsDir(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'sessions');
  }

  resolveDaemonRuntimeDir(): string {
    return path.join(this.root, 'specforge-user', 'runtime');
  }

  resolveHandshakePath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'daemon.sock.json');
  }

  resolveDaemonJsonPath(): string {
    return path.join(this.root, 'opencode', 'daemon.json');
  }

  resolveDaemonStatePath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');
  }

  resolveDaemonEventsPath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'events.jsonl');
  }
}

export class CurrentTestDaemonConfig extends DaemonConfig {
  private readonly testPathResolver: IPathResolver;

  constructor(root: string) {
    super([]);
    this.testPathResolver = new TestPathResolver(root);
  }

  override getPathResolver(): IPathResolver {
    return this.testPathResolver;
  }

  override getRuntimeDir(): string {
    return this.testPathResolver.resolveDaemonRuntimeDir();
  }

  override getHandshakeFile(): string {
    return this.testPathResolver.resolveHandshakePath();
  }
}

export function currentHandshake(port: number, token: string, pid: number = process.pid) {
  return {
    schema_version: '1.0' as const,
    pid,
    port,
    token,
    bound_to: '127.0.0.1' as const,
    startedAt: Date.now(),
    version: 'test',
    serviceMode: false,
    artifact_contract_versions: {
      task_document: TASK_ARTIFACT_CONTRACT_VERSION,
    },
  };
}
