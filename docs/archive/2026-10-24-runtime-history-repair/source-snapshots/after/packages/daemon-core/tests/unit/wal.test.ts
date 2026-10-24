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
    it('should initialize without persisting an empty events.jsonl', async () => {
      await wal.initialize();
      
      const eventsPath = wal.getEventsPath();
      await expect(fs.access(eventsPath)).rejects.toMatchObject({ code: 'ENOENT' });
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

    it('rejects unsupported legacy events before appending or reading', async () => {
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
      const original = await fs.readFile(wal.getEventsPath());
      await expect(wal.appendEvent(modernEvent)).rejects.toThrow('WAL_EVENT_SCHEMA_INVALID');
      await expect(wal.readEventsByCategory('state')).rejects.toThrow('WAL_EVENT_SCHEMA_INVALID');
      expect(await fs.readFile(wal.getEventsPath())).toEqual(original);
    });

    it('should return empty array for category with no matching events', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', {});
      await wal.appendEvent(e1);

      const systemEvents = await wal.readEventsByCategory('system');
      expect(systemEvents).toHaveLength(0);
    });
  });

  describe('rotation — events.jsonl archiving', () => {
    it('should NOT rotate when file is under WAL_MAX_SIZE (5MB)', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();

      // Write a small event — should NOT trigger rotation
      const event = wal.createEvent('p1', 'state', 'state.transition', {});
      await wal.appendEvent(event);

      // Verify file still exists (not renamed)
      const stat = await fs.stat(eventsPath);
      expect(stat.size).toBeGreaterThan(0);

      // Verify no archive files created
      const eventsDir = path.dirname(eventsPath);
      const files = await fs.readdir(eventsDir);
      const archives = files.filter(f => f.startsWith('events-') && f.endsWith('.jsonl.bak'));
      expect(archives).toHaveLength(0);
    });

    it('should trigger rotation when file exceeds WAL_MAX_SIZE', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();
      const eventsDir = path.dirname(eventsPath);

      const first = wal.createEvent('p1', 'system', 'fill', { data: 'X'.repeat(5 * 1024 * 1024) });
      await wal.appendEvent(first);

      // Now append one more event — this should trigger rotation
      const event = wal.createEvent('p1', 'state', 'state.transition', { after: 'rotate' });
      await wal.appendEvent(event);

      // Verify archive file was created
      const files = await fs.readdir(eventsDir);
      const archives = files.filter(f => f.startsWith('events-') && f.endsWith('.jsonl.bak'));
      expect(archives.length).toBeGreaterThanOrEqual(1);
      expect(archives[0]!).toMatch(/^events-.*\.jsonl\.bak$/);

      // Verify events.jsonl still exists and contains the rotated event
      const stat = await fs.stat(eventsPath);
      expect(stat.size).toBeGreaterThan(0);

      // Verify archived file has the old content
      const archivePath = path.join(eventsDir, archives[0]!);
      const archiveContent = await fs.readFile(archivePath, 'utf-8');
      expect(archiveContent).toContain(first.eventId);
      expect((await wal.readAllEvents()).events.map(item => item.eventId)).toEqual([first.eventId, event.eventId]);
    });

    it('retains every history segment beyond three rotations', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();
      const eventsDir = path.dirname(eventsPath);

      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const fill = wal.createEvent('p1', 'system', 'fill', { data: 'Y'.repeat(5 * 1024 * 1024) });
        await wal.appendEvent(fill); ids.push(fill.eventId);
        const next = wal.createEvent('p1', 'system', 'after_rotation', {});
        await wal.appendEvent(next); ids.push(next.eventId);
      }
      const files = await fs.readdir(eventsDir);
      const archives = files.filter(f => f.startsWith('events-') && f.endsWith('.jsonl.bak'));
      expect(archives).toHaveLength(5);
      expect((await new WAL(eventsPath).readAllEvents()).events.map(item => item.eventId)).toEqual(ids);
    });

    it('writes a normal event without rotating below the threshold', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();

      // Normal append should still work
      const event = wal.createEvent('p1', 'state', 'state.transition', { safe: true });
      await wal.appendEvent(event);

      const content = await fs.readFile(eventsPath, 'utf-8');
      expect(content).toContain(event.eventId);
    });
  });

  describe('readAllEvents — fail-closed input policy', () => {
    it('should return empty events and corruptedLines for non-existent file', async () => {
      const result = await wal.readAllEvents();
      expect(result.events).toEqual([]);
      expect(result.corruptedLines).toEqual([]);
    });

    it('should reject an existing empty file', async () => {
      await fs.writeFile(wal.getEventsPath(), '');
      await expect(wal.readAllEvents()).rejects.toThrow('WAL_EMPTY_INPUT');
    });

    it('should reject a corrupted line even when other events are valid', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', { from: 'a', to: 'b' });
      await wal.appendEvent(e1);

      // Append a corrupted line directly
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'THIS IS NOT JSON\n', 'utf-8');

      const e2 = wal.createEvent('p1', 'state', 'state.transition', { from: 'b', to: 'c' });
      const original = await fs.readFile(eventsPath);
      await expect(wal.appendEvent(e2)).rejects.toThrow('WAL_CORRUPT_INPUT');
      expect(await fs.readFile(eventsPath)).toEqual(original);

      await expect(wal.readAllEvents()).rejects.toThrow(
        'WAL_CORRUPT_INPUT:file=events.jsonl:line=2',
      );
    });

    it('reports the corrupt location without echoing raw input', async () => {
      await wal.initialize();
      const longCorrupted = 'X'.repeat(200);
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, longCorrupted + '\n', 'utf-8');

      await expect(wal.readAllEvents()).rejects.toThrow(
        'WAL_CORRUPT_INPUT:file=events.jsonl:line=1',
      );
    });

    it('should handle all lines corrupted', async () => {
      await wal.initialize();
      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'bad1\n', 'utf-8');
      await fs.appendFile(eventsPath, 'bad2\n', 'utf-8');

      await expect(wal.readAllEvents()).rejects.toThrow(
        'WAL_CORRUPT_INPUT:file=events.jsonl:line=1',
      );
    });

    it('should make getLastEvent fail closed after corrupted lines', async () => {
      await wal.initialize();
      const e1 = wal.createEvent('p1', 'state', 'state.transition', {});
      await wal.appendEvent(e1);

      const eventsPath = wal.getEventsPath();
      await fs.appendFile(eventsPath, 'CORRUPTED\n', 'utf-8');

      await expect(wal.getLastEvent()).rejects.toThrow(
        'WAL_CORRUPT_INPUT:file=events.jsonl:line=2',
      );
    });

    it('serializes multiple owners and readers across rotation without losing events', async () => {
      await wal.initialize();
      await wal.appendEvent(wal.createEvent('p1', 'system', 'padding', {data:'x'.repeat(5*1024*1024)}));
      const other = new WAL(wal.getEventsPath()); await other.initialize();
      const pending = Array.from({length:12}, (_,i) => {
        const owner = i % 2 ? other : wal;
        return owner.appendEvent(owner.createEvent('p1','system','concurrent',{i}));
      });
      await Promise.all([...pending, wal.readAllEvents(), other.readAllEvents()]);
      const {events} = await new WAL(wal.getEventsPath()).readAllEvents();
      expect(events).toHaveLength(13);
      expect(events.map(e=>e.monotonicSeq)).toEqual(Array.from({length:13},(_,i)=>i+1));
      expect(new Set(events.slice(1).map(e=>e.payload.i)).size).toBe(12);
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
