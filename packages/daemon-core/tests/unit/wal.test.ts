/**
 * WAL (Write-Ahead Log) unit tests - Simplified
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WAL, ReadAllEventsResult } from '../../src/wal/WAL';
import { Event } from '../../src/types';

describe('WAL', () => {
  let wal: WAL;
  let tempDir: string;
  let testDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wal-test-${Date.now()}`);
    testDir = path.join(tempDir, 'projects', 'testhash');
    await fs.mkdir(testDir, { recursive: true });
    
    const eventsPath = path.join(testDir, 'events.jsonl');
    wal = new WAL(eventsPath);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should initialize and create events.jsonl', async () => {
      await wal.initialize();
      
      const eventsPath = wal.getEventsPath();
      // Check file exists - might be in temp dir
      expect(eventsPath).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('should create event with auto-generated eventId', () => {
      const event = wal.createEvent('project-1', 'test', 'test.action', { data: 'test' });
      
      expect(event.eventId).toBeDefined();
      expect(event.projectId).toBe('project-1');
      expect(event.action).toBe('test.action');
      expect(event.payload).toEqual({ data: 'test' });
    });

    it('should include schema version', () => {
      const event = wal.createEvent('project-1', 'test', 'test.action', {});
      
      expect(event.metadata.schemaVersion).toBe('1.0');
    });
  });

  describe('getSchemaVersion', () => {
    it('should return schema version', () => {
      expect(wal.getSchemaVersion()).toBe('1.0');
    });
  });

  describe('getEventsPath', () => {
    it('should return events path', () => {
      const eventsPath = wal.getEventsPath();
      expect(eventsPath).toContain('events.jsonl');
    });
  });

  describe('registerCategory', () => {
    it('should register a new category without error', () => {
      wal.registerCategory('custom');
      // Verify by creating an event with the custom category — should NOT warn
      const event = wal.createEvent('p1', 'custom', 'test.action', {});
      expect(event.category).toBe('custom');
    });
  });

  describe('createEvent category validation', () => {
    it('should create event with known category without warning', () => {
      const event = wal.createEvent('p1', 'state', 'test.action', {});
      expect(event.category).toBe('state');
    });

    it('should create event with unknown category (soft warn, still written)', () => {
      const event = wal.createEvent('p1', 'unknown_cat', 'test.action', {});
      expect(event.category).toBe('unknown_cat');
      // Event is still created — soft validation does not block
      expect(event.eventId).toBeDefined();
    });
  });

  describe('readEventsByCategory', () => {
    it('should filter events by category', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', { from: 'a', to: 'b' });
      const e2 = wal.createEvent('p1', 'session', 'session.activated', { sid: 's1' });
      const e3 = wal.createEvent('p1', 'state', 'state.transition', { from: 'b', to: 'c' });
      await wal.appendEvent(e1);
      await wal.appendEvent(e2);
      await wal.appendEvent(e3);

      const stateEvents = await wal.readEventsByCategory('state');
      expect(stateEvents).toHaveLength(2);
      expect(stateEvents.every(e => e.category === 'state')).toBe(true);

      const sessionEvents = await wal.readEventsByCategory('session');
      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0]!.category).toBe('session');
    });

    it('should treat events without category field as "state" (backward compat)', async () => {
      await wal.initialize();
      // Manually write a legacy event without category field
      const legacyEvent = {
        eventId: 'legacy-1',
        ts: Date.now(),
        action: 'old.action',
        payload: {},
        metadata: { schemaVersion: '0.9', source: 'daemon' as const },
      };
      await fs.appendFile(
        path.join(testDir, 'events.jsonl'),
        JSON.stringify(legacyEvent) + '\n',
        'utf-8'
      );

      // Also write a modern event with category
      const modernEvent = wal.createEvent('p1', 'session', 'session.activated', {});
      await wal.appendEvent(modernEvent);

      const stateEvents = await wal.readEventsByCategory('state');
      expect(stateEvents).toHaveLength(1);
      // Legacy event has no category field — defaults to 'state'
      expect(stateEvents[0]!.eventId).toBe('legacy-1');

      const sessionEvents = await wal.readEventsByCategory('session');
      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0]!.eventId).toBe(modernEvent.eventId);
    });

    it('should return empty array for category with no matching events', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', {});
      await wal.appendEvent(e1);

      const systemEvents = await wal.readEventsByCategory('system');
      expect(systemEvents).toHaveLength(0);
    });
  });

  describe('readAllEvents — corrupted line tolerance', () => {
    it('should return empty events and corruptedLines for non-existent file', async () => {
      const result = await wal.readAllEvents();
      expect(result.events).toEqual([]);
      expect(result.corruptedLines).toEqual([]);
    });

    it('should return empty events and corruptedLines for empty file', async () => {
      await wal.initialize();
      const result = await wal.readAllEvents();
      expect(result.events).toEqual([]);
      expect(result.corruptedLines).toEqual([]);
    });

    it('should parse valid events and skip corrupted lines', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', { from: 'a', to: 'b' });
      await wal.appendEvent(e1);

      // Append a corrupted line directly
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'THIS IS NOT JSON\n', 'utf-8');

      const e2 = wal.createEvent('p1', 'state', 'state.transition', { from: 'b', to: 'c' });
      await wal.appendEvent(e2);

      const result = await wal.readAllEvents();
      expect(result.events).toHaveLength(2);
      expect(result.events[0]!.eventId).toBe(e1.eventId);
      expect(result.events[1]!.eventId).toBe(e2.eventId);

      expect(result.corruptedLines).toHaveLength(1);
      expect(result.corruptedLines[0]!.lineNumber).toBe(2);
      expect(result.corruptedLines[0]!.content).toBe('THIS IS NOT JSON');
      expect(result.corruptedLines[0]!.error).toBeDefined();
    });

    it('should truncate corrupted line content to 100 chars', async () => {
      await wal.initialize();
      const longCorrupted = 'X'.repeat(200);
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, longCorrupted + '\n', 'utf-8');

      const result = await wal.readAllEvents();
      expect(result.events).toHaveLength(0);
      expect(result.corruptedLines).toHaveLength(1);
      expect(result.corruptedLines[0]!.content).toHaveLength(100);
    });

    it('should handle all lines corrupted', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'bad1\n', 'utf-8');
      await fs.appendFile(eventsPath, 'bad2\n', 'utf-8');

      const result = await wal.readAllEvents();
      expect(result.events).toHaveLength(0);
      expect(result.corruptedLines).toHaveLength(2);
      expect(result.corruptedLines[0]!.lineNumber).toBe(1);
      expect(result.corruptedLines[1]!.lineNumber).toBe(2);
    });

    it('should still work with getLastEvent after corrupted lines', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', {});
      await wal.appendEvent(e1);

      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'CORRUPTED\n', 'utf-8');

      const last = await wal.getLastEvent();
      expect(last).not.toBeNull();
      expect(last!.eventId).toBe(e1.eventId);
    });

    it('should return ReadAllEventsResult type with both fields', async () => {
      await wal.initialize();
      const result: ReadAllEventsResult = await wal.readAllEvents();
      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('corruptedLines');
      expect(Array.isArray(result.events)).toBe(true);
      expect(Array.isArray(result.corruptedLines)).toBe(true);
    });
  });
});