/**
 * Event Logger unit tests
 * 
 * Tests the Event Logger implementation including:
 * - WAL semantics (fsync before state updates)
 * - JSON Lines format
 * - Serialization/deserialization
 * - Event filtering
 * - State reconstruction
 * 
 * Validates: Requirements 2.2, 2.5, Property 8
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger, createEventLogger } from '../../src/event-logger';
import type { Event, EventFilter } from '../../src/types';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateEventId } from '../../src/types/event-utils';

/**
 * Helper to create a test event
 */
function createTestEvent(overrides: Partial<Event> = {}): Event {
  const timestamp = Date.now() * 1_000_000; // nanoseconds
  
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: timestamp,
    monotonicSeq: 1,
    projectId: 'test-project-1234',
    workItemId: 'work-item-1',
    actor: { id: 'agent-1', name: 'TestAgent', type: 'test' },
    category: 'system',
    action: 'test.event',
    payload: { message: 'test' },
    ...overrides,
  };
}

describe('EventLogger', () => {
  let logger: EventLogger;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'event-logger-test-'));
    logger = new EventLogger(tempDir);
    await logger.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialize()', () => {
    it('should create events.jsonl file', async () => {
      await logger.initialize();
      
      const eventsPath = join(tempDir, 'events.jsonl');
      const fileStat = await stat(eventsPath);
      
      expect(fileStat.isFile()).toBe(true);
    });

    it('should create state.json file', async () => {
      await logger.initialize();
      
      const statePath = join(tempDir, 'state.json');
      const fileStat = await stat(statePath);
      
      expect(fileStat.isFile()).toBe(true);
    });

    it('should handle re-initialization', async () => {
      await logger.initialize();
      await logger.initialize(); // Should not throw
      
      expect(logger.getEventCount()).toBe(0);
    });
  });

  describe('append()', () => {
    it('should append event to events.jsonl', async () => {
      const event = createTestEvent();
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].eventId).toBe(event.eventId);
    });

    it('should append multiple events in order', async () => {
      const event1 = createTestEvent({ action: 'test.event1', ts: 1000 * 1_000_000 });
      const event2 = createTestEvent({ action: 'test.event2', ts: 2000 * 1_000_000 });
      const event3 = createTestEvent({ action: 'test.event3', ts: 3000 * 1_000_000 });

      await logger.append(event1);
      await logger.append(event2);
      await logger.append(event3);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(3);
      expect(events[0].action).toBe('test.event1');
      expect(events[1].action).toBe('test.event2');
      expect(events[2].action).toBe('test.event3');
    });

    it('should update lastEventId after append', async () => {
      const event = createTestEvent();
      await logger.append(event);

      expect(logger.getLastEventId()).toBe(event.eventId);
    });

    it('should throw error for event without eventId', async () => {
      const event = createTestEvent();
      delete (event as any).eventId;

      await expect(logger.append(event as Event)).rejects.toThrow('Event must have eventId');
    });

    it('should throw error for event without ts', async () => {
      const event = createTestEvent();
      delete (event as any).ts;

      await expect(logger.append(event as Event)).rejects.toThrow('Event must have ts (timestamp)');
    });

    it('should throw error for event without projectId', async () => {
      const event = createTestEvent();
      delete (event as any).projectId;

      await expect(logger.append(event as Event)).rejects.toThrow('Event must have projectId');
    });

    it('should throw error for event without category', async () => {
      const event = createTestEvent();
      delete (event as any).category;

      await expect(logger.append(event as Event)).rejects.toThrow('Event must have category');
    });

    it('should throw error for event without action', async () => {
      const event = createTestEvent();
      delete (event as any).action;

      await expect(logger.append(event as Event)).rejects.toThrow('Event must have action');
    });

    it('should handle event with null payload', async () => {
      const event = createTestEvent({ payload: null });
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].payload).toBeNull();
    });

    it('should handle event with undefined payload', async () => {
      const event = createTestEvent({ payload: undefined });
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      // undefined payload is not serialized in JSON
    });

    it('should handle event with complex payload', async () => {
      const complexPayload = {
        nested: { object: { value: 42 } },
        array: [1, 2, 3],
        string: 'test',
        number: 123,
        boolean: true,
        null: null,
      };
      const event = createTestEvent({ payload: complexPayload });
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].payload).toEqual(complexPayload);
    });

    it('should handle event with blob reference payload', async () => {
      const event = createTestEvent({
        payloadBlobRef: 'blob://abc123def456',
        payload: { large: true },
      });
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].payloadBlobRef).toBe('blob://abc123def456');
    });
  });

  describe('getEvents()', () => {
    beforeEach(async () => {
      // Add test events
      await logger.append(createTestEvent({ action: 'workflow.started', category: 'workflow' }));
      await logger.append(createTestEvent({ action: 'gate.passed', category: 'gate' }));
      await logger.append(createTestEvent({ action: 'permission.evaluated', category: 'permission' }));
      await logger.append(createTestEvent({ action: 'tool.invoked', category: 'tool' }));
    });

    it('should return all events when no filter', async () => {
      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(4);
    });

    it('should filter by category', async () => {
      const filter: EventFilter = { category: 'workflow' };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].category).toBe('workflow');
    });

    it('should filter by action', async () => {
      const filter: EventFilter = { action: 'gate' };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].action).toBe('gate.passed');
    });

    it('should filter by projectId', async () => {
      const projectId = 'unique-project';
      await logger.append(createTestEvent({ projectId, action: 'test.unique' }));

      const filter: EventFilter = { projectId };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].projectId).toBe(projectId);
    });

    it('should filter by timestamp range', async () => {
      const ts1 = 1000 * 1_000_000;
      const ts2 = 2000 * 1_000_000;
      const ts3 = 3000 * 1_000_000;

      await logger.clear();
      await logger.append(createTestEvent({ ts: ts1, action: 'event.1' }));
      await logger.append(createTestEvent({ ts: ts2, action: 'event.2' }));
      await logger.append(createTestEvent({ ts: ts3, action: 'event.3' }));

      const filter: EventFilter = { startTs: 1500 * 1_000_000, endTs: 2500 * 1_000_000 };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].action).toBe('event.2');
    });

    it('should apply limit', async () => {
      const filter: EventFilter = { limit: 2 };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(2);
    });

    it('should filter by actor id', async () => {
      const actor = { id: 'actor-123', name: 'TestActor', type: 'test' };
      await logger.append(createTestEvent({ actor, action: 'test.actor' }));

      const filter: EventFilter = { actor: { id: 'actor-123' } };
      const events = [];
      for await (const e of logger.getEvents(filter)) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].actor?.id).toBe('actor-123');
    });
  });

  describe('rebuildState()', () => {
    it('should rebuild state from events', async () => {
      await logger.append(createTestEvent({ action: 'event.1' }));
      await logger.append(createTestEvent({ action: 'event.2' }));

      const state = await logger.rebuildState();

      expect(state.events.length).toBe(2);
      expect(state.lastEventId).toBeDefined();
      expect(state.eventCount).toBe(2);
    });

    it('should write state.json after rebuild', async () => {
      await logger.append(createTestEvent());

      await logger.rebuildState();

      const statePath = join(tempDir, 'state.json');
      const stateStat = await stat(statePath);
      expect(stateStat.isFile()).toBe(true);
    });

    it('should handle empty events file', async () => {
      await logger.clear();

      const state = await logger.rebuildState();

      expect(state.events.length).toBe(0);
      expect(state.lastEventId).toBeNull();
    });

    it('should compute category counts', async () => {
      await logger.append(createTestEvent({ category: 'workflow' }));
      await logger.append(createTestEvent({ category: 'workflow' }));
      await logger.append(createTestEvent({ category: 'gate' }));

      const state = await logger.rebuildState();

      // Note: We need to read state.json to check computed fields
      const statePath = join(tempDir, 'state.json');
      const { readFile } = await import('fs/promises');
      const stateContent = await readFile(statePath, 'utf8');
      const stateObj = JSON.parse(stateContent);

      expect(stateObj.categories).toBeDefined();
      expect(stateObj.categories.workflow).toBe(2);
      expect(stateObj.categories.gate).toBe(1);
    });
  });

  describe('getLastEventId()', () => {
    it('should return null when no events', () => {
      expect(logger.getLastEventId()).toBeNull();
    });

    it('should return last event ID after appends', async () => {
      const event1 = createTestEvent({ action: 'event.1' });
      const event2 = createTestEvent({ action: 'event.2' });

      await logger.append(event1);
      await logger.append(event2);

      expect(logger.getLastEventId()).toBe(event2.eventId);
    });
  });

  describe('getEventCount()', () => {
    it('should return 0 for empty logger', () => {
      expect(logger.getEventCount()).toBe(0);
    });

    it('should return correct count after appends', async () => {
      await logger.append(createTestEvent());
      await logger.append(createTestEvent());
      await logger.append(createTestEvent());

      expect(logger.getEventCount()).toBe(3);
    });
  });

  describe('getEventsPath()', () => {
    it('should return correct path', () => {
      expect(logger.getEventsPath()).toBe(join(tempDir, 'events.jsonl'));
    });
  });

  describe('getStatePath()', () => {
    it('should return correct path', () => {
      expect(logger.getStatePath()).toBe(join(tempDir, 'state.json'));
    });
  });

  describe('Serialization Round-trip (Property 8)', () => {
    it('should serialize and deserialize event correctly', () => {
      const event = createTestEvent();
      const serialized = EventLogger.serialize(event);
      const deserialized = EventLogger.deserialize(serialized);

      expect(deserialized.eventId).toBe(event.eventId);
      expect(deserialized.ts).toBe(event.ts);
      expect(deserialized.monotonicSeq).toBe(event.monotonicSeq);
      expect(deserialized.projectId).toBe(event.projectId);
      expect(deserialized.category).toBe(event.category);
      expect(deserialized.action).toBe(event.action);
    });

    it('should verify serialization round-trip', () => {
      const event = createTestEvent();
      const result = EventLogger.verifySerializationRoundTrip(event);

      expect(result).toBe(true);
    });

    it('should handle complex payload in round-trip', () => {
      const complexPayload = {
        nested: { deep: { value: [1, 2, 3] } },
        unicode: '日本語 🎉',
        special: '\n\t\r"quotes"',
      };
      const event = createTestEvent({ payload: complexPayload });

      const result = EventLogger.verifySerializationRoundTrip(event);

      expect(result).toBe(true);
    });

    it('should handle null payload in round-trip', () => {
      const event = createTestEvent({ payload: null });

      const result = EventLogger.verifySerializationRoundTrip(event);

      expect(result).toBe(true);
    });

    it('should handle empty object payload in round-trip', () => {
      const event = createTestEvent({ payload: {} });

      const result = EventLogger.verifySerializationRoundTrip(event);

      expect(result).toBe(true);
    });
  });

  describe('JSON Lines Format', () => {
    it('should write each event on a separate line', async () => {
      await logger.append(createTestEvent({ action: 'event.1' }));
      await logger.append(createTestEvent({ action: 'event.2' }));

      const { readFile } = await import('fs/promises');
      const content = await readFile(join(tempDir, 'events.jsonl'), 'utf8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2);
    });

    it('should write valid JSON on each line', async () => {
      const event = createTestEvent();
      await logger.append(event);

      const { readFile } = await import('fs/promises');
      const content = await readFile(join(tempDir, 'events.jsonl'), 'utf8');
      const line = content.trim();

      expect(() => JSON.parse(line)).not.toThrow();
    });

    it('should handle events with newlines in payload', async () => {
      const event = createTestEvent({
        payload: { text: 'line1\nline2\r\nline3' },
      });
      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].payload.text).toBe('line1\nline2\r\nline3');
    });
  });

  describe('clear()', () => {
    it('should clear all events', async () => {
      await logger.append(createTestEvent());
      await logger.append(createTestEvent());

      await logger.clear();

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(0);
      expect(logger.getLastEventId()).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should return correct stats', async () => {
      await logger.append(createTestEvent());
      await logger.append(createTestEvent());

      const stats = await logger.getStats();

      expect(stats.eventCount).toBe(2);
      expect(stats.lastEventId).toBeDefined();
      expect(stats.fileSize).toBeGreaterThan(0);
    });

    it('should return zero for empty logger', async () => {
      const stats = await logger.getStats();

      expect(stats.eventCount).toBe(0);
      expect(stats.lastEventId).toBeNull();
      expect(stats.fileSize).toBe(0);
    });
  });

  describe('createEventLogger() factory', () => {
    it('should create an EventLogger instance', () => {
      const customPath = '/custom/path';
      const logger = createEventLogger(customPath);

      expect(logger).toBeDefined();
      expect(logger.getEventsPath()).toBe(join(customPath, 'events.jsonl'));
    });

    it('should create with default path', () => {
      const logger = createEventLogger();

      expect(logger).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty events file that was just created', async () => {
      // Create a new logger without appending
      const newLogger = new EventLogger(tempDir);
      await newLogger.initialize();

      const events = [];
      for await (const e of newLogger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(0);
    });

    it('should handle events with all categories', async () => {
      const categories = ['workflow', 'gate', 'permission', 'session', 'tool', 'heal', 'modality', 'migration', 'system'] as const;

      for (const category of categories) {
        await logger.append(createTestEvent({ category, action: `test.${category}` }));
      }

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(categories.length);
    });

    it('should handle very large payload', async () => {
      const largePayload = { data: 'x'.repeat(1024 * 1024) }; // 1MB
      const event = createTestEvent({ payload: largePayload });

      await logger.append(event);

      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect((events[0].payload as any).data.length).toBe(1024 * 1024);
    });
  });
});