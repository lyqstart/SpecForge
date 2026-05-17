/**
 * Property 30: Event Schema Multi-sync Readiness Test
 * 
 * Validates: Property 30, Requirements 19.2
 * 
 * Properties:
 * 1. For all events e written to events.jsonl, e.eventId is globally unique (UUIDv7 or equivalent)
 * 2. For all events e written to events.jsonl, e.ts is monotonically non-decreasing within a single machine
 * 3. For all events e written to events.jsonl, e.projectId is non-empty and aggregatable by project dimension
 * 4. This schema remains forward-compatible for future multi-machine synchronization
 */

import { describe, it, expect } from 'vitest';
import {
  createEvent,
  validateEventSchema,
  MonotonicTimestamp,
  EVENT_SCHEMA,
  isValidUuid
} from '../../src/types/event-utils';
import type { Event, EventCategory } from '../../src/types';

describe('Property 30: Event Schema Multi-sync Readiness', () => {
  // Test data generators
  const generateTestData = (): Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'> => {
    const categories: EventCategory[] = [
      'workflow', 'gate', 'permission', 'session', 'tool',
      'heal', 'modality', 'migration', 'system'
    ];
    
    const data: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq' | 'schema_version'> = {
      projectId: 'a1b2c3d4e5f67890',
      workItemId: Math.random() > 0.5 ? 'workitem-' + Math.random().toString(36).substring(2, 10) : null,
      actor: Math.random() > 0.5 ? {
        id: 'agent-' + Math.random().toString(36).substring(2, 8),
        name: 'Test Agent',
        type: 'agent'
      } : null,
      category: categories[Math.floor(Math.random() * categories.length)],
      action: 'test.' + ['started', 'completed', 'failed', 'updated'][Math.floor(Math.random() * 4)]
    };
    
    // Add optional fields only if they have values
    if (Math.random() > 0.5) {
      data.payload = { data: Math.random().toString(36).substring(2) };
    }
    
    if (Math.random() > 0.8) {
      data.payloadBlobRef = 'blob://' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    
    return data;
  };

  describe('Property 30.1: eventId is globally unique (UUIDv7)', () => {
    it('should generate unique eventIds for different events', () => {
      const timestampGenerator = new MonotonicTimestamp();
      const testData = generateTestData();
      
      // Create two events with the same data
      const event1 = createEvent(testData, timestampGenerator);
      const event2 = createEvent(testData, timestampGenerator);
      
      // Event IDs should be different (UUIDv7 includes timestamp + random bits)
      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should generate valid UUIDv7-like eventIds', () => {
      for (let i = 0; i < 10; i++) {
        const event = createEvent(generateTestData());
        
        // Validate UUIDv7-like format
        expect(isValidUuid(event.eventId)).toBe(true);
        
        // Check version (7) and variant (RFC 4122)
        const parts = event.eventId.split('-');
        expect(parts[2].startsWith('7')).toBe(true); // Version 7
        expect(['8', '9', 'a', 'b'].includes(parts[3][0])).toBe(true); // Variant
      }
    });
  });

  describe('Property 30.2: ts is monotonically non-decreasing within a single machine', () => {
    it('should generate monotonic timestamps for sequential events', () => {
      const timestampGenerator = new MonotonicTimestamp();
      const events: Event[] = [];
      
      // Create events sequentially
      for (let i = 0; i < 5; i++) {
        events.push(createEvent(generateTestData(), timestampGenerator));
      }
      
      // Check monotonic property
      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];
        
        // Timestamp should be non-decreasing
        expect(curr.ts).toBeGreaterThanOrEqual(prev.ts);
        
        // If timestamps are equal, sequence should increase
        if (curr.ts === prev.ts) {
          expect(curr.monotonicSeq).toBe(prev.monotonicSeq + 1);
        }
        
        // If timestamp increased, sequence should reset to 0
        if (curr.ts > prev.ts) {
          expect(curr.monotonicSeq).toBe(0);
        }
      }
    });
  });

  describe('Property 30.3: projectId is non-empty and aggregatable by project dimension', () => {
    it('should have non-empty projectId', () => {
      for (let i = 0; i < 10; i++) {
        const event = createEvent(generateTestData());
        expect(event.projectId.length).toBeGreaterThan(0);
      }
    });

    it('should have projectId in correct format (16 hex chars)', () => {
      for (let i = 0; i < 10; i++) {
        const event = createEvent(generateTestData());
        // Project ID should be 16 hex characters
        expect(event.projectId).toMatch(/^[0-9a-f]{16}$/i);
      }
    });

    it('should allow aggregation by projectId', () => {
      const events: Event[] = [];
      
      // Create events with different project IDs (valid hex format)
      for (let i = 0; i < 10; i++) {
        const data = generateTestData();
        // Create a valid hex project ID
        const hexNum = i.toString(16).padStart(16, '0');
        data.projectId = hexNum;
        events.push(createEvent(data));
      }
      
      // Group events by projectId
      const eventsByProject = new Map<string, Event[]>();
      for (const event of events) {
        if (!eventsByProject.has(event.projectId)) {
          eventsByProject.set(event.projectId, []);
        }
        eventsByProject.get(event.projectId)!.push(event);
      }
      
      // Each project should have its own events
      // And projectIds should be valid for aggregation
      for (const [projectId, projectEvents] of eventsByProject) {
        // All events in this group should have the same projectId
        for (const event of projectEvents) {
          expect(event.projectId).toBe(projectId);
        }
        
        // Project ID should be aggregatable (consistent format)
        expect(projectId).toMatch(/^[0-9a-f]{16}$/i);
      }
    });
  });

  describe('Property 30.4: Schema forward-compatibility for multi-machine sync', () => {
    it('should have required fields for future synchronization', () => {
      for (let i = 0; i < 10; i++) {
        const event = createEvent(generateTestData());
        
        // Check all required fields for multi-machine sync are present
        const requiredFields = [
          'schema_version',
          'eventId',
          'ts',
          'monotonicSeq',
          'projectId',
          'category',
          'action'
        ];
        
        for (const field of requiredFields) {
          expect(field in event).toBe(true);
        }
        
        // schema_version allows future migrations
        expect(event.schema_version).toBe(EVENT_SCHEMA.VERSION);
        
        // eventId is globally unique (UUIDv7)
        expect(isValidUuid(event.eventId)).toBe(true);
        
        // ts is high-resolution (nanoseconds) for ordering across machines
        expect(event.ts).toBeGreaterThan(0);
        
        // projectId allows partitioning by project
        expect(event.projectId).toBeDefined();
        expect(event.projectId.length).toBe(16);
      }
    });

    it('should validate against schema', () => {
      for (let i = 0; i < 10; i++) {
        const event = createEvent(generateTestData());
        const validation = validateEventSchema(event);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });
  });

  describe('Additional schema properties', () => {
    it('should handle optional fields correctly', () => {
      // Test with null workItemId
      const data1 = generateTestData();
      data1.workItemId = null;
      const event1 = createEvent(data1);
      expect(event1.workItemId).toBeNull();
      
      // Test with null actor
      const data2 = generateTestData();
      data2.actor = null;
      const event2 = createEvent(data2);
      expect(event2.actor).toBeNull();
      
      // Test without payload (should be undefined)
      const data3 = generateTestData();
      delete data3.payload;
      const event3 = createEvent(data3);
      expect(event3.payload).toBeUndefined();
      
      // Test without payloadBlobRef (should be undefined)
      const data4 = generateTestData();
      delete data4.payloadBlobRef;
      const event4 = createEvent(data4);
      expect(event4.payloadBlobRef).toBeUndefined();
    });
  });
});