/**
 * State Manager unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from '../../src/state/StateManager';
import { Event, ProjectState } from '../../src/types';

describe('StateManager', () => {
  let stateManager: StateManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `state-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    stateManager = new StateManager(tempDir);
    await stateManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should create state.json on initialization', async () => {
      const statePath = (stateManager as any).statePath;
      await fs.access(statePath);
    });

    it('should initialize with empty state for new project', async () => {
      const state = await stateManager.getCurrentState();
      
      expect(state.projectPath).toBe(tempDir);
      expect(state.schemaVersion).toBe('1.0');
      expect(state.activeSessions).toEqual([]);
      expect(state.workItems).toEqual([]);
      expect(state.lastEventId).toBe('');
      expect(state.lastEventTs).toBe(0);
    });

    it('should load existing state.json on initialization', async () => {
      // Get the state path from the initialized state manager
      const statePath = (stateManager as any).statePath;
      
      // Write a state file directly
      await fs.writeFile(statePath, JSON.stringify({
        projectPath: tempDir,
        schemaVersion: '1.0',
        activeSessions: ['session-1'],
        workItems: [],
        lastEventId: 'event-1',
        lastEventTs: 1000,
      }));
      
      // Create new state manager - should load from state file
      const newStateManager = new StateManager(tempDir);
      await newStateManager.initialize();
      
      const state = await newStateManager.getCurrentState();
      expect(state.lastEventId).toBe('event-1');
      expect(state.activeSessions).toEqual(['session-1']);
    });
  });

  describe('appendEvent', () => {
    it('should update state after appending event', async () => {
      const event: Event = {
        eventId: 'event-1',
        ts: 1000,
        projectId: 'test-project',
        action: 'test.action',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      };
      
      await stateManager.appendEvent(event);
      
      const state = await stateManager.getCurrentState();
      expect(state.lastEventId).toBe('event-1');
      expect(state.lastEventTs).toBe(1000);
    });

    it('should update state for multiple events', async () => {
      await stateManager.appendEvent({
        eventId: 'event-1',
        ts: 1000,
        projectId: 'test',
        action: 'action1',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      });
      
      await stateManager.appendEvent({
        eventId: 'event-2',
        ts: 2000,
        projectId: 'test',
        action: 'action2',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      });
      
      const state = await stateManager.getCurrentState();
      expect(state.lastEventId).toBe('event-2');
      expect(state.lastEventTs).toBe(2000);
    });

    it('should maintain WAL ordering (event first, then state)', async () => {
      // This test verifies the WAL ordering property is maintained
      const event1 = {
        eventId: 'event-1',
        ts: 1000,
        projectId: 'test',
        action: 'action1',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      };
      
      await stateManager.appendEvent(event1);
      
      // Verify state reflects the event
      const state = await stateManager.getCurrentState();
      expect(state.lastEventId).toBe('event-1');
      
      // Verify event was written to WAL
      const wal = (stateManager as any).wal;
      const events = await wal.readAllEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventId).toBe('event-1');
    });
  });

  describe('rebuildFromEvents', () => {
    it('should rebuild state from empty events', async () => {
      const state = await stateManager.rebuildFromEvents([]);
      
      expect(state.projectPath).toBe(tempDir);
      expect(state.lastEventId).toBe('');
      expect(state.lastEventTs).toBe(0);
    });

    it('should rebuild state from single event', async () => {
      const events: Event[] = [{
        eventId: 'event-1',
        ts: 1000,
        projectId: 'test',
        action: 'action',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      }];
      
      const state = await stateManager.rebuildFromEvents(events);
      
      expect(state.lastEventId).toBe('event-1');
      expect(state.lastEventTs).toBe(1000);
    });

    it('should rebuild state from multiple events', async () => {
      const events: Event[] = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'test',
          action: 'action1',
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'test' },
        },
        {
          eventId: 'event-2',
          ts: 2000,
          projectId: 'test',
          action: 'action2',
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'test' },
        },
      ];
      
      const state = await stateManager.rebuildFromEvents(events);
      
      // Should use last event's data
      expect(state.lastEventId).toBe('event-2');
      expect(state.lastEventTs).toBe(2000);
    });

    it('should handle events with missing optional fields', async () => {
      const events: Event[] = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'test',
          action: 'action',
          // No payload, no metadata
        } as Event,
      ];
      
      const state = await stateManager.rebuildFromEvents(events);
      
      expect(state.lastEventId).toBe('event-1');
    });

    it('should produce identical state for same events (idempotence)', async () => {
      const events: Event[] = [
        { eventId: 'e1', ts: 1000, projectId: 'p', action: 'a', payload: {}, metadata: { schemaVersion: '1.0', source: 'test' } },
        { eventId: 'e2', ts: 2000, projectId: 'p', action: 'a', payload: {}, metadata: { schemaVersion: '1.0', source: 'test' } },
      ];
      
      const state1 = await stateManager.rebuildFromEvents(events);
      const state2 = await stateManager.rebuildFromEvents(events);
      
      // Core state should be identical
      expect(state1.lastEventId).toBe(state2.lastEventId);
      expect(state1.lastEventTs).toBe(state2.lastEventTs);
      expect(state1.projectPath).toBe(state2.projectPath);
    });
  });

  describe('getCurrentState', () => {
    it('should return current state', async () => {
      const state = await stateManager.getCurrentState();
      
      expect(state).toBeDefined();
      expect(state.projectPath).toBe(tempDir);
    });

    it('should reflect updates from appendEvent', async () => {
      await stateManager.appendEvent({
        eventId: 'test-event',
        ts: 5000,
        projectId: 'test',
        action: 'test',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'test' },
      });
      
      const state = await stateManager.getCurrentState();
      expect(state.lastEventId).toBe('test-event');
    });
  });
});