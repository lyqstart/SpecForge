/**
 * RecoverySubsystem + SessionRegistry startupReplay integration test
 *
 * Validates TASK-9: RecoverySubsystem calls SessionRegistry.startupReplay
 * during checkAndRepair when session events are present in the WAL.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { SessionRegistry } from '../../src/session/SessionRegistry';
import { StateManager } from '../../src/state/StateManager';
import { EventBus } from '../../src/event-bus/EventBus';
import { WAL } from '../../src/wal/WAL';
import {
  PersonalPathResolver,
} from '../../src/daemon/path-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class TestPathResolver extends PersonalPathResolver {
  private readonly testDaemonDir: string;
  private readonly testProjectDir: string;

  constructor(testDaemonDir: string, testProjectDir: string) {
    super();
    this.testDaemonDir = testDaemonDir;
    this.testProjectDir = testProjectDir;
  }

  override resolveDaemonRuntimeDir(): string {
    return this.testDaemonDir;
  }

  override resolveDaemonStatePath(): string {
    return path.join(this.testDaemonDir, 'state.json');
  }

  override resolveDaemonEventsPath(): string {
    return path.join(this.testDaemonDir, 'events.jsonl');
  }
}

function makeTmpDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'specforge-recovery-session-'));
}

async function rmRF(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecoverySubsystem + SessionRegistry startupReplay integration', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestPathResolver(daemonDir, projectDir);
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  it('should replay session events during checkAndRepair when sessionRegistry is injected', async () => {
    // Setup: create StateManager + WAL + SessionRegistry
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const eventBus = new EventBus();
    const wal = sm.getWal();

    // Write session events directly to WAL
    const e1 = wal.createEvent('proj-1', 'session', 'session.registered', {
      sessionId: 'sess-001',
      agentRole: 'sf-orchestrator',
      workflowRole: 'requirements',
      workItemId: 'WI-001',
      spawnIntentId: 'spawn-001',
      parentSessionId: null,
    });
    await wal.appendEvent(e1);

    const e2 = wal.createEvent('proj-1', 'session', 'session.activated', {
      sessionId: 'sess-001',
      spawnIntentId: 'spawn-001',
    });
    await wal.appendEvent(e2);

    const e3 = wal.createEvent('proj-1', 'session', 'session.bound', {
      sessionId: 'sess-001',
      projectPath: '/path/to/my-project',
    });
    await wal.appendEvent(e3);

    // Create SessionRegistry (not started — only using startupReplay)
    const sessionRegistry = new SessionRegistry(eventBus, 30 * 60 * 1000);

    // Create RecoverySubsystem with sessionRegistry injected
    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      wal,
      sm,
      sessionRegistry,
    );

    // Run checkAndRepair — should trigger startupReplay
    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);

    // Verify session was replayed into SessionRegistry
    const session = sessionRegistry.lookupBySessionId('sess-001');
    expect(session).not.toBeNull();
    expect(session!.status).toBe('active');
    expect(session!.agentRole).toBe('sf-orchestrator');

    // Verify project binding was restored
    const projectPath = sessionRegistry.getProjectPath('sess-001');
    expect(projectPath).toBe('/path/to/my-project');

    // Cleanup
    eventBus.stop();
  });

  it('should skip replay when sessionRegistry is not injected', async () => {
    // Setup: StateManager only, no session registry
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const wal = sm.getWal();

    // Write a session event
    const e1 = wal.createEvent('proj-1', 'session', 'session.registered', {
      sessionId: 'sess-002',
      agentRole: 'sf-executor',
      workflowRole: 'dev',
      workItemId: 'WI-002',
      spawnIntentId: 'spawn-002',
      parentSessionId: null,
    });
    await wal.appendEvent(e1);

    // RecoverySubsystem WITHOUT sessionRegistry (5th param omitted)
    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      wal,
      sm,
    );

    // Should NOT throw — silently skips replay
    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);
  });

  it('should handle WAL with no session events gracefully', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const eventBus = new EventBus();
    const wal = sm.getWal();

    // Write only a non-session event
    const e1 = wal.createEvent('WI-003', 'state', 'state.transition', {
      work_item_id: 'WI-003',
      from_state: '',
      to_state: 'intake',
    });
    await wal.appendEvent(e1);

    const sessionRegistry = new SessionRegistry(eventBus, 30 * 60 * 1000);

    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      wal,
      sm,
      sessionRegistry,
    );

    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);

    // No sessions should be registered
    expect(sessionRegistry.getActiveSessionCount()).toBe(0);
    expect(sessionRegistry.getPendingSessions()).toHaveLength(0);

    eventBus.stop();
  });

  it('should replay alias_bound events to restore alias table', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const eventBus = new EventBus();
    const wal = sm.getWal();

    // Write session.registered + session.alias_bound
    const e1 = wal.createEvent('proj-1', 'session', 'session.registered', {
      sessionId: 'sess-003',
      agentRole: 'plugin',
      workflowRole: 'plugin-daemon-bridge',
      workItemId: '',
      spawnIntentId: '',
      parentSessionId: null,
      projectPath: '/path/to/project',
    });
    await wal.appendEvent(e1);

    const e2 = wal.createEvent('sess-003', 'session', 'session.alias_bound', {
      sessionId: 'sess-003',
      opencodeSessionId: 'opencode-abc-123',
    });
    await wal.appendEvent(e2);

    const sessionRegistry = new SessionRegistry(eventBus, 30 * 60 * 1000);

    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      wal,
      sm,
      sessionRegistry,
    );

    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);

    // Verify alias was restored via handleOpenCodeEvent-like lookup
    const session = sessionRegistry.lookupBySessionId('sess-003');
    expect(session).not.toBeNull();
    expect(session!.status).toBe('pending');

    // Verify project binding was restored
    expect(sessionRegistry.getProjectPath('sess-003')).toBe('/path/to/project');

    eventBus.stop();
  });
});
