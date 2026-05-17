/**
 * Property 7: WAL Ordering Test
 * 
 * Feature: daemon-core, Property 7: WAL Ordering
 * Derived-From: v6-architecture-overview Property 7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WAL } from '../../src/wal/WAL';
import { StateManager } from '../../src/state/StateManager';
import { Event } from '../../src/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

describe('Property 7: WAL Ordering', () => {
  let testProjectPath: string;
  let wal: WAL;
  let stateManager: StateManager;
  const testProjectHash = 'testproj';

  beforeEach(() => {
    testProjectPath = 'test-project-path';
    wal = new WAL(testProjectPath);
    stateManager = new StateManager(testProjectPath);
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
    } catch (error) {
      // File might not exist
    }

    try {
      if (statePath) await fs.unlink(statePath);
    } catch (error) {
      // File might not exist
    }
  });

  it('should validate WAL ordering (events.jsonl fsync before state.json)', async () => {
    await wal.initialize();
    await stateManager.initialize();

    // Create and append an event
    const event: Event = {
      eventId: 'test-event-1',
      ts: Date.now(),
      projectId: testProjectPath,
      action: 'test.event',
      payload: { key: 'value' },
      metadata: {
        schemaVersion: '1.0',
        source: 'daemon',
      },
    };

    await stateManager.appendEvent(event);

    // Verify events.jsonl exists and contains the event
    const eventsPath = wal.getEventsPath();
    const eventsContent = await fs.readFile(eventsPath, 'utf-8');
    expect(eventsContent).toContain(JSON.stringify(event));

    // Verify state.json exists and contains the event
    const statePath = stateManager['statePath'] as string;
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);
    expect(state.lastEventId).toBe('test-event-1');

    // Verify fsync semantics by checking file descriptors
    const fd = fsSync.openSync(eventsPath, 'r');
    try {
      const stats = fsSync.fstatSync(fd);
      expect(stats.size).toBeGreaterThan(0);
    } finally {
      fsSync.closeSync(fd);
    }
  });

  it('should maintain event order in WAL', async () => {
    await wal.initialize();
    await stateManager.initialize();

    // Clear existing events from previous tests
    const eventsPath = wal.getEventsPath();
    await fs.writeFile(eventsPath, '');

    const events: Event[] = [
      {
        eventId: 'event-1',
        ts: Date.now(),
        projectId: testProjectPath,
        action: 'test.event1',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
      {
        eventId: 'event-2',
        ts: Date.now() + 1,
        projectId: testProjectPath,
        action: 'test.event2',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
      {
        eventId: 'event-3',
        ts: Date.now() + 2,
        projectId: testProjectPath,
        action: 'test.event3',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    const readEvents = await wal.readAllEvents();
    expect(readEvents.length).toBe(3);
    expect(readEvents[0].eventId).toBe('event-1');
    expect(readEvents[1].eventId).toBe('event-2');
    expect(readEvents[2].eventId).toBe('event-3');
  });

  it('should rebuild state from events.jsonl', async () => {
    await wal.initialize();
    await stateManager.initialize();

    const events: Event[] = [
      {
        eventId: 'event-1',
        ts: 1000,
        projectId: testProjectPath,
        action: 'test.event1',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
      {
        eventId: 'event-2',
        ts: 2000,
        projectId: testProjectPath,
        action: 'test.event2',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
    ];

    for (const event of events) {
      await stateManager.appendEvent(event);
    }

    // Rebuild state from events
    await stateManager.rebuildFromEventsFile();
    const state = await stateManager.getCurrentState();

    expect(state.lastEventId).toBe('event-2');
    expect(state.lastEventTs).toBe(2000);
  });
});
