/**
 * Property 30: Event Schema Multi-sync Readiness Property-Based Test
 * 
 * **Validates: Property 30, Requirements 19.2**
 * 
 * Properties (using fast-check):
 * 1. Generate random events - All generated events should be valid
 * 2. Verify eventId uniqueness - eventId is globally unique (UUIDv7)
 * 3. Verify timestamp monotonicity - ts is monotonically non-decreasing within single machine
 * 4. Verify projectId non-empty and aggregatable - projectId is non-empty and can be used for aggregation
 * 
 * Feature: observability, Property 30: Event Schema Multi-sync Readiness
 * Derived-From: v6-architecture-overview Property 30
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createEvent,
  validateEventSchema,
  MonotonicTimestamp,
  calculateProjectId,
  EVENT_SCHEMA,
  isValidUuid
} from '../../src/types/event-utils';
import type { Event, EventCategory, AgentIdentity } from '../../src/types';
import * as fc from 'fast-check';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Property 30: Event Schema Multi-sync Readiness (PBT)', () => {
  // Arbitraries for generating random event data
  
  /**
   * Generate a random valid projectId (16 hex characters)
   */
  const projectIdArbitrary = fc.hexaString({ minLength: 16, maxLength: 16 });
  
  /**
   * Generate random project root paths for projectId calculation
   */
  const projectRootPathArbitrary = fc.oneof(
    fc.constant('/home/user/projects/my-app'),
    fc.constant('/workspace/specforge'),
    fc.constant('C:\\Users\\dev\\project'),
    fc.constant('/var/repos/app'),
    fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.length > 0)
  );
  
  /**
   * Generate random event categories
   */
  const categoryArbitrary: fc.Arbitrary<EventCategory> = fc.oneof(
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
  
  /**
   * Generate random event actions
   */
  const actionArbitrary = fc.oneof(
    fc.constant('workflow.started'),
    fc.constant('workflow.completed'),
    fc.constant('workflow.failed'),
    fc.constant('gate.passed'),
    fc.constant('gate.rejected'),
    fc.constant('permission.evaluated'),
    fc.constant('session.started'),
    fc.constant('session.ended'),
    fc.constant('tool.invoked'),
    fc.constant('heal.diagnosed'),
    fc.constant('modality.adapted'),
    fc.constant('migration.started'),
    fc.constant('system.error')
  );
  
  /**
   * Generate random workItemId or null
   */
  const workItemIdArbitrary = fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 5, maxLength: 50 }).map(s => `workitem-${s}`)
  );
  
  /**
   * Generate random actor or null
   */
  const actorArbitrary: fc.Arbitrary<AgentIdentity | null> = fc.oneof(
    fc.constant(null),
    fc.record({
      id: fc.string({ minLength: 3, maxLength: 30 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      type: fc.oneof(
        fc.constant('agent'),
        fc.constant('system'),
        fc.constant('user')
      )
    })
  );
  
  /**
   * Generate random payload (optional)
   */
  const payloadArbitrary = fc.oneof(
    fc.constant(undefined),
    fc.record({
      message: fc.string(),
      data: fc.json()
    }),
    fc.record({
      error: fc.string(),
      code: fc.integer()
    })
  );
  
  /**
   * Generate random blob reference (optional)
   */
  const blobRefArbitrary: fc.Arbitrary<string | undefined> = fc.oneof(
    fc.constant(undefined),
    fc.hexaString({ minLength: 64, maxLength: 64 }).map(hash => `blob://${hash}`)
  );
  
  /**
   * Generate complete event data (without generated fields)
   */
  const eventDataArbitrary = fc.record({
    projectId: projectIdArbitrary,
    workItemId: workItemIdArbitrary,
    actor: actorArbitrary,
    category: categoryArbitrary,
    action: actionArbitrary,
    payload: payloadArbitrary,
    payloadBlobRef: blobRefArbitrary
  });

  // ============================================================
  // Property 30.1: eventId is globally unique (UUIDv7)
  // ============================================================
  describe('Property 30.1: eventId is globally unique (UUIDv7)', () => {
    it('should generate unique eventIds for each event', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const timestampGenerator = new MonotonicTimestamp();
            
            // Generate multiple events
            const eventIds = new Set<string>();
            for (let i = 0; i < 100; i++) {
              const event = createEvent(data, timestampGenerator);
              eventIds.add(event.eventId);
            }
            
            // All eventIds should be unique
            expect(eventIds.size).toBe(100);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should generate valid UUIDv7 format for all events', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const event = createEvent(data);
            
            // Validate UUIDv7 format
            expect(isValidUuid(event.eventId)).toBe(true);
            
            // Check version is 7
            const parts = event.eventId.split('-');
            expect(parts[2].startsWith('7')).toBe(true);
            
            // Check variant is RFC 4122 (8, 9, a, or b)
            expect(['8', '9', 'a', 'b'].includes(parts[3][0])).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have different eventIds for events created at different times', async () => {
      const data = await eventDataArbitrary.generate(fc.mersenne(42)).value;
      
      // Create event with first timestamp generator
      const gen1 = new MonotonicTimestamp();
      const event1 = createEvent(data, gen1);
      
      // Wait a tiny bit and create event with second generator
      await new Promise(resolve => setTimeout(resolve, 1));
      const gen2 = new MonotonicTimestamp();
      const event2 = createEvent(data, gen2);
      
      // Event IDs should be different
      expect(event1.eventId).not.toBe(event2.eventId);
    });
  });

  // ============================================================
  // Property 30.2: ts is monotonically non-decreasing
  // ============================================================
  describe('Property 30.2: ts is monotonically non-decreasing within a single machine', () => {
    it('should generate monotonic timestamps for sequential events', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const timestampGenerator = new MonotonicTimestamp();
            const events: Event[] = [];
            
            // Create sequential events
            for (let i = 0; i < 50; i++) {
              events.push(createEvent(data, timestampGenerator));
            }
            
            // Verify monotonic property
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
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain monotonicity across rapid event creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }),
          async (count) => {
            const timestampGenerator = new MonotonicTimestamp();
            const timestamps: number[] = [];
            const sequences: number[] = [];
            
            for (let i = 0; i < count; i++) {
              const data = await eventDataArbitrary.generate(fc.mersenne(i)).value;
              const event = createEvent(data, timestampGenerator);
              timestamps.push(event.ts);
              sequences.push(event.monotonicSeq);
            }
            
            // Verify timestamps are non-decreasing
            for (let i = 1; i < timestamps.length; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ============================================================
  // Property 30.3: projectId is non-empty and aggregatable
  // ============================================================
  describe('Property 30.3: projectId is non-empty and aggregatable by project dimension', () => {
    it('should always generate non-empty projectId', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const event = createEvent(data);
            
            // projectId should not be empty
            expect(event.projectId).toBeDefined();
            expect(event.projectId.length).toBeGreaterThan(0);
            expect(event.projectId.trim()).not.toBe('');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate projectId in correct format (16 hex chars)', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const event = createEvent(data);
            
            // Project ID should be exactly 16 hex characters
            expect(event.projectId).toMatch(/^[0-9a-f]{16}$/i);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct projectId from project root path', async () => {
      await fc.assert(
        fc.asyncProperty(
          projectRootPathArbitrary,
          async (projectRootPath) => {
            const projectId = calculateProjectId(projectRootPath);
            
            // Should be 16 hex characters
            expect(projectId).toMatch(/^[0-9a-f]{16}$/i);
            
            // Same path should produce same projectId
            const projectId2 = calculateProjectId(projectRootPath);
            expect(projectId).toBe(projectId2);
            
            // Different paths should (almost certainly) produce different projectIds
            const projectId3 = calculateProjectId(projectRootPath + '-different');
            // This is a probabilistic test - with SHA-256, collisions are extremely rare
            if (projectRootPath.length < 100) {
              expect(projectId).not.toBe(projectId3);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should support aggregation by projectId', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(eventDataArbitrary, { minLength: 10, maxLength: 50 }),
          async (dataArray) => {
            const events = dataArray.map((data, i) => {
              // Ensure different projectIds
              const modifiedData = { ...data, projectId: i.toString(16).padStart(16, '0') };
              return createEvent(modifiedData);
            });
            
            // Group by projectId (aggregation)
            const eventsByProject = new Map<string, Event[]>();
            for (const event of events) {
              if (!eventsByProject.has(event.projectId)) {
                eventsByProject.set(event.projectId, []);
              }
              eventsByProject.get(event.projectId)!.push(event);
            }
            
            // Should be able to aggregate all events by projectId
            expect(eventsByProject.size).toBe(events.length);
            
            // Each group should contain events with the same projectId
            for (const [projectId, projectEvents] of eventsByProject) {
              for (const event of projectEvents) {
                expect(event.projectId).toBe(projectId);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================
  // Property 30.4: Schema forward-compatibility
  // ============================================================
  describe('Property 30.4: Schema forward-compatible for multi-machine sync', () => {
    it('should have all required fields for future synchronization', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const event = createEvent(data);
            
            // All required fields must exist
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
            
            // eventId is globally unique
            expect(isValidUuid(event.eventId)).toBe(true);
            
            // ts is high-resolution (nanoseconds)
            expect(event.ts).toBeGreaterThan(0);
            
            // projectId allows partitioning
            expect(event.projectId).toBeDefined();
            expect(event.projectId.length).toBe(16);
            
            // category and action are present
            expect(event.category).toBeDefined();
            expect(event.action).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate against schema for all generated events', async () => {
      await fc.assert(
        fc.asyncProperty(
          eventDataArbitrary,
          async (data) => {
            const event = createEvent(data);
            const validation = validateEventSchema(event);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================
  // Combined property: All events satisfy all Property 30 requirements
  // ============================================================
  describe('Property 30 Combined: All events satisfy all multi-sync requirements', () => {
    it('should satisfy all Property 30 requirements for generated events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(eventDataArbitrary, { minLength: 1, maxLength: 100 }),
          async (dataArray) => {
            const timestampGenerator = new MonotonicTimestamp();
            const eventIds = new Set<string>();
            
            for (const data of dataArray) {
              const event = createEvent(data, timestampGenerator);
              
              // Property 30.1: eventId unique and valid UUIDv7
              expect(isValidUuid(event.eventId)).toBe(true);
              expect(eventIds.has(event.eventId)).toBe(false);
              eventIds.add(event.eventId);
              
              // Property 30.2: ts monotonic (checked via timestampGenerator)
              expect(event.ts).toBeGreaterThan(0);
              
              // Property 30.3: projectId non-empty and aggregatable
              expect(event.projectId).toBeDefined();
              expect(event.projectId.length).toBe(16);
              expect(event.projectId).toMatch(/^[0-9a-f]{16}$/i);
              
              // Property 30.4: forward compatibility
              expect(event.schema_version).toBe(EVENT_SCHEMA.VERSION);
              expect(event.category).toBeDefined();
              expect(event.action).toBeDefined();
              
              // Schema validation
              const validation = validateEventSchema(event);
              expect(validation.isValid).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle rapid event generation with correct monotonicity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),
          async (numEvents) => {
            const timestampGenerator = new MonotonicTimestamp();
            const events: Event[] = [];
            
            for (let i = 0; i < numEvents; i++) {
              const data = await eventDataArbitrary.generate(fc.mersenne(i)).value;
              events.push(createEvent(data, timestampGenerator));
            }
            
            // Verify all properties hold
            const eventIds = new Set<string>();
            
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              
              // Unique eventId
              expect(eventIds.has(event.eventId)).toBe(false);
              eventIds.add(event.eventId);
              
              // Valid UUIDv7
              expect(isValidUuid(event.eventId)).toBe(true);
              
              // Valid projectId
              expect(event.projectId).toMatch(/^[0-9a-f]{16}$/i);
              
              // Schema validation
              const validation = validateEventSchema(event);
              expect(validation.isValid).toBe(true);
              
              // Monotonicity (compare with previous)
              if (i > 0) {
                expect(event.ts).toBeGreaterThanOrEqual(events[i - 1].ts);
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});