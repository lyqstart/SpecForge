/**
 * State Manager unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './StateManager';
import { PersonalPathResolver } from '../daemon/path-resolver';
import type { Event } from '../types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('StateManager', () => {
  let stateManager: StateManager;
  let testProjectPath: string;
  const pathResolver = new PersonalPathResolver();

  beforeEach(async () => {
    testProjectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'specforge-state-source-test-'));
    stateManager = new StateManager(pathResolver, testProjectPath);
  });

  afterEach(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  it('should initialize state manager', async () => {
    await expect(stateManager.initialize()).resolves.not.toThrow();
  });

  it('should append events', async () => {
    await stateManager.initialize();
    
    const event: Event = {
      schema_version: '1.0',
      eventId: '1',
      ts: Date.now(),
      monotonicSeq: 1,
      projectId: testProjectPath,
      actor: 'test',
      category: 'state',
      action: 'test.event',
      payload: {},
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };
    
    await expect(stateManager.appendEvent(event)).resolves.not.toThrow();
  });

  it('should get current state', async () => {
    await stateManager.initialize();
    
    const state = await stateManager.getCurrentState();
    
    expect(state.projectPath).toBe(testProjectPath);
    // TASK-1: stateVersion should be present in ProjectState
    expect(state).toHaveProperty('stateVersion');
    expect(typeof state.stateVersion).toBe('number');
    expect(state.stateVersion).toBeGreaterThanOrEqual(0);
  });

  it('should rebuild from events', async () => {
    const events: Event[] = [
      {
        eventId: '1',
        ts: Date.now(),
        projectId: testProjectPath,
        action: 'test.event',
        payload: {},
        metadata: {
          schemaVersion: '1.0',
          source: 'daemon',
        },
      },
    ];
    
    const state = await stateManager.rebuildFromEvents(events);
    
    expect(state.projectPath).toBe(testProjectPath);
    expect(state.lastEventId).toBe('1');
  });

  // ═══════════════════════════════════════════════════
  //  TASK-1: Optimistic concurrency control tests
  // ═══════════════════════════════════════════════════

  describe('Optimistic Concurrency Control (TASK-1)', () => {
    it('should increment stateVersion on each writeStateFile call', async () => {
      await stateManager.initialize();
      const state1 = await stateManager.getCurrentState();
      const v1 = state1.stateVersion;

      // Use unique Work Item ID to avoid collision with prior test state in WAL
      const wiId = `WI-T01-${Date.now()}`;
      await stateManager.transition(wiId, '', 'created', 'test');
      const state2 = await stateManager.getCurrentState();
      expect(state2.stateVersion).toBeGreaterThan(v1);
    });

    it('should have persistStateFromExternal method', () => {
      expect(typeof (stateManager as any).persistStateFromExternal).toBe('function');
    });

    it('persistStateFromExternal should sync in-memory state and write', async () => {
      await stateManager.initialize();

      const externalState = {
        stateVersion: 0,
        projectPath: testProjectPath,
        schemaVersion: '1.0',
        activeSessions: [],
        workItems: [
          {
            work_item_id: 'WI-EXT-T01',
            workflow_type: 'feature_spec',
            current_state: 'intake_ready',
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        lastEventId: 'ext-ev-1',
        lastEventTs: Date.now(),
      };

      await (stateManager as any).persistStateFromExternal(externalState);

      const state = await stateManager.getCurrentState();
      expect(state.workItems.some((wi: any) => wi.work_item_id === 'WI-EXT-T01')).toBe(true);
      expect(state.lastEventId).toBe('ext-ev-1');
    });
  });
});
