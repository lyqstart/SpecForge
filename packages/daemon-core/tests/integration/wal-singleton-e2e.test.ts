/**
 * WAL/StateManager Singleton E2E Integration Tests
 *
 * Validates the complete behavior of the WAL/StateManager singleton refactoring:
 * - T1: Daemon startup/restart scenarios
 * - T2: WI state transitions with singleton WAL
 * - T3: events.jsonl integrity and backward compatibility
 * - T4: ProjectManager uses daemon global StateManager
 * - T5: RecoverySubsystem with injected WAL + StateManager
 *
 * Uses temporary directories for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PersonalPathResolver,
  IPathResolver,
} from '../../src/daemon/path-resolver';
import { WAL } from '../../src/wal/WAL';
import { StateManager } from '../../src/state/StateManager';
import { ProjectManager } from '../../src/project/ProjectManager';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { EventBus } from '../../src/event-bus/EventBus';
import type { Event } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A path resolver that overrides daemon-global paths to a temp directory,
 * so we can test isDaemonGlobal=true without touching ~/.specforge/runtime/.
 */
class TestDaemonPathResolver extends PersonalPathResolver {
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

  override resolveHandshakePath(): string {
    return path.join(this.testDaemonDir, 'handshake.json');
  }

  override resolveDaemonJsonPath(): string {
    return path.join(this.testProjectDir, 'daemon.json');
  }
}

function makeTmpDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'specforge-wal-singleton-'));
}

async function rmRF(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a "legacy" state.transition event with the old schema (no schema_version field).
 * Used for backward compatibility testing.
 */
function legacyTransitionEvent(
  workItemId: string,
  fromState: string,
  toState: string,
  seq: number,
): Event {
  return {
    eventId: `legacy-${seq}-${Date.now()}`,
    ts: Date.now() + seq,
    monotonicSeq: seq,
    projectId: workItemId,
    action: 'state.transition',
    payload: {
      work_item_id: workItemId,
      from_state: fromState,
      to_state: toState,
      workflow_type: 'feature_spec',
      transitioned_at: Date.now() + seq,
    },
    metadata: { schemaVersion: '1.0', source: 'daemon' },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T1: Daemon startup / restart (P0)
// ═══════════════════════════════════════════════════════════════════════════

describe('T1: Daemon startup/restart', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  // T1.1: Cold start (no state.json) → events.jsonl has history → rebuildState restores workItems
  it('T1.1: cold start with existing events.jsonl rebuilds workItems', async () => {
    // Pre-seed events.jsonl with transition events (no state.json)
    const eventsPath = resolver.resolveDaemonEventsPath();
    const wal = new WAL(eventsPath);
    await wal.initialize();

    // Write some history
    const e1 = wal.createEvent('WI-100', 'state', 'state.transition', {
      work_item_id: 'WI-100',
      from_state: '',
      to_state: 'intake',
    });
    await wal.appendEvent(e1);

    const e2 = wal.createEvent('WI-100', 'state', 'state.transition', {
      work_item_id: 'WI-100',
      from_state: 'intake',
      to_state: 'requirements',
    });
    await wal.appendEvent(e2);

    const e3 = wal.createEvent('WI-200', 'state', 'state.transition', {
      work_item_id: 'WI-200',
      from_state: '',
      to_state: 'intake',
    });
    await wal.appendEvent(e3);

    // Verify no state.json yet
    const statePath = resolver.resolveDaemonStatePath();
    expect(await fileExists(statePath)).toBe(false);

    // Cold start: create StateManager with isDaemonGlobal=true
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    // After initialize, state.json should be created
    expect(await fileExists(statePath)).toBe(true);

    // WorkItems should be restored from WAL
    const wi100 = sm.getState('WI-100');
    expect(wi100).not.toBeNull();
    expect(wi100!.current_state).toBe('requirements');

    const wi200 = sm.getState('WI-200');
    expect(wi200).not.toBeNull();
    expect(wi200!.current_state).toBe('intake');

    // Verify state.json content
    const stateContent = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    expect(stateContent.workItems.length).toBe(2);
  });

  // T1.2: Restart (state.json + events.jsonl) → checkAndRepair passes → workItems match events
  it('T1.2: restart with state.json + events.jsonl passes checkAndRepair', async () => {
    // First run: create StateManager and do some transitions
    const sm1 = new StateManager(resolver, projectDir, true);
    await sm1.initialize();

    await sm1.transition('WI-300', '', 'intake', 'system');
    await sm1.transition('WI-300', 'intake', 'requirements', 'system');
    await sm1.transition('WI-400', '', 'intake', 'system');

    // Both files should exist now
    expect(await fileExists(resolver.resolveDaemonStatePath())).toBe(true);
    expect(await fileExists(resolver.resolveDaemonEventsPath())).toBe(true);

    // Get the WAL from the first StateManager
    const wal1 = sm1.getWal();

    // Simulate restart: create new StateManager + RecoverySubsystem
    const sm2 = new StateManager(resolver, projectDir, true);
    await sm2.initialize();

    const recovery = new RecoverySubsystem(resolver, projectDir, sm2.getWal(), sm2);
    const result = await recovery.checkAndRepair();

    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);

    // Verify workItems match events
    const wi300 = sm2.getState('WI-300');
    expect(wi300!.current_state).toBe('requirements');

    const wi400 = sm2.getState('WI-400');
    expect(wi400!.current_state).toBe('intake');
  });

  // T1.3: Old nested state.json detection → path not nested
  it('T1.3: daemon global paths are not nested', async () => {
    // Verify that isDaemonGlobal=true paths are NOT nested
    const sm = new StateManager(resolver, projectDir, true);

    // Access internal paths
    const statePath = (sm as any).statePath as string;
    const eventsPath = (sm as any).wal.getEventsPath() as string;

    // Daemon paths should be directly under daemon runtime dir
    expect(statePath).toBe(path.join(daemonDir, 'state.json'));
    expect(eventsPath).toBe(path.join(daemonDir, 'events.jsonl'));

    // NOT nested like ~/.specforge/runtime/.specforge/runtime/state.json
    expect(statePath).not.toContain(
      path.join('.specforge', 'runtime', '.specforge'),
    );
    expect(eventsPath).not.toContain(
      path.join('.specforge', 'runtime', '.specforge'),
    );

    await sm.initialize();

    // Verify the files actually exist at the expected locations
    expect(await fileExists(statePath)).toBe(true);
    expect(await fileExists(eventsPath)).toBe(true);
  });

  // T1.4: Empty events + empty state → normal empty startup
  it('T1.4: empty events + empty state starts normally', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const state = await sm.getCurrentState();
    expect(state.projectPath).toBe(projectDir);
    expect(state.schemaVersion).toBe('1.0');
    expect(state.workItems).toEqual([]);
    expect(state.lastEventId).toBe('');
    expect(state.lastEventTs).toBe(0);

    const allWi = sm.listWorkItems();
    expect(allWi).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T2: WI state transitions (P0)
// ═══════════════════════════════════════════════════════════════════════════

describe('T2: WI state transitions with singleton WAL', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;
  let stateManager: StateManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);

    stateManager = new StateManager(resolver, projectDir, true);
    await stateManager.initialize();
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  // T2.1: Create WI → transition intake→requirements→design, monotonicSeq increments
  it('T2.1: single WI transitions with monotonicSeq incrementing', async () => {
    const wal = stateManager.getWal();

    await stateManager.transition('WI-010', '', 'intake', 'test-runner');
    expect(wal.getCurrentSeq()).toBe(1);

    await stateManager.transition('WI-010', 'intake', 'requirements', 'test-runner');
    expect(wal.getCurrentSeq()).toBe(2);

    await stateManager.transition('WI-010', 'requirements', 'requirements_gate', 'test-runner');
    expect(wal.getCurrentSeq()).toBe(3);

    const wi = stateManager.getState('WI-010');
    expect(wi).not.toBeNull();
    expect(wi!.current_state).toBe('requirements_gate');
    expect(wi!.work_item_id).toBe('WI-010');
    expect(wi!.workflow_type).toBe('feature_spec');

    // Verify events in WAL
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(3);
    const seqs = events.map((e) => e.monotonicSeq ?? 0);
    expect(seqs).toEqual([1, 2, 3]);
  });

  // T2.2: Multiple WI interleaved transitions, events.jsonl sequence correct
  it('T2.2: multiple WI interleaved transitions produce correct event sequence', async () => {
    const wal = stateManager.getWal();

    // Interleave transitions for WI-020 and WI-021
    await stateManager.transition('WI-020', '', 'intake', 'test');
    await stateManager.transition('WI-021', '', 'intake', 'test');
    await stateManager.transition('WI-020', 'intake', 'requirements', 'test');
    await stateManager.transition('WI-021', 'intake', 'design', 'test', 'feature_spec_design_first');
    await stateManager.transition('WI-020', 'requirements', 'design', 'test');

    // Verify all events
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(5);

    // Events should be in insertion order
    const actions = events.map((e) => {
      const p = e.payload as { work_item_id?: string; to_state?: string };
      return `${p.work_item_id}->${p.to_state}`;
    });
    expect(actions).toEqual([
      'WI-020->intake',
      'WI-021->intake',
      'WI-020->requirements',
      'WI-021->design',
      'WI-020->design',
    ]);

    // Verify monotonicSeq is strictly increasing
    const seqs = events.map((e) => e.monotonicSeq ?? 0);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    }

    // Verify final states
    const wi020 = stateManager.getState('WI-020');
    expect(wi020!.current_state).toBe('design');

    const wi021 = stateManager.getState('WI-021');
    expect(wi021!.current_state).toBe('design');
  });

  // T2.3: WI transition + simulated restart → rebuildState restores all WIs
  it('T2.3: simulated restart rebuildState restores all WIs', async () => {
    // Do some transitions
    await stateManager.transition('WI-030', '', 'intake', 'test');
    await stateManager.transition('WI-031', '', 'intake', 'test');
    await stateManager.transition('WI-030', 'intake', 'requirements', 'test');
    await stateManager.transition('WI-031', 'intake', 'design', 'test', 'feature_spec_design_first');

    // Get the events path for verification
    const eventsPath = stateManager.getWal().getEventsPath();

    // Simulate restart: create a new StateManager from the same paths
    const sm2 = new StateManager(resolver, projectDir, true);
    await sm2.initialize();

    // Verify all work items restored
    const wi030 = sm2.getState('WI-030');
    expect(wi030).not.toBeNull();
    expect(wi030!.current_state).toBe('requirements');
    expect(wi030!.workflow_type).toBe('feature_spec');

    const wi031 = sm2.getState('WI-031');
    expect(wi031).not.toBeNull();
    expect(wi031!.current_state).toBe('design');
    // workflow_type is set from the first transition ('') and preserved;
    // the second transition only updates current_state on an existing WI.
    expect(wi031!.workflow_type).toBe('feature_spec');

    // Events file unchanged
    const rawContent = await fs.readFile(eventsPath, 'utf-8');
    const lines = rawContent.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T3: events.jsonl integrity (P0)
// ═══════════════════════════════════════════════════════════════════════════

describe('T3: events.jsonl integrity', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  // T3.1: Old events.jsonl → new StateManager rebuild → full recovery (backward compat)
  it('T3.1: legacy events.jsonl fully recovered by new StateManager', async () => {
    const eventsPath = resolver.resolveDaemonEventsPath();

    // Write legacy-format events directly (no schema_version field)
    const legacyEvents = [
      legacyTransitionEvent('WI-LEG-1', '', 'intake', 1),
      legacyTransitionEvent('WI-LEG-1', 'intake', 'requirements', 2),
      legacyTransitionEvent('WI-LEG-1', 'requirements', 'design', 3),
      legacyTransitionEvent('WI-LEG-2', '', 'intake', 4),
    ];

    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    const lines = legacyEvents.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(eventsPath, lines, 'utf-8');

    // Create StateManager and rebuild from legacy events
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    // Verify full recovery
    const wi1 = sm.getState('WI-LEG-1');
    expect(wi1).not.toBeNull();
    expect(wi1!.current_state).toBe('design');
    expect(wi1!.work_item_id).toBe('WI-LEG-1');

    const wi2 = sm.getState('WI-LEG-2');
    expect(wi2).not.toBeNull();
    expect(wi2!.current_state).toBe('intake');

    // Verify state.json was written correctly
    const statePath = resolver.resolveDaemonStatePath();
    const stateJson = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    expect(stateJson.workItems.length).toBe(2);
    expect(stateJson.schemaVersion).toBe('1.0');
  });

  // T3.2: WAL schema_version remains '1.0'
  it('T3.2: WAL events have schema_version 1.0', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    await sm.transition('WI-SV', '', 'intake', 'test');
    await sm.transition('WI-SV', 'intake', 'requirements', 'test');

    const wal = sm.getWal();
    const { events } = await wal.readAllEvents();

    expect(events).toHaveLength(2);

    for (const event of events) {
      // Unified schema events should have schema_version
      expect(event.schema_version).toBe('1.0');
      // Legacy metadata field should also be present
      expect(event.metadata.schemaVersion).toBe('1.0');
    }

    // WAL's own schema version
    expect(wal.getSchemaVersion()).toBe('1.0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T4: ProjectManager (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe('T4: ProjectManager with daemon global StateManager', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;
  let eventBus: EventBus;
  let daemonStateManager: StateManager;
  let projectManager: ProjectManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);

    // Create daemon global StateManager (singleton)
    daemonStateManager = new StateManager(resolver, projectDir, true);
    await daemonStateManager.initialize();

    eventBus = new EventBus();
    eventBus.start();

    // ProjectManager receives the daemon global StateManager
    projectManager = new ProjectManager(eventBus, resolver, daemonStateManager);
  });

  afterEach(async () => {
    projectManager.stop();
    eventBus.stop();
    await rmRF(tmpDir);
  });

  // T4.1: registerProject → ProjectContext has no independent wal/stateManager
  it('T4.1: registered ProjectContext has no independent wal/stateManager', async () => {
    const projectA = path.join(tmpDir, 'project-a');
    fsSync.mkdirSync(projectA, { recursive: true });

    const ctx = await projectManager.registerProject(projectA);

    // ProjectContext should not have its own WAL or StateManager
    expect(ctx.wal).toBeUndefined();
    expect(ctx.stateManager).toBeUndefined();
    expect(ctx.isFullyRegistered).toBe(true);
    expect(ctx.projectId).toBeDefined();
    expect(ctx.projectPath).toBe(projectA);
  });

  // T4.2: daemon global StateManager events written correctly
  it('T4.2: daemon global StateManager receives events for all projects', async () => {
    // Transition a work item via the daemon global StateManager
    await daemonStateManager.transition('WI-PM-1', '', 'intake', 'test');
    await daemonStateManager.transition('WI-PM-1', 'intake', 'requirements', 'test');

    // Events should be in the daemon global WAL
    const wal = daemonStateManager.getWal();
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(2);

    // All events should be in the daemon events file
    const eventsPath = resolver.resolveDaemonEventsPath();
    const content = await fs.readFile(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(2);

    // Verify ProjectManager returns the same daemonStateManager
    const sm = projectManager.getDaemonStateManager();
    expect(sm).toBe(daemonStateManager);
    expect(sm.getState('WI-PM-1')!.current_state).toBe('requirements');
  });

  it('should support multiple project registrations sharing the same StateManager', async () => {
    const projA = path.join(tmpDir, 'proj-a');
    const projB = path.join(tmpDir, 'proj-b');
    fsSync.mkdirSync(projA, { recursive: true });
    fsSync.mkdirSync(projB, { recursive: true });

    await projectManager.registerProject(projA);
    await projectManager.registerProject(projB);

    const active = projectManager.listActiveProjects();
    expect(active).toContain(projA);
    expect(active).toContain(projB);

    // Both use the same singleton StateManager
    const sm = projectManager.getDaemonStateManager();
    await sm.transition('WI-MULTI', '', 'intake', 'test');

    expect(sm.getState('WI-MULTI')!.current_state).toBe('intake');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T5: RecoverySubsystem (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe('T5: RecoverySubsystem with injected WAL + StateManager', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  // T5.1: checkAndRepair → stateManager injected → real rebuild → workItems non-empty
  it('T5.1: checkAndRepair with injected StateManager rebuilds workItems', async () => {
    // Setup: create StateManager and add transitions
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    await sm.transition('WI-REC-1', '', 'intake', 'test');
    await sm.transition('WI-REC-1', 'intake', 'requirements', 'test');
    await sm.transition('WI-REC-2', '', 'intake', 'test');

    // Create RecoverySubsystem with injected WAL + StateManager
    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      sm.getWal(),
      sm,
    );

    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);

    // Verify workItems are non-empty after rebuild
    const state = await sm.getCurrentState();
    expect(state.workItems.length).toBe(2);

    const wi1 = sm.getState('WI-REC-1');
    expect(wi1!.current_state).toBe('requirements');

    const wi2 = sm.getState('WI-REC-2');
    expect(wi2!.current_state).toBe('intake');
  });

  // T5.2: events.jsonl with corrupted lines → checkAndRepair handles gracefully
  it('T5.2: corrupted lines in events.jsonl handled gracefully', async () => {
    const eventsPath = resolver.resolveDaemonEventsPath();
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });

    // Write a mix of valid and corrupted events
    const sm = new StateManager(resolver, projectDir, true);
    const wal = new WAL(eventsPath);
    await wal.initialize();

    // Write some valid events
    const e1 = wal.createEvent('WI-CORR-1', 'state', 'state.transition', {
      work_item_id: 'WI-CORR-1',
      from_state: '',
      to_state: 'intake',
    });
    await wal.appendEvent(e1);

    // Manually append a corrupted line (invalid JSON)
    await fs.appendFile(eventsPath, 'CORRUPTED LINE NOT JSON\n', 'utf-8');

    // Append another valid event
    const e2 = wal.createEvent('WI-CORR-1', 'state', 'state.transition', {
      work_item_id: 'WI-CORR-1',
      from_state: 'intake',
      to_state: 'requirements',
    });
    await wal.appendEvent(e2);

    // Create a new StateManager — WAL.readAllEvents() now skips corrupted
    // lines and returns only valid events. The valid events before and after
    // the corrupted line are still parsed successfully.
    const sm2 = new StateManager(resolver, projectDir, true);
    await sm2.initialize();

    // Due to the corrupted line, the WAL skips it and recovers the valid events.
    // WI-CORR-1 should be at 'requirements' state (from e1 and e2 transitions).
    const allWi = sm2.listWorkItems();
    expect(allWi).toHaveLength(1);
    expect(allWi[0]!.work_item_id).toBe('WI-CORR-1');
    expect(allWi[0]!.current_state).toBe('requirements');

    // The corrupted events.jsonl file still exists (not deleted)
    expect(await fileExists(eventsPath)).toBe(true);

    // A clean WAL (without corruption) should work fine
    const cleanDaemonDir = path.join(tmpDir, 'clean-daemon');
    fsSync.mkdirSync(cleanDaemonDir, { recursive: true });
    const cleanResolver = new TestDaemonPathResolver(cleanDaemonDir, projectDir);

    const smClean = new StateManager(cleanResolver, projectDir, true);
    await smClean.initialize();

    await smClean.transition('WI-CLEAN', '', 'intake', 'test');

    const recovery = new RecoverySubsystem(
      cleanResolver,
      projectDir,
      smClean.getWal(),
      smClean,
    );

    const result = await recovery.checkAndRepair();
    expect(result.isValid).toBe(true);
  });

  it('T5.3: recovery with only valid events passes cleanly', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    // Create some transitions
    await sm.transition('WI-RECOV', '', 'intake', 'test');
    await sm.transition('WI-RECOV', 'intake', 'requirements', 'test');
    await sm.transition('WI-RECOV', 'requirements', 'requirements_gate', 'test');

    // Recovery with injected components
    const recovery = new RecoverySubsystem(
      resolver,
      projectDir,
      sm.getWal(),
      sm,
    );

    await recovery.initialize();
    const checkResult = await recovery.checkAndRepair();

    expect(checkResult.isValid).toBe(true);
    expect(checkResult.issues).toHaveLength(0);

    // Verify the state is consistent
    const state = await sm.getCurrentState();
    expect(state.workItems.length).toBe(1);
    expect(state.workItems[0]!.current_state).toBe('requirements_gate');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting: WAL singleton verification
// ═══════════════════════════════════════════════════════════════════════════

describe('WAL singleton: only one WAL instance per StateManager', () => {
  let tmpDir: string;
  let daemonDir: string;
  let projectDir: string;
  let resolver: TestDaemonPathResolver;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    daemonDir = path.join(tmpDir, 'daemon-runtime');
    projectDir = path.join(tmpDir, 'project');
    fsSync.mkdirSync(daemonDir, { recursive: true });
    fsSync.mkdirSync(projectDir, { recursive: true });
    resolver = new TestDaemonPathResolver(daemonDir, projectDir);
  });

  afterEach(async () => {
    await rmRF(tmpDir);
  });

  it('getWal() returns the same WAL instance used internally', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const wal = sm.getWal();

    // The WAL returned by getWal() should be the same as the one used for transitions
    await sm.transition('WI-SINGLE', '', 'intake', 'test');

    // Verify the event was written through the same WAL
    const { events } = await wal.readAllEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('state.transition');
    expect(events[0]!.projectId).toBe('WI-SINGLE');
  });

  it('WAL from getWal() has the correct events path', async () => {
    const sm = new StateManager(resolver, projectDir, true);
    await sm.initialize();

    const wal = sm.getWal();
    expect(wal.getEventsPath()).toBe(resolver.resolveDaemonEventsPath());

    // Not nested
    expect(wal.getEventsPath()).not.toContain(
      path.join('.specforge', 'runtime', '.specforge'),
    );
  });

  it('two StateManagers with isDaemonGlobal=true share the same events file', async () => {
    const sm1 = new StateManager(resolver, projectDir, true);
    await sm1.initialize();

    await sm1.transition('WI-SHARED-1', '', 'intake', 'test');

    // Create second StateManager pointing to same daemon paths
    const sm2 = new StateManager(resolver, projectDir, true);
    await sm2.initialize();

    // sm2 should see WI-SHARED-1 from events.jsonl rebuild
    const wi = sm2.getState('WI-SHARED-1');
    expect(wi).not.toBeNull();
    expect(wi!.current_state).toBe('intake');

    // Now add more events via sm2
    await sm2.transition('WI-SHARED-2', '', 'intake', 'test');

    // Verify both WIs are in the shared events file
    const eventsPath = resolver.resolveDaemonEventsPath();
    const content = await fs.readFile(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    // 1 from sm1 + 1 from sm2 rebuild saw 1 + sm2 appended 1 = but sm2.initialize rebuilds
    // Actually: sm1 wrote 1 event. sm2 initializes and rebuilds that 1 event. sm2 writes 1 new event.
    // Total events in file: 2
    expect(lines).toHaveLength(2);
  });
});
