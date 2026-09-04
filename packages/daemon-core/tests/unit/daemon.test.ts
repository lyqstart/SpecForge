/**
 * Daemon integration tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Daemon } from '../../src/daemon/Daemon';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import type { IPathResolver } from '../../src/daemon/path-resolver';

describe('Daemon', () => {
  const originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
  let daemon: Daemon;
  let testOpenCodeConfigDir: string;

  beforeEach(async () => {
    testOpenCodeConfigDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'specforge-daemon-test-config-'),
    );
    process.env.OPENCODE_CONFIG_DIR = testOpenCodeConfigDir;
    const runtimeDir = path.join(testOpenCodeConfigDir, 'specforge-user', 'runtime');
    const resolver: IPathResolver = {
      resolveProjectRuntimeDir: projectPath => path.join(projectPath, '.specforge', 'runtime'),
      resolveStatePath: projectPath => path.join(projectPath, '.specforge', 'runtime', 'state.json'),
      resolveEventsPath: projectPath => path.join(projectPath, '.specforge', 'runtime', 'events.jsonl'),
      resolveSessionsDir: projectPath => path.join(projectPath, '.specforge', 'runtime', 'sessions'),
      resolveDaemonRuntimeDir: () => runtimeDir,
      resolveHandshakePath: () => path.join(runtimeDir, 'daemon.sock.json'),
      resolveDaemonJsonPath: () => path.join(testOpenCodeConfigDir, 'daemon.json'),
      resolveDaemonStatePath: () => path.join(runtimeDir, 'state.json'),
      resolveDaemonEventsPath: () => path.join(runtimeDir, 'events.jsonl'),
    };
    const config = new DaemonConfig([]);
    vi.spyOn(config, 'getPathResolver').mockReturnValue(resolver);
    vi.spyOn(config, 'getRuntimeDir').mockReturnValue(runtimeDir);
    vi.spyOn(config, 'getHandshakeFile').mockReturnValue(resolver.resolveHandshakePath());
    daemon = new Daemon(config);
  });

  afterEach(async () => {
    await daemon.stop();
    if (originalOpenCodeConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR;
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
    }
    await fs.rm(testOpenCodeConfigDir, { recursive: true, force: true });
  });

  it('should not bind shared recovery to the daemon runtime as a project', () => {
    const recoverySubsystem = (daemon as any).recoverySubsystem;

    expect(() => recoverySubsystem.getEventsPath()).toThrow('not bound');
    expect(() => recoverySubsystem.getStatePath()).toThrow('not bound');
  });

  it('should start and stop daemon', async () => {
    await daemon.start();
    expect(daemon.isDaemonRunning()).toBe(true);
    
    await daemon.stop();
    expect(daemon.isDaemonRunning()).toBe(false);
  }, 30_000);

  it('should broadcast events', async () => {
    await daemon.start();
    
    const event = {
      eventId: '1',
      ts: Date.now(),
      projectId: 'test',
      category: 'session',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    await daemon.broadcastEvent(event);
  }, 30_000);
});
