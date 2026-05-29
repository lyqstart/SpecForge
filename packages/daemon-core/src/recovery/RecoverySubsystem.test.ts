/**
 * Recovery Subsystem unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoverySubsystem } from './RecoverySubsystem';
import { IPathResolver } from '../daemon/path-resolver';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * In-memory mock IPathResolver that uses a temporary directory so tests
 * don't pollute ~/.specforge.
 */
class MockPathResolver implements IPathResolver {
  constructor(private tmpDir: string) {}

  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(this.tmpDir, 'projects', 'mock-project', '.specforge', 'runtime');
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
    return path.join(os.homedir(), '.specforge', 'runtime');
  }

  resolveHandshakePath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'handshake.json');
  }

  resolveDaemonJsonPath(): string {
    return path.join(os.homedir(), '.config', 'opencode', 'daemon.json');
  }

  resolveDaemonStatePath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');
  }

  resolveDaemonEventsPath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'events.jsonl');
  }
}

describe('RecoverySubsystem', () => {
  let subsystem: RecoverySubsystem;
  let testProjectPath: string;
  let mockResolver: MockPathResolver;
  let tmpDir: string;

  beforeEach(() => {
    testProjectPath = 'test-project-path-recovery';
    // Use os.tmpdir() for cross-platform safety
    tmpDir = path.join(os.tmpdir(), `specforge-test-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mockResolver = new MockPathResolver(tmpDir);
    subsystem = new RecoverySubsystem(mockResolver, testProjectPath);
  });

  afterEach(async () => {
    // Cleanup: remove the entire temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('should initialize', async () => {
    await subsystem.initialize();
    expect(subsystem.getEventsPath()).toContain('events.jsonl');
    expect(subsystem.getStatePath()).toContain('state.json');
  });

  it('should check consistency', async () => {
    const result = await subsystem.checkConsistency();
    
    expect(result).toBeDefined();
    expect(result.isValid).toBeDefined();
    expect(result.issues).toBeDefined();
  });

  it('should repair inconsistencies', async () => {
    const result = await subsystem.checkConsistency();
    const repairResult = await subsystem.repairInconsistency(result);
    
    expect(repairResult.success).toBe(true);
    expect(repairResult.repairEvents).toBeDefined();
  });

  it('should attempt session reconnection', async () => {
    const result = await subsystem.attemptSessionReconnect('test-session-id');
    
    // Currently returns false (placeholder implementation)
    expect(result).toBe(false);
  });

  it('should rebuild state from events', async () => {
    const events = [
      {
        eventId: 'event-1',
        ts: 1000,
        projectId: testProjectPath,
        action: 'test.event',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' as const },
      },
      {
        eventId: 'event-2',
        ts: 2000,
        projectId: testProjectPath,
        action: 'test.event',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' as const },
      },
    ];

    const state = await subsystem.rebuildFromEvents(events);
    
    expect(state.projectPath).toBe(testProjectPath);
    expect(state.lastEventId).toBe('event-2');
    expect(state.lastEventTs).toBe(2000);
  });

  it('should save checkpoint successfully and verify file content', async () => {
    const sessionId = 'test-session-001';
    const snapshotData = {
      context: { lastEventId: 'event-2' },
      sessions: ['active-1'],
    };

    await subsystem.saveCheckpoint(sessionId, snapshotData);

    // Verify the checkpoint file was created with correct content
    const statePath = subsystem.getStatePath();
    const checkpointPath = path.join(
      path.dirname(statePath),
      'checkpoints',
      `${sessionId}.json`
    );

    const raw = await fs.readFile(checkpointPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toEqual(snapshotData);
  });

  it('should not throw on saveCheckpoint write failure', async () => {
    // Create an invalid statePath that cannot be written (use a path with
    // a file where a directory should be — but simpler: use null byte trick).
    // Actually, the simplest way: fill snapshotData with a circular reference
    // so JSON.stringify throws. But wait, we want to test that *write*
    // failure doesn't throw — better to construct a scenario where the path
    // is unwritable. The easiest cross-platform approach: make the dir
    // read-only or point to a path inside a non-existent root.
    //
    // Since the mock controls the path, we can create a file where the
    // checkpoint directory should be, causing mkdir to fail.
    const statePath = subsystem.getStatePath();
    const checkpointDir = path.join(path.dirname(statePath), 'checkpoints');

    // Create a *file* at the checkpointDir path so mkdir fails
    await fs.mkdir(path.dirname(checkpointDir), { recursive: true });
    await fs.writeFile(checkpointDir, 'blocking-file');

    // Should not throw — error should be caught and logged
    await expect(
      subsystem.saveCheckpoint('blocked-session', { data: 'test' })
    ).resolves.toBeUndefined();

    // Cleanup the blocking file
    await fs.unlink(checkpointDir);
  });
});
