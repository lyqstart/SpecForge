/**
 * Property 8: Serialization Round-trip Property-Based Test
 * 
 * **Validates: Requirements 30.8, 6.3**
 * **Feature: event-logger, Property 8**: parse(serialize(x)) == x for all persisted data objects
 * **Derived-From: v6-architecture-overview Property 8**
 * 
 * Properties:
 * 1. parse(serialize(event)) == event for all Event objects
 * 2. Works with all Event fields (eventId, ts, monotonicSeq, projectId, category, action, payload)
 * 3. Works with complex nested payload objects
 * 4. Works with various payload types (null, undefined, objects, arrays, strings, numbers, booleans)
 * 5. Handles special characters and Unicode correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger } from '../../src/event-logger';
import type { Event, EventCategory } from '../../src/types';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fc from 'fast-check';
import { generateEventId, MonotonicTimestamp } from '../../src/types/event-utils';

/**
 * Generate a hex string of specified length
 */
function hexString(length: number): fc.Arbitrary<string> {
  const chars = '0123456789abcdef';
  return fc.stringOf(fc.oneof(...chars.split('').map(c => fc.constant(c))), { minLength: length, maxLength: length });
}

/**
 * Generate a random Event with valid fields - simplified version
 */
function generateArbitraryEvent(): fc.Arbitrary<Event> {
  return fc.record({
    schema_version: fc.constant('1.0'),
    eventId: fc.string().map(() => generateEventId()),
    ts: fc.integer({ min: 1, max: Date.now() * 1_000_000 }),
    monotonicSeq: fc.integer({ min: 0, max: 10000 }),
    projectId: hexString(16),
    workItemId: fc.oneof(fc.string(), fc.constant(null)),
    actor: fc.oneof(
      fc.record({
        id: fc.string(),
        name: fc.string(),
        type: fc.string(),
      }),
      fc.constant(null)
    ),
    category: fc.oneof(
      fc.constant('workflow'),
      fc.constant('gate'),
      fc.constant('permission'),
      fc.constant('session'),
      fc.constant('tool'),
      fc.constant('heal'),
      fc.constant('modality'),
      fc.constant('migration'),
      fc.constant('system')
    ),
    action: fc.string(),
    payload: fc.oneof(
      fc.constant(null),
      fc.string(),
      fc.record({}),
      fc.array(fc.string())
    ),
    payloadBlobRef: fc.oneof(
      fc.string().map(s => `blob://${s}`),
      fc.constant(undefined),
      fc.constant(null),
    ),
  }, { withDeletedKeys: false });
}

/**
 * Generate arbitrary category
 */
function generateCategory(): fc.Arbitrary<EventCategory> {
  return fc.oneof(
    fc.constant('workflow'),
    fc.constant('gate'),
    fc.constant('permission'),
    fc.constant('session'),
    fc.constant('tool'),
    fc.constant('heal'),
    fc.constant('modality'),
    fc.constant('migration'),
    fc.constant('system')
  );
}

describe('Property 8: Serialization Round-trip', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'event-serialization-test-'));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // Property 8.1: parse(serialize(event)) == event for all events
  // ============================================================
  describe('Property 8.1: parse(serialize(event)) == event', () => {
    it('should satisfy serialization round-trip for random events', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent(),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should preserve all fields after round-trip', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent(),
          (event) => {
            const serialized = EventLogger.serialize(event);
            const deserialized = EventLogger.deserialize(serialized);

            expect(deserialized.eventId).toBe(event.eventId);
            expect(deserialized.ts).toBe(event.ts);
            expect(deserialized.monotonicSeq).toBe(event.monotonicSeq);
            expect(deserialized.projectId).toBe(event.projectId);
            expect(deserialized.category).toBe(event.category);
            expect(deserialized.action).toBe(event.action);
            expect(deserialized.schema_version).toBe(event.schema_version);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  // ============================================================
  // Property 8.2: Works with various category types
  // ============================================================
  describe('Property 8.2: Works with all EventCategory types', () => {
    it('should handle workflow events', () => {
      fc.assert(
        fc.property(
          fc.record({
            eventId: fc.string().map(() => generateEventId()),
            ts: fc.integer({ min: 1, max: Date.now() * 1_000_000 }),
            monotonicSeq: fc.integer({ min: 0 }),
            projectId: hexString(16),
            action: fc.string(),
            payload: fc.oneof(fc.constant(null), fc.string(), fc.record({})),
          }),
          (data) => {
            const event: Event = {
              schema_version: '1.0',
              ...data,
              category: 'workflow',
              workItemId: null,
              actor: null,
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle gate events', () => {
      fc.assert(
        fc.property(
          fc.record({
            eventId: fc.string().map(() => generateEventId()),
            ts: fc.integer({ min: 1, max: Date.now() * 1_000_000 }),
            monotonicSeq: fc.integer({ min: 0 }),
            projectId: hexString(16),
            action: fc.oneof(
              fc.constant('gate.passed'),
              fc.constant('gate.failed'),
              fc.string()
            ),
            payload: fc.oneof(fc.constant(null), fc.string(), fc.record({})),
          }),
          (data) => {
            const event: Event = {
              schema_version: '1.0',
              ...data,
              category: 'gate',
              workItemId: null,
              actor: null,
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle permission events (Property 10 traceability)', () => {
      fc.assert(
        fc.property(
          fc.record({
            eventId: fc.string().map(() => generateEventId()),
            ts: fc.bigInt({ min: 1n }).map(Number),
            monotonicSeq: fc.integer({ min: 0 }),
            projectId: hexString(16),
            action: fc.constant('permission.evaluated'),
            payload: fc.record({
              actor: fc.record({ id: fc.string(), name: fc.string(), type: fc.string() }),
              action: fc.string(),
              resource: fc.record({ type: fc.string(), id: fc.string() }),
              matched_rule: fc.string(),
              rule_layer: fc.oneof(fc.constant('hard'), fc.constant('builtin'), fc.constant('user')),
              reason: fc.string(),
              effect: fc.oneof(fc.constant('allow'), fc.constant('deny')),
            }),
          }),
          (data) => {
            const event: Event = {
              schema_version: '1.0',
              ...data,
              category: 'permission',
              workItemId: null,
              actor: null,
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);

            // Verify all 6 required traceability fields are present
            const serialized = EventLogger.serialize(event);
            const deserialized = EventLogger.deserialize(serialized);
            expect((deserialized.payload as any)?.actor).toBeDefined();
            expect((deserialized.payload as any)?.resource).toBeDefined();
            expect((deserialized.payload as any)?.matched_rule).toBeDefined();
            expect((deserialized.payload as any)?.rule_layer).toBeDefined();
            expect((deserialized.payload as any)?.reason).toBeDefined();
            expect((deserialized.payload as any)?.effect).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle all category types', () => {
      const categories: EventCategory[] = [
        'workflow', 'gate', 'permission', 'session', 'tool',
        'heal', 'modality', 'migration', 'system'
      ];

      for (const category of categories) {
        const event: Event = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: Date.now() * 1_000_000,
          monotonicSeq: 1,
          projectId: 'testproject1234',
          workItemId: null,
          actor: null,
          category,
          action: `test.${category}`,
          payload: { test: true },
        };

        const result = EventLogger.verifySerializationRoundTrip(event);
        expect(result).toBe(true);
      }
    });
  });

  // ============================================================
  // Property 8.3: Works with complex nested payload objects
  // ============================================================
  describe('Property 8.3: Complex nested payloads', () => {
    it('should handle deeply nested objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            eventId: fc.string().map(() => generateEventId()),
            ts: fc.bigInt({ min: 1n }).map(Number),
            monotonicSeq: fc.integer({ min: 0 }),
            projectId: hexString(16),
          }),
          (base) => {
            const event: Event = {
              ...base,
              schema_version: '1.0',
              category: 'system',
              action: 'test',
              workItemId: null,
              actor: null,
              payload: {
                level1: {
                  level2: {
                    level3: {
                      value: 42,
                      array: [1, 2, 3],
                      nested: { deep: 'value' }
                    }
                  }
                }
              },
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle arrays of objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            eventId: fc.string().map(() => generateEventId()),
            ts: fc.bigInt({ min: 1n }).map(Number),
            monotonicSeq: fc.integer({ min: 0 }),
            projectId: hexString(16),
          }),
          (base) => {
            const event: Event = {
              ...base,
              schema_version: '1.0',
              category: 'system',
              action: 'test',
              workItemId: null,
              actor: null,
              payload: [
                { id: 1, name: 'item1' },
                { id: 2, name: 'item2' },
                { id: 3, name: 'item3' },
              ],
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle mixed type arrays', () => {
      const event: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: null,
        actor: null,
        category: 'system',
        action: 'test',
        payload: [
          'string',
          42,
          true,
          null,
          { nested: 'object' },
          [1, 2, 3],
        ],
      };

      const result = EventLogger.verifySerializationRoundTrip(event);
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // Property 8.4: Works with various payload types
  // ============================================================
  describe('Property 8.4: Various payload types', () => {
    it('should handle null payload', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent().map(e => ({ ...e, payload: null })),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle undefined payload', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent().map(e => ({ ...e, payload: undefined })),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle empty object payload', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent().map(e => ({ ...e, payload: {} })),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle empty array payload', () => {
      fc.assert(
        fc.property(
          generateArbitraryEvent().map(e => ({ ...e, payload: [] })),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle string payload', () => {
      fc.assert(
        fc.property(
          fc.string().map(payload => {
            const timestampGen = new MonotonicTimestamp();
            const { timestamp, sequence } = timestampGen.getTimestamp();
            return {
              schema_version: '1.0' as const,
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId: 'testproject1234',
              workItemId: null,
              actor: null,
              category: 'system' as const,
              action: 'test',
              payload,
            };
          }),
          (event) => {
            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle number payload', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.integer(), fc.float()),
          (num) => {
            const timestampGen = new MonotonicTimestamp();
            const { timestamp, sequence } = timestampGen.getTimestamp();
            const event: Event = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId: 'testproject1234',
              workItemId: null,
              actor: null,
              category: 'system',
              action: 'test',
              payload: num,
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle boolean payload', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (bool) => {
            const timestampGen = new MonotonicTimestamp();
            const { timestamp, sequence } = timestampGen.getTimestamp();
            const event: Event = {
              schema_version: '1.0',
              eventId: generateEventId(),
              ts: timestamp,
              monotonicSeq: sequence,
              projectId: 'testproject1234',
              workItemId: null,
              actor: null,
              category: 'system',
              action: 'test',
              payload: bool,
            };

            const result = EventLogger.verifySerializationRoundTrip(event);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 8.5: Handles special characters and Unicode
  // ============================================================
  describe('Property 8.5: Special characters and Unicode', () => {
    it('should handle Unicode characters in payload', () => {
      const testStrings = [
        '日本語テスト',
        '中文测试',
        '한국어테스트',
        '🎉🚀💡',
        'Hello 世界 🌍',
        'עברית',
        'العربية',
        'Привет',
      ];

      for (const str of testStrings) {
        const event: Event = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: Date.now() * 1_000_000,
          monotonicSeq: 1,
          projectId: 'testproject1234',
          workItemId: null,
          actor: null,
          category: 'system',
          action: 'test',
          payload: { text: str },
        };

        const result = EventLogger.verifySerializationRoundTrip(event);
        expect(result).toBe(true);
      }
    });

    it('should handle special characters in payload', () => {
      const testStrings = [
        'Newline\nTab\tCarriage\r',
        'Quote "double" \'single\`back',
        'Special !@#$%^&*()',
        'Less than < >',
        'Ampersand &',
        'Pipe |',
        'Backslash \\',
        'Forward slash /',
      ];

      for (const str of testStrings) {
        const event: Event = {
          schema_version: '1.0',
          eventId: generateEventId(),
          ts: Date.now() * 1_000_000,
          monotonicSeq: 1,
          projectId: 'testproject1234',
          workItemId: null,
          actor: null,
          category: 'system',
          action: 'test',
          payload: { text: str },
        };

        const result = EventLogger.verifySerializationRoundTrip(event);
        expect(result).toBe(true);
      }
    });

    it('should handle control characters', () => {
      const event: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: null,
        actor: null,
        category: 'system',
        action: 'test',
        payload: {
          controlChars: '\x00\x01\x02\x03\x04\x05',
          nullChar: '\x00',
        },
      };

      const result = EventLogger.verifySerializationRoundTrip(event);
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // Property 8.6: Large payloads (>64KB)
  // ============================================================
  describe('Property 8.6: Large payloads', () => {
    it('should handle large string payload', () => {
      const largeString = 'x'.repeat(100000); // 100KB
      const event: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: null,
        actor: null,
        category: 'system',
        action: 'test',
        payload: largeString,
      };

      const result = EventLogger.verifySerializationRoundTrip(event);
      expect(result).toBe(true);
    });

    it('should handle large object payload', () => {
      const largeArray = Array(10000).fill({ id: 1, name: 'test', value: 42 });
      const event: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: null,
        actor: null,
        category: 'system',
        action: 'test',
        payload: { items: largeArray },
      };

      const result = EventLogger.verifySerializationRoundTrip(event);
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // Property 8.7: Integration with EventLogger class
  // ============================================================
  describe('Property 8.7: Integration with EventLogger', () => {
    it('should serialize and deserialize events from WAL', async () => {
      const logger = new EventLogger(tempDir);
      await logger.initialize();

      // Create and append events
      const event1: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: 'work-1',
        actor: { id: 'agent-1', name: 'TestAgent', type: 'test' },
        category: 'workflow',
        action: 'workflow.started',
        payload: { startedAt: new Date().toISOString() },
      };

      const event2: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000 + 1,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: 'work-1',
        actor: { id: 'agent-1', name: 'TestAgent', type: 'test' },
        category: 'gate',
        action: 'gate.passed',
        payload: { rule: 'test-rule', result: true },
      };

      await logger.append(event1);
      await logger.append(event2);

      // Read events back and verify serialization
      const events = [];
      for await (const e of logger.getEvents()) {
        const serialized = EventLogger.serialize(e);
        const deserialized = EventLogger.deserialize(serialized);
        
        // Verify round-trip
        expect(EventLogger.verifySerializationRoundTrip(e)).toBe(true);
        
        events.push(deserialized);
      }

      expect(events.length).toBe(2);
      expect(events[0].action).toBe('workflow.started');
      expect(events[1].action).toBe('gate.passed');
    });
  });

  // ============================================================
  // Property 8.8: All persisted data objects
  // ============================================================
  describe('Property 8.8: All persisted data objects', () => {
    it('should support Event serialization', () => {
      const event: Event = {
        schema_version: '1.0',
        eventId: generateEventId(),
        ts: Date.now() * 1_000_000,
        monotonicSeq: 1,
        projectId: 'testproject1234',
        workItemId: 'work-1',
        actor: { id: 'agent-1', name: 'TestAgent', type: 'test' },
        category: 'permission',
        action: 'permission.evaluated',
        payload: {
          actor: { id: 'actor-1', name: 'TestActor', type: 'test' },
          action: 'tool.invoke',
          resource: { type: 'file', id: '/path/to/file' },
          matched_rule: 'rule-1',
          rule_layer: 'user',
          reason: 'Allowed by user rule',
          effect: 'allow' as const,
        },
      };

      const result = EventLogger.verifySerializationRoundTrip(event);
      expect(result).toBe(true);
    });
  });
});