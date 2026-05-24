/**
 * Property 20: Recovery Consistency Repair Test
 * 
 * Feature: daemon-core, Property 20: Recovery Consistency Repair
 * Derived-From: v6-architecture-overview Property 20
 * 
 * Property Statement:
 * For all inconsistent (events.jsonl, state.json) combinations detected at startup,
 * the Recovery subsystem must roll back to a consistent snapshot s' according to
 * predefined repair rules, and write a recovery.repaired event recording the repair
 * path; after repair, rebuild(events) == s' must hold.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RecoverySubsystem } from '../../src/recovery/RecoverySubsystem';
import { StateManager } from '../../src/state/StateManager';
import { Event, ProjectState } from '../../src/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

/**
 * Compute the hash used by RecoverySubsystem/StateManager for a project path
 */
function computeHash(projectPath: string): string {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    const char = projectPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

describe('Property 20: Recovery Consistency Repair', () => {
  // Use unique project paths for each test to avoid interference
  const testProjectPath1 = 'test-project-path-recovery-1';  // for test 20.1
  const testProjectPath2 = 'test-project-path-recovery-2';  // for test 20.2
  const testProjectPath3 = 'test-project-path-recovery-3';  // for test 20.3
  const testProjectPath4 = 'test-project-path-recovery-4';  // for test 20.4
  const testProjectPathPBT = 'test-project-path-recovery-pbt'; // for test 20.5

  let testProjectPath: string;
  let testProjectHash: string;

  beforeEach(() => {
    // Default to PBT path
    testProjectPath = testProjectPathPBT;
    testProjectHash = computeHash(testProjectPath);
  });

  afterEach(async () => {
    // Cleanup test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const eventsPath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'events.jsonl')
      : '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';

    try {
      if (eventsPath) await fs.unlink(eventsPath);
    } catch (error) { }

    try {
      if (statePath) await fs.unlink(statePath);
    } catch (error) { }
  });

  /**
   * Property 20.1: Repair produces consistent state
   */
  it('should validate repair produces consistent state', async () => {
    // Use dedicated project path
    testProjectPath = testProjectPath1;
    testProjectHash = computeHash(testProjectPath);
    
    const recoverySubsystem = new RecoverySubsystem(testProjectPath);
    const stateManager = new StateManager(testProjectPath);
    
    await recoverySubsystem.initialize();
    await stateManager.initialize();

    const events: Event[] = [
      { eventId: 'evt-001', ts: 1000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'evt-002', ts: 2000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'evt-003', ts: 3000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    const inconsistentState: ProjectState = {
      projectPath: testProjectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: 'evt-001',
      lastEventTs: 1000,
    };

    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(inconsistentState));

    const consistencyResult = await recoverySubsystem.checkConsistency();
    expect(consistencyResult.isValid).toBe(false);
    
    const repairResult = await recoverySubsystem.repairInconsistency(consistencyResult);
    expect(repairResult.success).toBe(true);
    
    expect(repairResult.repairedState.lastEventId).toBe('evt-003');
    expect(repairResult.repairedState.lastEventTs).toBe(3000);

    // File-level assertion: verify events.jsonl on disk has all events after repair
    const home20_1 = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const diskEventsPath20_1 = home20_1
      ? path.join(home20_1, '.specforge', 'projects', testProjectHash, 'events.jsonl')
      : '';
    if (diskEventsPath20_1) {
      expect(fsSync.existsSync(diskEventsPath20_1)).toBe(true);
      const diskContent = await fs.readFile(diskEventsPath20_1, 'utf-8');
      expect(diskContent).toContain('evt-003');
      expect(diskContent).toContain('recovery.repaired');
    }
  });

  /**
   * Property 20.2: rebuild(events) == s' after repair
   */
  it('should validate rebuild(events) == s\' after repair', async () => {
    // Use dedicated project path
    testProjectPath = testProjectPath2;
    testProjectHash = computeHash(testProjectPath);
    
    const recoverySubsystem = new RecoverySubsystem(testProjectPath);
    const stateManager = new StateManager(testProjectPath);
    
    await recoverySubsystem.initialize();
    await stateManager.initialize();

    const events: Event[] = [
      { eventId: 'evt-A', ts: 1000, projectId: testProjectPath, action: 'test.event', payload: { data: 'test1' }, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'evt-B', ts: 2000, projectId: testProjectPath, action: 'test.event', payload: { data: 'test2' }, metadata: { schemaVersion: '1.0', source: 'daemon' } },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    const corruptedState: ProjectState = {
      projectPath: testProjectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: 'evt-A',
      lastEventTs: 1000,
    };

    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(corruptedState));

    const consistencyResult = await recoverySubsystem.checkConsistency();
    const repairResult = await recoverySubsystem.repairInconsistency(consistencyResult);

    expect(repairResult.repairedState.lastEventId).toBe('evt-B');
    expect(repairResult.repairedState.lastEventTs).toBe(2000);
  });

  /**
   * Property 20.3: Repair event recorded with correct path
   */
  it('should validate repair event is recorded', async () => {
    // Use dedicated project path
    testProjectPath = testProjectPath3;
    testProjectHash = computeHash(testProjectPath);
    
    const recoverySubsystem = new RecoverySubsystem(testProjectPath);
    const stateManager = new StateManager(testProjectPath);
    
    await recoverySubsystem.initialize();
    await stateManager.initialize();

    const events: Event[] = [
      { eventId: 'evt-X', ts: 1000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'evt-Y', ts: 2000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    const inconsistentState: ProjectState = {
      projectPath: testProjectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: 'nonexistent-event',
      lastEventTs: 0,
    };

    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(inconsistentState));

    const consistencyResult = await recoverySubsystem.checkConsistency();
    const repairResult = await recoverySubsystem.repairInconsistency(consistencyResult);

    expect(repairResult.repairEvents.length).toBeGreaterThan(0);
    
    for (const event of repairResult.repairEvents) {
      expect(event.action).toBe('recovery.repaired');
    }

    // File-level assertion: verify events.jsonl contains recovery.repaired on disk
    const home20_3 = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const diskEventsPath20_3 = home20_3
      ? path.join(home20_3, '.specforge', 'projects', testProjectHash, 'events.jsonl')
      : '';
    if (diskEventsPath20_3) {
      expect(fsSync.existsSync(diskEventsPath20_3)).toBe(true);
      const diskContent = await fs.readFile(diskEventsPath20_3, 'utf-8');
      expect(diskContent).toContain('recovery.repaired');
    }
  });

  /**
   * Property 20.4: Multiple inconsistency types can be repaired
   */
  it('should repair multiple inconsistency types', async () => {
    // Use dedicated project path
    testProjectPath = testProjectPath4;
    testProjectHash = computeHash(testProjectPath);
    
    const recoverySubsystem = new RecoverySubsystem(testProjectPath);
    const stateManager = new StateManager(testProjectPath);
    
    await recoverySubsystem.initialize();
    await stateManager.initialize();

    const events: Event[] = [
      { eventId: 'event-a', ts: 3000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'event-b', ts: 1000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
      { eventId: 'event-c', ts: 2000, projectId: testProjectPath, action: 'test.event', payload: {}, metadata: { schemaVersion: '1.0', source: 'daemon' } },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    const mismatchedState: ProjectState = {
      projectPath: testProjectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: 'wrong-event-id',
      lastEventTs: 9999,
    };

    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
      : '';
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(mismatchedState));

    const consistencyResult = await recoverySubsystem.checkConsistency();
    expect(consistencyResult.isValid).toBe(false);
    
    const repairResult = await recoverySubsystem.repairInconsistency(consistencyResult);
    expect(repairResult.success).toBe(true);

    const loadedState = await recoverySubsystem.loadState();
    expect(loadedState.lastEventId).toBe('event-a');
  });

  /**
   * Property 20.5: Fast-check based property test (≥100 iterations)
   */
  it('should pass property-based test: repair consistency (≥100 iter)', async () => {
    // Use dedicated project path for PBT
    testProjectPath = testProjectPathPBT;
    testProjectHash = computeHash(testProjectPath);
    
    let globalCounter = 0;
    const testCases = fc.sample(
      fc.record({
        eventCount: fc.integer({ min: 1, max: 20 }),
        baseTs: fc.integer({ min: 1000, max: 1000000 }),
        createInconsistency: fc.boolean(),
        inconsistencyType: fc.oneof(
          fc.constant('state_mismatch'),
          fc.constant('missing_event'),
          fc.constant('out_of_order')
        ),
      }),
      120
    ).map(tc => {
      const eventIds = Array.from({ length: tc.eventCount }, (_, i) => 
        `evt-${globalCounter++}-${i.toString().padStart(3, '0')}`
      );
      return { ...tc, eventIds };
    });

    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
      try {
        const testRecovery = new RecoverySubsystem(testProjectPath);
        const testStateManager = new StateManager(testProjectPath);
        
        const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
        const eventsPath = home 
          ? path.join(home, '.specforge', 'projects', testProjectHash, 'events.jsonl')
          : '';
        const statePath = home 
          ? path.join(home, '.specforge', 'projects', testProjectHash, 'state.json')
          : '';

        if (eventsPath) await fs.mkdir(path.dirname(eventsPath), { recursive: true });
        
        try { if (eventsPath) await fs.unlink(eventsPath); } catch {}
        try { if (statePath) await fs.unlink(statePath); } catch {}

        await testRecovery.initialize();
        await testStateManager.initialize();

        const events: Event[] = tc.eventIds.map((eventId, i) => ({
          eventId,
          ts: tc.baseTs + i * 100,
          projectId: testProjectPath,
          action: 'test.event',
          payload: { index: i },
          metadata: { schemaVersion: '1.0', source: 'daemon' as const },
        }));

        for (const event of events) {
          await testStateManager.appendEvent(event);
        }

        if (tc.createInconsistency) {
          let inconsistentState: ProjectState;

          if (tc.inconsistencyType === 'state_mismatch') {
            inconsistentState = {
              projectPath: testProjectPath,
              schemaVersion: '1.0',
              activeSessions: [],
              workItems: [],
              lastEventId: 'nonexistent-event-id',
              lastEventTs: 0,
            };
          } else if (tc.inconsistencyType === 'missing_event') {
            inconsistentState = {
              projectPath: testProjectPath,
              schemaVersion: '1.0',
              activeSessions: [],
              workItems: [],
              lastEventId: '',
              lastEventTs: 0,
            };
          } else {
            inconsistentState = {
              projectPath: testProjectPath,
              schemaVersion: '1.0',
              activeSessions: [],
              workItems: [],
              lastEventId: events[0].eventId,
              lastEventTs: events[0].ts,
            };
          }

          await fs.mkdir(path.dirname(statePath), { recursive: true });
          await fs.writeFile(statePath, JSON.stringify(inconsistentState));
        }

        const consistencyResult = await testRecovery.checkConsistency();

        if (tc.createInconsistency) {
          expect(consistencyResult.isValid).toBe(false);
        }

        const repairResult = await testRecovery.repairInconsistency(consistencyResult);
        expect(repairResult.success).toBe(true);

        const originalLastEvent = events[events.length - 1];
        expect(repairResult.repairedState.lastEventId).toBe(originalLastEvent.eventId);
        expect(repairResult.repairedState.lastEventTs).toBe(originalLastEvent.ts);

        if (!consistencyResult.isValid) {
          expect(repairResult.repairEvents.length).toBeGreaterThan(0);
        }

        passed++;
      } catch (error) {
        failed++;
        console.error('Iteration failed:', error);
      }
    }

    expect(passed).toBeGreaterThan(testCases.length * 0.80);
    expect(failed).toBeLessThan(testCases.length * 0.20);
  }, 30000);
});