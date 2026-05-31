/**
 * State Manager unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './StateManager';
import { EnterprisePathResolver } from '../daemon/path-resolver';
import type { Event } from '../types';
import * as path from 'path';

describe('StateManager', () => {
  let stateManager: StateManager;
  const testProjectPath = 'test-project';
  const pathResolver = new EnterprisePathResolver();

  beforeEach(() => {
    stateManager = new StateManager(pathResolver, testProjectPath);
  });

  afterEach(async () => {
    // Cleanup test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const projectHash = 'testproj';
    const eventsPath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'events.jsonl')
      : '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'state.json')
      : '';
    
    if (eventsPath) {
      try {
        await import('fs/promises').then(fs => fs.unlink(eventsPath));
      } catch (error) {
        // File might not exist
      }
    }
    
    if (statePath) {
      try {
        await import('fs/promises').then(fs => fs.unlink(statePath));
      } catch (error) {
        // File might not exist
      }
    }
  });

  it('should initialize state manager', async () => {
    await expect(stateManager.initialize()).resolves.not.toThrow();
  });

  it('should append events', async () => {
    await stateManager.initialize();
    
    const event: Event = {
      eventId: '1',
      ts: Date.now(),
      projectId: testProjectPath,
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
      await stateManager.transition(wiId, '', 'intake', 'test');
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
            workflow_type: 'bugfix_spec',
            current_state: 'completed',
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
