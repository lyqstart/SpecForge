import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { StateManager } from '../../src/state/StateManager';
import type { IPathResolver } from '../../src/daemon/path-resolver';

class TestPathResolver implements IPathResolver {
  constructor(private readonly baseDir: string) {}
  resolveProjectRuntimeDir(_projectPath: string): string { return path.join(this.baseDir, 'project-rt'); }
  resolveStatePath(projectPath: string): string { return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json'); }
  resolveEventsPath(projectPath: string): string { return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl'); }
  resolveSessionsDir(projectPath: string): string { return path.join(this.resolveProjectRuntimeDir(projectPath), 'sessions'); }
  resolveDaemonRuntimeDir(): string { return this.baseDir; }
  resolveHandshakePath(): string { return path.join(this.baseDir, 'handshake.json'); }
  resolveDaemonJsonPath(): string { return path.join(this.baseDir, 'daemon.json'); }
  resolveDaemonStatePath(): string { return path.join(this.baseDir, 'state.json'); }
  resolveDaemonEventsPath(): string { return path.join(this.baseDir, 'events.jsonl'); }
}

describe('Daemon wiring — Runtime WAL sole writer', () => {
  let tempDir: string;
  let resolver: TestPathResolver;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-daemon-wal-'));
    resolver = new TestPathResolver(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists each state transition exactly once through the Runtime WAL', async () => {
    const stateManager = new StateManager(resolver, 'test-project');
    await stateManager.initialize();

    await stateManager.transition('WI-SOLE', '', 'intake_ready', 'test');
    await stateManager.transition('WI-SOLE', 'intake_ready', 'impact_analyzing', 'test');

    const eventsPath = resolver.resolveEventsPath('test-project');
    const events = (await fs.readFile(eventsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.action)).toEqual([
      'state.transition',
      'state.transition',
    ]);
    expect(events.map((event) => event.payload.to_state)).toEqual([
      'intake_ready',
      'impact_analyzing',
    ]);
  });

  it('writes both authoritative WAL and derived checkpoint', async () => {
    const stateManager = new StateManager(resolver, 'test-project');
    await stateManager.initialize();
    await stateManager.transition('WI-ORDER', '', 'intake_ready', 'test');

    expect((await fs.stat(resolver.resolveEventsPath('test-project'))).size).toBeGreaterThan(0);
    expect((await fs.stat(resolver.resolveStatePath('test-project'))).size).toBeGreaterThan(0);
  });
});
