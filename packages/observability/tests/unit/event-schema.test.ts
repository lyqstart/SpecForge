/**
 * Event schema tests for Property 30: Multi-sync Readiness
 * 
 * Tests:
 * - UUIDv7 generation for eventId
 * - Project ID calculation
 * - Monotonic timestamp implementation
 * - Event schema validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateEventId,
  calculateProjectId,
  MonotonicTimestamp,
  validateEventSchema,
  createEvent,
  EVENT_SCHEMA,
  isValidUuid
} from '../../src/types/event-utils';
import type { Event } from '../../src/types';

describe('Event Schema Utilities', () => {
  describe('UUIDv7 Generation', () => {
    it('should generate valid UUIDv7 strings', () => {
      const uuid = generateEventId();
      
      // Check format
      expect(isValidUuid(uuid)).toBe(true);
      
      // Check version (7) and variant (RFC 4122)
      const parts = uuid.split('-');
      expect(parts[2].startsWith('7')).toBe(true); // Version 7
      expect(['8', '9', 'a', 'b'].includes(parts[3][0])).toBe(true); // Variant
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateEventId());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('Project ID Calculation', () => {
    it('should calculate project ID from path', () => {
      const path1 = '/home/user/projects/project-a';
      const path2 = '/home/user/projects/project-b';
      
      const id1 = calculateProjectId(path1);
      const id2 = calculateProjectId(path2);
      
      // Check format (16 hex chars)
      expect(id1).toMatch(/^[0-9a-f]{16}$/i);
      expect(id2).toMatch(/^[0-9a-f]{16}$/i);
      
      // Different paths should produce different IDs
      expect(id1).not.toBe(id2);
      
      // Same path should produce same ID
      const id1Again = calculateProjectId(path1);
      expect(id1Again).toBe(id1);
    });

    it('should handle empty and special paths', () => {
      expect(calculateProjectId('')).toMatch(/^[0-9a-f]{16}$/i);
      expect(calculateProjectId('/')).toMatch(/^[0-9a-f]{16}$/i);
      expect(calculateProjectId('C:\\Users\\Project')).toMatch(/^[0-9a-f]{16}$/i);
    });
  });

  describe('Monotonic Timestamp', () => {
    let timestampGenerator: MonotonicTimestamp;

    beforeEach(() => {
      timestampGenerator = new MonotonicTimestamp();
    });

    it('should generate increasing timestamps', () => {
      const ts1 = timestampGenerator.getTimestamp();
      const ts2 = timestampGenerator.getTimestamp();
      
      // Timestamp should be non-decreasing
      expect(ts2.timestamp).toBeGreaterThanOrEqual(ts1.timestamp);
      
      // If timestamps are equal, sequence should increase
      if (ts2.timestamp === ts1.timestamp) {
        expect(ts2.sequence).toBe(ts1.sequence + 1);
      } else {
        expect(ts2.sequence).toBe(0);
      }
    });

    it('should generate timestamps in nanoseconds', () => {
      const { timestamp } = timestampGenerator.getTimestamp();
      const nowMs = Date.now();
      const nowNs = nowMs * 1_000_000;
      
      // Timestamp should be close to current time in nanoseconds
      expect(timestamp).toBeGreaterThan(nowNs - 1_000_000_000); // Within 1 second
      expect(timestamp).toBeLessThan(nowNs + 1_000_000_000); // Within 1 second
    });

    it('should reset correctly', () => {
      const ts1 = timestampGenerator.getTimestamp();
      timestampGenerator.reset();
      const ts2 = timestampGenerator.getTimestamp();
      
      // After reset, should start fresh
      expect(ts2.timestamp).toBeGreaterThanOrEqual(ts1.timestamp);
      expect(ts2.sequence).toBe(0);
    });
  });

  describe('Event Schema Validation', () => {
    const validEvent: Event = {
      schema_version: '1.0',
      eventId: '018f0a9a-7a6b-7c6d-8e9f-0123456789ab',
      ts: 1_234_567_890_123,
      monotonicSeq: 0,
      projectId: 'a1b2c3d4e5f67890',
      workItemId: 'workitem-123',
      actor: { id: 'agent-1', name: 'Test Agent', type: 'agent' },
      category: 'workflow',
      action: 'workflow.started',
      payload: { workflowId: 'test-workflow' }
    };

    it('should validate correct event', () => {
      const result = validateEventSchema(validEvent);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid schema_version', () => {
      const event = { ...validEvent, schema_version: '2.0' as any };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid schema_version: 2.0');
    });

    it('should reject invalid eventId', () => {
      const event = { ...validEvent, eventId: 'not-a-uuid' };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid eventId format: not-a-uuid');
    });

    it('should reject invalid timestamp', () => {
      const event = { ...validEvent, ts: -1 };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid timestamp: -1');
    });

    it('should reject negative monotonicSeq', () => {
      const event = { ...validEvent, monotonicSeq: -1 };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid monotonicSeq: -1');
    });

    it('should reject empty projectId', () => {
      const event = { ...validEvent, projectId: '' };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('projectId cannot be empty');
    });

    it('should reject invalid projectId format', () => {
      const event = { ...validEvent, projectId: 'not-hex-16-chars' };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid projectId format: not-hex-16-chars');
    });

    it('should reject invalid category', () => {
      const event = { ...validEvent, category: 'invalid' as any };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid category: invalid');
    });

    it('should reject empty action', () => {
      const event = { ...validEvent, action: '' };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('action cannot be empty');
    });

    it('should reject invalid payloadBlobRef', () => {
      const event = { ...validEvent, payloadBlobRef: 'invalid-ref' };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid payloadBlobRef format: invalid-ref');
    });

    it('should accept valid payloadBlobRef', () => {
      const event = { 
        ...validEvent, 
        payloadBlobRef: 'blob://a1b2c3d4e5f678901234567890abcdef0123456789abcdef0123456789abcdef' 
      };
      const result = validateEventSchema(event);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('createEvent', () => {
    it('should create valid event with all required fields', () => {
      const eventData = {
        projectId: 'a1b2c3d4e5f67890',
        workItemId: 'workitem-123',
        actor: { id: 'agent-1', name: 'Test Agent', type: 'agent' } as const,
        category: 'workflow' as const,
        action: 'workflow.started',
        payload: { workflowId: 'test-workflow' }
      };

      const event = createEvent(eventData);
      
      // Check required fields are present
      expect(event.schema_version).toBe('1.0');
      expect(event.eventId).toBeDefined();
      expect(event.ts).toBeGreaterThan(0);
      expect(event.monotonicSeq).toBeGreaterThanOrEqual(0);
      expect(event.projectId).toBe('a1b2c3d4e5f67890');
      expect(event.workItemId).toBe('workitem-123');
      expect(event.actor).toEqual(eventData.actor);
      expect(event.category).toBe('workflow');
      expect(event.action).toBe('workflow.started');
      expect(event.payload).toEqual({ workflowId: 'test-workflow' });
      
      // Validate the event
      const validation = validateEventSchema(event);
      expect(validation.isValid).toBe(true);
    });

    it('should create events with monotonic timestamps', () => {
      const timestampGenerator = new MonotonicTimestamp();
      const eventData = {
        projectId: 'a1b2c3d4e5f67890',
        workItemId: null,
        actor: null,
        category: 'system' as const,
        action: 'system.startup',
        payload: undefined
      };

      const event1 = createEvent(eventData, timestampGenerator);
      const event2 = createEvent(eventData, timestampGenerator);
      
      // Timestamps should be monotonic
      expect(event2.ts).toBeGreaterThanOrEqual(event1.ts);
      if (event2.ts === event1.ts) {
        expect(event2.monotonicSeq).toBe(event1.monotonicSeq + 1);
      }
    });
  });

  describe('Event Schema Constants', () => {
    it('should have correct constants', () => {
      expect(EVENT_SCHEMA.VERSION).toBe('1.0');
      expect(EVENT_SCHEMA.MAX_PAYLOAD_SIZE).toBe(64 * 1024);
      expect(EVENT_SCHEMA.BLOB_REF_PREFIX).toBe('blob://');
      expect(EVENT_SCHEMA.PROJECT_ID_LENGTH).toBe(16);
      expect(EVENT_SCHEMA.TIMESTAMP_PRECISION).toBe('nanoseconds');
    });
  });
});