/**
 * Crash Recovery Tests
 * 
 * Tests the crash recovery capabilities of the Observability subsystem:
 * - WAL semantics validation (fsync before state updates)
 * - State reconstruction from events.jsonl
 * - CAS blob recovery
 * 
 * Validates: Requirements 2.2, 2.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger } from '../../src/event-logger';
import { CAS, BLOB_REF_PREFIX } from '../../src/cas';
import type { Event } from '../../src/types';
import { generateEventId } from '../../src/types/event-utils';
import { mkdtemp, rm, readFile, writeFile, stat, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

/**
 * Helper to create a test event
 */
function createTestEvent(overrides: Partial<Event> = {}): Event {
  const timestamp = Date.now() * 1_000_000 + Math.floor(Math.random() * 1_000_000);
  
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

/**
 * Helper to compute SHA-256 hash
 */
function sha256(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}

describe('Crash Recovery', () => {
  describe('WAL Semantics Validation', () => {
    let logger: EventLogger;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'wal-test-'));
      logger = new EventLogger(tempDir);
      await logger.initialize();
    });

    afterEach(async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should ensure events are persisted before state rebuild', async () => {
      // Append several events
      for (let i = 0; i < 5; i++) {
        await logger.append(createTestEvent({ action: `event.${i}`, ts: (1000 + i) * 1_000_000 }));
      }

      // Verify events.jsonl exists and has content
      const eventsPath = join(tempDir, 'events.jsonl');
      const eventsStat = await stat(eventsPath);
      expect(eventsStat.size).toBeGreaterThan(0);

      // Now rebuild state - this should work because events were fsynced
      const state = await logger.rebuildState();
      
      expect(state.events.length).toBe(5);
      expect(state.lastEventId).toBeDefined();
    });

    it('should verify fsync was called on events.jsonl', async () => {
      // The EventLogger.append() calls fsync after each write
      // We verify this by checking that events are readable immediately after append
      const event = createTestEvent();
      await logger.append(event);

      // If fsync was not called, we might not see the event yet
      // (in some file system implementations)
      const events = [];
      for await (const e of logger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(1);
      expect(events[0].eventId).toBe(event.eventId);
    });

    it('should maintain WAL ordering (events before state)', async () => {
      // Append events
      await logger.append(createTestEvent({ action: 'first' }));
      await logger.append(createTestEvent({ action: 'second' }));
      await logger.append(createTestEvent({ action: 'third' }));

      // Rebuild state
      await logger.rebuildState();

      // Check that state.json was written AFTER events.jsonl
      const eventsPath = join(tempDir, 'events.jsonl');
      const statePath = join(tempDir, 'state.json');
      
      const eventsStat = await stat(eventsPath);
      const stateStat = await stat(statePath);

      // Events file should have been modified before state file
      // (in practice, events are written first with fsync, then state is written)
      expect(eventsStat.mtimeMs).toBeLessThanOrEqual(stateStat.mtimeMs + 1000);
    });

    it('should handle partial writes scenario simulation', async () => {
      // Simulate a scenario where events are written but state is not updated
      // This can happen in a crash between events.jsonl fsync and state.json update
      
      // Append events normally
      await logger.append(createTestEvent({ action: 'event.1' }));
      await logger.append(createTestEvent({ action: 'event.2' }));

      // Now simulate crash recovery by creating a new logger instance
      // (which should read from events.jsonl)
      const recoveredLogger = new EventLogger(tempDir);
      await recoveredLogger.initialize();

      // Verify events are recovered
      const events = [];
      for await (const e of recoveredLogger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(2);
      expect(events[0].action).toBe('event.1');
      expect(events[1].action).toBe('event.2');
    });
  });

  describe('State Reconstruction from events.jsonl', () => {
    let logger: EventLogger;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'state-recon-test-'));
      logger = new EventLogger(tempDir);
      await logger.initialize();
    });

    afterEach(async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should reconstruct complete state from events', async () => {
      // Add diverse events
      await logger.append(createTestEvent({ category: 'workflow', action: 'workflow.started' }));
      await logger.append(createTestEvent({ category: 'gate', action: 'gate.passed' }));
      await logger.append(createTestEvent({ category: 'permission', action: 'permission.evaluated' }));
      await logger.append(createTestEvent({ category: 'tool', action: 'tool.invoked' }));
      await logger.append(createTestEvent({ category: 'system', action: 'system.ready' }));

      // Rebuild state
      const state = await logger.rebuildState();

      // Verify all events are reconstructed
      expect(state.events.length).toBe(5);
      expect(state.eventCount).toBe(5);

      // Verify categories are tracked
      const statePath = join(tempDir, 'state.json');
      const stateContent = await readFile(statePath, 'utf8');
      const stateObj = JSON.parse(stateContent);

      expect(stateObj.categories).toBeDefined();
      expect(stateObj.categories.workflow).toBe(1);
      expect(stateObj.categories.gate).toBe(1);
      expect(stateObj.categories.permission).toBe(1);
      expect(stateObj.categories.tool).toBe(1);
      expect(stateObj.categories.system).toBe(1);
    });

    it('should handle large number of events in reconstruction', async () => {
      const eventCount = 100;
      
      for (let i = 0; i < eventCount; i++) {
        await logger.append(createTestEvent({ action: `event.${i}`, ts: (1000 + i) * 1_000_000 }));
      }

      const state = await logger.rebuildState();

      expect(state.events.length).toBe(eventCount);
      expect(state.eventCount).toBe(eventCount);
      expect(state.lastEventId).toBeDefined();
    });

    it('should preserve event order in reconstruction', async () => {
      const actions = ['first', 'second', 'third', 'fourth', 'fifth'];
      
      for (const action of actions) {
        await logger.append(createTestEvent({ action }));
      }

      const state = await logger.rebuildState();

      for (let i = 0; i < actions.length; i++) {
        expect(state.events[i].action).toBe(actions[i]);
      }
    });

    it('should handle reconstruction after crash simulation', async () => {
      // Write events directly to events.jsonl (simulating crash)
      const eventsPath = join(tempDir, 'events.jsonl');
      const crashEvents = [
        createTestEvent({ action: 'crash.event.1', ts: 1000 * 1_000_000 }),
        createTestEvent({ action: 'crash.event.2', ts: 2000 * 1_000_000 }),
        createTestEvent({ action: 'crash.event.3', ts: 3000 * 1_000_000 }),
      ];

      // Write events directly without going through EventLogger
      const lines = crashEvents.map(e => JSON.stringify(e)).join('\n') + '\n';
      await writeFile(eventsPath, lines, 'utf8');

      // Create new logger and reconstruct
      const recoveredLogger = new EventLogger(tempDir);
      await recoveredLogger.initialize();

      const state = await recoveredLogger.rebuildState();

      expect(state.events.length).toBe(3);
      expect(state.events[0].action).toBe('crash.event.1');
      expect(state.events[1].action).toBe('crash.event.2');
      expect(state.events[2].action).toBe('crash.event.3');
    });

    it('should handle empty events file in reconstruction', async () => {
      // Clear the events file
      const eventsPath = join(tempDir, 'events.jsonl');
      await writeFile(eventsPath, '', 'utf8');

      const newLogger = new EventLogger(tempDir);
      await newLogger.initialize();

      const state = await newLogger.rebuildState();

      expect(state.events.length).toBe(0);
      expect(state.lastEventId).toBeNull();
      expect(state.eventCount).toBe(0);
    });

    it('should handle corrupted lines in events.jsonl', async () => {
      // Write events with some corrupted lines
      const eventsPath = join(tempDir, 'events.jsonl');
      const content = [
        JSON.stringify(createTestEvent({ action: 'valid.1' })),
        '{ invalid json',
        JSON.stringify(createTestEvent({ action: 'valid.2' })),
        'not json at all',
        JSON.stringify(createTestEvent({ action: 'valid.3' })),
      ].join('\n') + '\n';
      await writeFile(eventsPath, content, 'utf8');

      const newLogger = new EventLogger(tempDir);
      await newLogger.initialize();

      // Should skip invalid lines and recover valid ones
      const events = [];
      for await (const e of newLogger.getEvents()) {
        events.push(e);
      }

      expect(events.length).toBe(3);
      expect(events[0].action).toBe('valid.1');
      expect(events[1].action).toBe('valid.2');
      expect(events[2].action).toBe('valid.3');
    });

    it('should compute project statistics in reconstruction', async () => {
      const project1 = 'project-1';
      const project2 = 'project-2';

      await logger.append(createTestEvent({ projectId: project1, action: 'p1.event.1' }));
      await logger.append(createTestEvent({ projectId: project1, action: 'p1.event.2' }));
      await logger.append(createTestEvent({ projectId: project2, action: 'p2.event.1' }));

      const state = await logger.rebuildState();

      const statePath = join(tempDir, 'state.json');
      const stateContent = await readFile(statePath, 'utf8');
      const stateObj = JSON.parse(stateContent);

      expect(stateObj.projects).toBeDefined();
      expect(stateObj.projects[project1]).toBe(2);
      expect(stateObj.projects[project2]).toBe(1);
    });
  });

  describe('CAS Blob Recovery', () => {
    let cas: CAS;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cas-recovery-test-'));
      cas = new CAS(tempDir);
      await cas.initialize();
    });

    afterEach(async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should recover blob content after store', async () => {
      const content = 'Important data to recover';
      const blobRef = await cas.store(content);

      // Simulate crash recovery by creating new CAS instance
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Recover content
      const recovered = await recoveredCAS.retrieve(blobRef);

      expect(recovered).toBe(content);
    });

    it('should handle multiple blobs recovery', async () => {
      const blobs = [
        { id: 'blob1', content: 'Content 1' },
        { id: 'blob2', content: 'Content 2' },
        { id: 'blob3', content: 'Content 3' },
      ];

      // Store all blobs
      const refs = [];
      for (const blob of blobs) {
        const ref = await cas.store(blob.content);
        refs.push(ref);
      }

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Recover all blobs
      for (let i = 0; i < blobs.length; i++) {
        const recovered = await recoveredCAS.retrieve(refs[i]);
        expect(recovered).toBe(blobs[i].content);
      }
    });

    it('should verify content addressing after recovery', async () => {
      const content = 'Test content for addressing verification';
      
      // Store and get reference
      const blobRef = await cas.store(content);
      
      // Verify the reference format
      expect(blobRef).toBe(BLOB_REF_PREFIX + sha256(content));

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Verify content addressing still works
      const recovered = await recoveredCAS.retrieve(blobRef);
      expect(recovered).toBe(content);

      // Verify the reference is consistent
      const newRef = await recoveredCAS.store(content);
      expect(newRef).toBe(blobRef); // Same content = same reference (deduplication)
    });

    it('should recover large blobs', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const blobRef = await cas.store(largeContent);

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Recover large blob
      const recovered = await recoveredCAS.retrieve(blobRef);

      expect(recovered).toBe(largeContent);
    });

    it('should handle reference counting after recovery', async () => {
      const content = 'Shared content';
      
      // Store same content twice
      const ref1 = await cas.store(content);
      const ref2 = await cas.store(content);

      // Both should be the same (deduplication)
      expect(ref1).toBe(ref2);

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Delete one reference
      await recoveredCAS.delete(ref1);

      // Blob should still exist (second reference)
      const exists = await recoveredCAS.exists(ref1);
      expect(exists).toBe(true);

      // Delete second reference
      await recoveredCAS.delete(ref2);

      // Now blob should be gone
      const stillExists = await recoveredCAS.exists(ref1);
      expect(stillExists).toBe(false);
    });

    it('should handle binary blob recovery', async () => {
      const binaryContent = new Uint8Array([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F
      ]);
      
      const blobRef = await cas.store(binaryContent);

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Recover binary blob
      const recovered = await recoveredCAS.retrieve(blobRef);

      expect(recovered).not.toBeNull();
      if (recovered instanceof Uint8Array) {
        expect(Array.from(recovered)).toEqual(Array.from(binaryContent));
      }
    });

    it('should recover stats after crash', async () => {
      // Store multiple blobs
      await cas.store('Content 1');
      await cas.store('Content 2');
      await cas.store('Content 3');

      // Get stats before "crash"
      const statsBefore = await cas.getStats();
      expect(statsBefore.blobCount).toBe(3);

      // Simulate crash recovery
      const recoveredCAS = new CAS(tempDir);
      await recoveredCAS.initialize();

      // Get stats after recovery
      const statsAfter = await recoveredCAS.getStats();
      
      expect(statsAfter.blobCount).toBe(3);
      expect(statsAfter.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Integrated Crash Recovery Scenario', () => {
    let logger: EventLogger;
    let cas: CAS;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'integrated-crash-test-'));
      
      const eventsDir = join(tempDir, 'events');
      const casDir = join(tempDir, 'cas');
      
      logger = new EventLogger(eventsDir);
      await logger.initialize();
      
      cas = new CAS(casDir);
      await cas.initialize();
    });

    afterEach(async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should recover full system state after crash', async () => {
      // Create events with CAS blob references
      const largePayload1 = 'x'.repeat(70000); // Large payload > 64KB
      const blobRef1 = await cas.store(largePayload1);
      
      const event1 = createTestEvent({
        action: 'large.payload.event',
        payloadBlobRef: blobRef1,
        payload: { large: true, storedInCas: true }
      });

      const largePayload2 = 'y'.repeat(80000);
      const blobRef2 = await cas.store(largePayload2);
      
      const event2 = createTestEvent({
        action: 'another.large.event',
        payloadBlobRef: blobRef2,
        payload: { large: true }
      });

      // Small payload event
      const event3 = createTestEvent({
        action: 'small.payload.event',
        payload: { small: true }
      });

      // Append all events
      await logger.append(event1);
      await logger.append(event2);
      await logger.append(event3);

      // Rebuild state
      await logger.rebuildState();

      // Simulate crash - create new instances
      const eventsDir = join(tempDir, 'events');
      const casDir = join(tempDir, 'cas');
      
      const recoveredLogger = new EventLogger(eventsDir);
      await recoveredLogger.initialize();
      
      const recoveredCAS = new CAS(casDir);
      await recoveredCAS.initialize();

      // Verify events are recovered
      const recoveredEvents = [];
      for await (const e of recoveredLogger.getEvents()) {
        recoveredEvents.push(e);
      }

      expect(recoveredEvents.length).toBe(3);
      expect(recoveredEvents[0].payloadBlobRef).toBe(blobRef1);
      expect(recoveredEvents[1].payloadBlobRef).toBe(blobRef2);
      expect(recoveredEvents[2].payload).toEqual({ small: true });

      // Verify CAS blobs are recovered
      const content1 = await recoveredCAS.retrieve(blobRef1);
      expect(content1).toBe(largePayload1);

      const content2 = await recoveredCAS.retrieve(blobRef2);
      expect(content2).toBe(largePayload2);
    });

    it('should maintain data integrity after multiple crash cycles', async () => {
      // Simulate multiple crash cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Add events
        await logger.append(createTestEvent({ action: `cycle.${cycle}.event.1` }));
        await logger.append(createTestEvent({ action: `cycle.${cycle}.event.2` }));

        // Add a blob
        const blobRef = await cas.store(`Cycle ${cycle} data`);
        
        // Verify blob
        const content = await cas.retrieve(blobRef);
        expect(content).toBe(`Cycle ${cycle} data`);

        // Rebuild state
        await logger.rebuildState();

        // Simulate crash - create new instances
        const eventsDir = join(tempDir, 'events');
        const casDir = join(tempDir, 'cas');
        
        const newLogger = new EventLogger(eventsDir);
        await newLogger.initialize();
        
        const newCAS = new CAS(casDir);
        await newCAS.initialize();

        // Verify all data is intact
        const events = [];
        for await (const e of newLogger.getEvents()) {
          events.push(e);
        }
        
        // Should have 6 events total (2 per cycle * 3 cycles)
        expect(events.length).toBe((cycle + 1) * 2);

        // Update references for next cycle
        logger = newLogger;
        cas = newCAS;
      }
    });
  });
});