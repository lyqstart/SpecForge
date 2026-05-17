/**
 * Recovery Subsystem unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecoverySubsystem } from './RecoverySubsystem';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('RecoverySubsystem', () => {
  let subsystem: RecoverySubsystem;
  let testProjectPath: string;

  beforeEach(() => {
    testProjectPath = 'test-project-path-recovery';
    subsystem = new RecoverySubsystem(testProjectPath);
  });

  afterEach(async () => {
    // Cleanup test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const projectHash = 'testprojec'; // hash of 'test-project-path-recovery'
    const eventsPath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'events.jsonl')
      : '';
    const statePath = home 
      ? path.join(home, '.specforge', 'projects', projectHash, 'state.json')
      : '';

    try {
      if (eventsPath) await fs.unlink(eventsPath);
    } catch (error) {
      // File might not exist
    }

    try {
      if (statePath) await fs.unlink(statePath);
    } catch (error) {
      // File might not exist
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
});
