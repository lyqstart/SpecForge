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
});
