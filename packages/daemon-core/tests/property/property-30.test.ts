/**
 * Property 30: Event Schema Multi-sync Readiness Test
 * 
 * Feature: daemon-core, Property 30: Event Schema Multi-sync Readiness
 * Derived-From: v6-architecture-overview Property 30
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { WAL } from '../../src/wal/WAL';
import { Event } from '../../src/types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

describe('Property 30: Event Schema Multi-sync Readiness', () => {
  let testProjectPath: string;
  let wal: WAL;
  const testProjectHash = 'testproj';

  beforeEach(() => {
    testProjectPath = 'test-project-path';
    wal = new WAL(testProjectPath);
  });

  afterEach(async () => {
    // Cleanup test files
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const eventsPath = home 
      ? path.join(home, '.specforge', 'projects', testProjectHash, 'events.jsonl')
      : '';

    try {
      if (eventsPath) await fs.unlink(eventsPath);
    } catch (error) {
      // File might not exist
    }
  });

  /**
   * Property 30.1: eventId must be globally unique (UUIDv7)
   * Validates: Requirements 6.1
   */
  it('should generate globally unique eventIds (UUIDv7)', async () => {
    await wal.initialize();

    // Generate 1000 events and check for uniqueness
    const eventIds = new Set<string>();
    const numEvents = 1000;

    for (let i = 0; i < numEvents; i++) {
      const event = wal.createEvent(testProjectPath, 'test.event', { index: i });
      eventIds.add(event.eventId);
    }

    // UUIDv7 should be globally unique
    expect(eventIds.size).toBe(numEvents);
  });

  /**
   * Property 30.2: ts must be monotonically non-decreasing within a single machine
   * Validates: Requirements 6.2
   */
  it('should generate monotonically non-decreasing timestamps', async () => {
    await wal.initialize();

    const timestamps: number[] = [];
    const numEvents = 100;

    for (let i = 0; i < numEvents; i++) {
      const event = wal.createEvent(testProjectPath, 'test.event', { index: i });
      timestamps.push(event.ts);
    }

    // Check that timestamps are monotonically non-decreasing
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  /**
   * Property 30.3: projectId must be non-empty and aggregatable
   * Validates: Requirements 6.3
   */
  it('should have non-empty projectId that is aggregatable', async () => {
    await wal.initialize();

    const projectIds = ['project-a', 'project-b', 'project-c'];
    const eventsByProject: Record<string, Event[]> = {};

    for (const projectId of projectIds) {
      eventsByProject[projectId] = [];
      for (let i = 0; i < 10; i++) {
        const event = wal.createEvent(projectId, 'test.event', { index: i });
        eventsByProject[projectId].push(event);
      }
    }

    // Verify projectId is non-empty for all events
    for (const projectId of projectIds) {
      for (const event of eventsByProject[projectId]) {
        expect(event.projectId).toBe(projectId);
        expect(event.projectId).not.toBe('');
      }
    }

    // Verify events can be aggregated by projectId
    for (const projectId of projectIds) {
      const events = eventsByProject[projectId];
      const aggregated = events.filter(e => e.projectId === projectId);
      expect(aggregated.length).toBe(events.length);
    }
  });

  /**
   * Property 30.4: Schema must be forward-compatible
   * Validates: Requirements 6.3
   */
  it('should have forward-compatible schema structure', async () => {
    await wal.initialize();

    const event = wal.createEvent(testProjectPath, 'test.event', { key: 'value' });

    // Verify all required fields are present
    expect(event).toHaveProperty('eventId');
    expect(event).toHaveProperty('ts');
    expect(event).toHaveProperty('projectId');
    expect(event).toHaveProperty('action');
    expect(event).toHaveProperty('payload');
    expect(event).toHaveProperty('metadata');

    // Verify metadata structure
    expect(event.metadata).toHaveProperty('schemaVersion');
    expect(event.metadata).toHaveProperty('source');

    // Verify schemaVersion is present
    expect(event.metadata.schemaVersion).toBe('1.0');

    // Verify source is one of the allowed values
    expect(['daemon', 'client', 'adapter']).toContain(event.metadata.source);
  });

  /**
   * Property 30.5: Multi-sync readiness - events can be serialized/deserialized
   * Validates: Requirements 6.3
   */
  it('should support serialization/deserialization for multi-sync', async () => {
    await wal.initialize();

    const originalEvent = wal.createEvent(testProjectPath, 'test.event', {
      key: 'value',
      nested: { a: 1, b: 'test' },
    });

    // Serialize
    const serialized = JSON.stringify(originalEvent);

    // Deserialize
    const deserializedEvent = JSON.parse(serialized) as Event;

    // Verify all fields are preserved
    expect(deserializedEvent.eventId).toBe(originalEvent.eventId);
    expect(deserializedEvent.ts).toBe(originalEvent.ts);
    expect(deserializedEvent.projectId).toBe(originalEvent.projectId);
    expect(deserializedEvent.action).toBe(originalEvent.action);
    expect(deserializedEvent.payload).toEqual(originalEvent.payload);
    expect(deserializedEvent.metadata.schemaVersion).toBe(originalEvent.metadata.schemaVersion);
    expect(deserializedEvent.metadata.source).toBe(originalEvent.metadata.source);
  });

  /**
   * Property 30.6: UUIDv7 format validation
   * Validates: Requirements 6.1
   */
  it('should generate UUIDv7 format eventIds', async () => {
    await wal.initialize();

    // Generate multiple events and validate UUIDv7 format
    const numEvents = 100;
    const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (let i = 0; i < numEvents; i++) {
      const event = wal.createEvent(testProjectPath, 'test.event', { index: i });
      expect(event.eventId).toMatch(uuidv7Regex);
    }
  });

  /**
   * Property 30.7: Event ordering preservation
   * Validates: Requirements 6.2
   */
  it('should preserve event ordering in WAL', async () => {
    await wal.initialize();

    // Clear existing events from previous tests
    const eventsPath = wal.getEventsPath();
    await fs.writeFile(eventsPath, '');

    const events: Event[] = [];
    for (let i = 0; i < 10; i++) {
      const event = wal.createEvent(testProjectPath, `test.event.${i}`, { index: i });
      events.push(event);
    }

    // Append events to WAL
    for (const event of events) {
      await wal.appendEvent(event);
    }

    // Read events back
    const readEvents = await wal.readAllEvents();

    // Verify order is preserved
    expect(readEvents.length).toBe(events.length);
    for (let i = 0; i < events.length; i++) {
      expect(readEvents[i].eventId).toBe(events[i].eventId);
      expect(readEvents[i].action).toBe(events[i].action);
    }

    // File-level assertion: verify on disk - unique eventIds, monotonic timestamps, non-empty projectId
    const diskPath = wal.getEventsPath();
    expect(fsSync.existsSync(diskPath)).toBe(true);
    const diskContent = await fs.readFile(diskPath, 'utf-8');
    const diskEventLines = diskContent.trim().split('\n').filter(l => l.length > 0);
    const diskEventIds = new Set<string>();
    for (const line of diskEventLines) {
      const parsed = JSON.parse(line) as Event;
      expect(diskEventIds.has(parsed.eventId)).toBe(false);
      diskEventIds.add(parsed.eventId);
      expect(parsed.projectId).not.toBe('');
    }
    for (let i = 1; i < diskEventLines.length; i++) {
      const prev = JSON.parse(diskEventLines[i - 1]) as Event;
      const curr = JSON.parse(diskEventLines[i]) as Event;
      expect(curr.ts).toBeGreaterThanOrEqual(prev.ts);
    }
  });

  /**
   * Property 30.8: Project isolation in events
   * Validates: Requirements 6.3
   */
  it('should maintain project isolation in events', async () => {
    await wal.initialize();

    // Clear existing events from previous tests
    const eventsPath = wal.getEventsPath();
    await fs.writeFile(eventsPath, '');

    const projectA = 'project-a';
    const projectB = 'project-b';

    // Create events for project A
    const eventsA: Event[] = [];
    for (let i = 0; i < 5; i++) {
      eventsA.push(wal.createEvent(projectA, 'test.event', { project: 'A', index: i }));
    }

    // Create events for project B
    const eventsB: Event[] = [];
    for (let i = 0; i < 5; i++) {
      eventsB.push(wal.createEvent(projectB, 'test.event', { project: 'B', index: i }));
    }

    // Append all events
    for (const event of [...eventsA, ...eventsB]) {
      await wal.appendEvent(event);
    }

    // Read all events
    const allEvents = await wal.readAllEvents();

    // Verify project isolation
    const eventsFromA = allEvents.filter(e => e.projectId === projectA);
    const eventsFromB = allEvents.filter(e => e.projectId === projectB);

    expect(eventsFromA.length).toBe(eventsA.length);
    expect(eventsFromB.length).toBe(eventsB.length);
    expect(eventsFromA.length + eventsFromB.length).toBe(allEvents.length);

    // File-level assertion: verify all events on disk have non-empty projectId
    const diskIsolationPath = wal.getEventsPath();
    expect(fsSync.existsSync(diskIsolationPath)).toBe(true);
    const diskIsoContent = await fs.readFile(diskIsolationPath, 'utf-8');
    const diskIsoLines = diskIsoContent.trim().split('\n').filter(l => l.length > 0);
    const diskIsoIds = new Set<string>();
    for (const line of diskIsoLines) {
      const parsed = JSON.parse(line) as Event;
      expect(parsed.projectId).not.toBe('');
      expect(diskIsoIds.has(parsed.eventId)).toBe(false);
      diskIsoIds.add(parsed.eventId);
    }
  });
});
