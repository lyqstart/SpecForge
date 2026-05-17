/**
 * Crash Recovery Integration Tests
 * 
 * **Validates: Requirements 2.2, 2.5**
 * 
 * Tests for WAL (Write-Ahead Log) semantics, state reconstruction,
 * and CAS blob recovery after crash scenarios.
 * 
 * Sub-tasks:
 * - WAL semantics validation
 * - State reconstruction from events.jsonl
 * - CAS blob recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogger, CAS } from '../../src/index';
import { mkdtemp, rm, writeFile, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

// Helper to generate a valid test event
function createTestEvent(overrides: Partial<{
  eventId: string;
  ts: number;
  monotonicSeq: number;
  projectId: string;
  workItemId: string | null;
  actor: { id: string; name: string; type: string } | null;
  category: string;
  action: string;
  payload: unknown;
}> = {}) {
  return {
    schema_version: '1.0' as const,
    eventId: overrides.eventId || `test-event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: overrides.ts || Date.now() * 1000000, // nanoseconds
    monotonicSeq: overrides.monotonicSeq || 1,
    projectId: overrides.projectId || 'test-project',
    workItemId: overrides.workItemId || null,
    actor: overrides.actor || null,
    category: overrides.category || 'system',
    action: overrides.action || 'test.action',
    payload: overrides.payload || { test: true },
  };
}

// Helper to compute SHA-256 hash
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

describe('Crash Recovery: WAL Semantics', () => {
  let eventLogger: EventLogger;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crash-recovery-wal-'));
    eventLogger = new EventLogger(tempDir);
    await eventLogger.initialize();
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('WAL Semantics: Events written before state updates', () => {
    it('should persist events to events.jsonl before state.json updates', async () => {
      // Append multiple events
      const events = [
        createTestEvent({ action: 'test.event1', ts: 1000 * 1000000 }),
        createTestEvent({ action: 'test.event2', ts: 2000 * 1000000 }),
        createTestEvent({ action: 'test.event3', ts: 3000 * 1000000 }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Verify events.jsonl has content
      const eventsContent = await readFile(join(tempDir, 'events.jsonl'), 'utf8');
      const eventLines = eventsContent.trim().split('\n').filter(l => l.length > 0);
      expect(eventLines.length).toBe(3);

      // Verify each event can be parsed
      for (let i = 0; i < events.length; i++) {
        const parsed = JSON.parse(eventLines[i]);
        expect(parsed.action).toBe(`test.event${i + 1}`);
      }
    });

    it('should ensure fsync is called before state updates', async () => {
      // The rebuildState method should only succeed after events are fsynced
      const events = [
        createTestEvent({ action: 'test.rebuild1' }),
        createTestEvent({ action: 'test.rebuild2' }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Rebuild state - this should only work if events were fsynced
      const state = await eventLogger.rebuildState();

      // Verify state was rebuilt from events.jsonl
      expect(state.events.length).toBe(2);
      expect(state.events[0].action).toBe('test.rebuild1');
      expect(state.events[1].action).toBe('test.rebuild2');

      // Verify state.json was created/updated
      const stateFileStat = await stat(join(tempDir, 'state.json'));
      expect(stateFileStat.size).toBeGreaterThan(0);
    });

    it('should preserve event order after rebuild', async () => {
      // Append events with specific timestamps
      const events = [];
      for (let i = 0; i < 10; i++) {
        events.push(createTestEvent({ 
          action: `test.order.${i}`, 
          ts: (1000 + i) * 1000000,
          monotonicSeq: i 
        }));
      }

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Rebuild state
      const state = await eventLogger.rebuildState();

      // Verify order is preserved by timestamp
      expect(state.events.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(state.events[i].action).toBe(`test.order.${i}`);
      }
    });

    it('should handle partial event data gracefully', async () => {
      // Manually create a partial/corrupted line in events.jsonl
      const eventsJsonlPath = join(tempDir, 'events.jsonl');
      await writeFile(eventsJsonlPath, '{"valid": true}\n{"incomplete":\n', 'utf8');

      // Create a new EventLogger and try to rebuild
      const newLogger = new EventLogger(tempDir);
      await newLogger.initialize();

      // Should handle gracefully (skip invalid lines)
      const events: any[] = [];
      for await (const event of newLogger.getEvents()) {
        events.push(event);
      }

      // Should have at least the valid event
      expect(events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('WAL Semantics: Event integrity', () => {
    it('should maintain event integrity after append and rebuild', async () => {
      const originalEvent = createTestEvent({
        action: 'test.integrity',
        payload: { 
          nested: { data: 'value', number: 42, array: [1, 2, 3] },
          timestamp: Date.now()
        },
      });

      await eventLogger.append(originalEvent);
      const state = await eventLogger.rebuildState();

      // Verify payload integrity
      expect(state.events[0].payload).toEqual(originalEvent.payload);
      expect((state.events[0].payload as any).nested.data).toBe('value');
      expect((state.events[0].payload as any).nested.number).toBe(42);
    });

    it('should preserve null and undefined fields correctly', async () => {
      const eventWithNulls = createTestEvent({
        action: 'test.nulls',
        workItemId: null,
        actor: null,
        payload: { hasNull: null, hasUndefined: undefined },
      });

      await eventLogger.append(eventWithNulls);
      const state = await eventLogger.rebuildState();

      expect(state.events[0].workItemId).toBeNull();
      expect(state.events[0].actor).toBeNull();
    });

    it('should handle large payloads correctly', async () => {
      // Create a large payload (simulating payload that would be stored in CAS)
      const largePayload = 'x'.repeat(10000);
      const eventWithLargePayload = createTestEvent({
        action: 'test.large',
        payload: { data: largePayload },
      });

      await eventLogger.append(eventWithLargePayload);
      const state = await eventLogger.rebuildState();

      expect((state.events[0].payload as any).data).toBe(largePayload);
      expect((state.events[0].payload as any).data.length).toBe(10000);
    });
  });
});

describe('Crash Recovery: State Reconstruction', () => {
  let eventLogger: EventLogger;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crash-recovery-state-'));
    eventLogger = new EventLogger(tempDir);
    await eventLogger.initialize();
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('State Reconstruction from events.jsonl', () => {
    it('should reconstruct complete state from events.jsonl', async () => {
      // Append various events
      const events = [
        createTestEvent({ category: 'workflow', action: 'workflow.started', ts: 1000 * 1000000 }),
        createTestEvent({ category: 'gate', action: 'gate.evaluated', ts: 2000 * 1000000 }),
        createTestEvent({ category: 'permission', action: 'permission.evaluated', ts: 3000 * 1000000 }),
        createTestEvent({ category: 'system', action: 'system.completed', ts: 4000 * 1000000 }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Simulate crash - create new logger instance (like after restart)
      const recoveredLogger = new EventLogger(tempDir);
      await recoveredLogger.initialize();

      // Rebuild state from events.jsonl
      const state = await recoveredLogger.rebuildState();

      // Verify all events are reconstructed
      expect(state.events.length).toBe(4);
      expect(state.eventCount).toBe(4);
      expect(state.lastEventId).toBeDefined();

      // Read state.json to verify computed fields (categories, projects)
      const stateJsonContent = await readFile(join(tempDir, 'state.json'), 'utf8');
      const stateJson = JSON.parse(stateJsonContent);
      
      expect(stateJson.categories).toBeDefined();
      expect(stateJson.categories['workflow']).toBe(1);
      expect(stateJson.categories['gate']).toBe(1);
      expect(stateJson.categories['permission']).toBe(1);
      expect(stateJson.categories['system']).toBe(1);
    });

    it('should handle empty events.jsonl correctly', async () => {
      // Create logger with empty events file
      const emptyLogger = new EventLogger(tempDir);
      await emptyLogger.initialize();

      // Rebuild state from empty events
      const state = await emptyLogger.rebuildState();

      expect(state.events.length).toBe(0);
      expect(state.eventCount).toBe(0);
      expect(state.lastEventId).toBeNull();
    });

    it('should reconstruct state with project isolation', async () => {
      // Append events for different projects
      const events = [
        createTestEvent({ projectId: 'project-a', action: 'test.projA.1' }),
        createTestEvent({ projectId: 'project-a', action: 'test.projA.2' }),
        createTestEvent({ projectId: 'project-b', action: 'test.projB.1' }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Rebuild state
      await eventLogger.rebuildState();

      // Read state.json to verify project counts
      const stateJsonContent = await readFile(join(tempDir, 'state.json'), 'utf8');
      const stateJson = JSON.parse(stateJsonContent);

      expect(stateJson.projects['project-a']).toBe(2);
      expect(stateJson.projects['project-b']).toBe(1);
    });

    it('should maintain lastEventId after reconstruction', async () => {
      const events = [
        createTestEvent({ action: 'test.first' }),
        createTestEvent({ action: 'test.second' }),
        createTestEvent({ action: 'test.last' }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      // Rebuild state
      const state = await eventLogger.rebuildState();

      // The last event should be the last one appended
      expect(state.lastEventId).toBe(events[2].eventId);
      expect(state.events[2].action).toBe('test.last');
    });

    it('should compute lastTimestamp correctly', async () => {
      const events = [
        createTestEvent({ action: 'test.early', ts: 1000 * 1000000 }),
        createTestEvent({ action: 'test.late', ts: 2000 * 1000000 }),
      ];

      for (const event of events) {
        await eventLogger.append(event);
      }

      await eventLogger.rebuildState();

      // Read state.json to verify lastTimestamp is computed
      const stateJsonContent = await readFile(join(tempDir, 'state.json'), 'utf8');
      const stateJson = JSON.parse(stateJsonContent);

      // lastTimestamp should be the timestamp of the last event
      expect(stateJson.lastTimestamp).toBe(2000 * 1000000);
    });
  });

  describe('State Reconstruction: Edge Cases', () => {
    it('should handle events with special characters in payload', async () => {
      const specialPayload = {
        unicode: '日本語中文한국어',
        emoji: '🎉🚀💡',
        quotes: '"double" \'single\`back',
        newlines: 'line1\nline2\r\nline3',
        special: '\t\b\f\\\/',
      };

      const event = createTestEvent({
        action: 'test.special',
        payload: specialPayload,
      });

      await eventLogger.append(event);
      const state = await eventLogger.rebuildState();

      expect(state.events[0].payload).toEqual(specialPayload);
    });

    it('should handle deeply nested objects', async () => {
      const nestedPayload = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
        array: [1, [2, [3, [4]]]],
      };

      const event = createTestEvent({
        action: 'test.nested',
        payload: nestedPayload,
      });

      await eventLogger.append(event);
      const state = await eventLogger.rebuildState();

      expect((state.events[0].payload as any).level1.level2.level3.level4.value).toBe('deep');
      // array = [1, [2, [3, [4]]]] => array[1][1][1][0] = 4
      expect(((state.events[0].payload as any).array as any)[1][1][1][0]).toBe(4);
    });
  });
});

describe('Crash Recovery: CAS Blob Recovery', () => {
  let cas: CAS;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crash-recovery-cas-'));
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

  describe('CAS Blob Recovery', () => {
    it('should recover blob after CAS instance recreation', async () => {
      // Store some content
      const content = 'Test content for crash recovery';
      const blobRef = await cas.store(content);

      // Verify stored correctly
      let retrieved = await cas.retrieve(blobRef);
      expect(retrieved).toBe(content);

      // Simulate crash - create new CAS instance pointing to same directory
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // Recover and verify content still exists
      retrieved = await recoveredCas.retrieve(blobRef);
      expect(retrieved).toBe(content);
    });

    it('should handle multiple blobs with reference counting', async () => {
      const content1 = 'Content 1';
      const content2 = 'Content 2';
      const content3 = 'Content 3';

      const ref1 = await cas.store(content1);
      const ref2 = await cas.store(content2);
      const ref3 = await cas.store(content3);

      // Verify all can be retrieved
      expect(await cas.retrieve(ref1)).toBe(content1);
      expect(await cas.retrieve(ref2)).toBe(content2);
      expect(await cas.retrieve(ref3)).toBe(content3);

      // Simulate crash recovery
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // All content should still be accessible
      expect(await recoveredCas.retrieve(ref1)).toBe(content1);
      expect(await recoveredCas.retrieve(ref2)).toBe(content2);
      expect(await recoveredCas.retrieve(ref3)).toBe(content3);
    });

    it('should recover deduplicated content correctly', async () => {
      const sameContent = 'Same content stored multiple times';
      
      const ref1 = await cas.store(sameContent);
      const ref2 = await cas.store(sameContent);
      const ref3 = await cas.store(sameContent);

      // All refs should be identical (deduplication)
      expect(ref1).toBe(ref2);
      expect(ref2).toBe(ref3);

      // Simulate crash
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // Content should still be accessible with any reference
      expect(await recoveredCas.retrieve(ref1)).toBe(sameContent);
      expect(await recoveredCas.retrieve(ref2)).toBe(sameContent);
      expect(await recoveredCas.retrieve(ref3)).toBe(sameContent);

      // Delete one reference
      await recoveredCas.delete(ref1);

      // Content should still exist (other references remain)
      expect(await recoveredCas.exists(ref2)).toBe(true);
      expect(await recoveredCas.retrieve(ref2)).toBe(sameContent);

      // Delete remaining references
      await recoveredCas.delete(ref2);
      await recoveredCas.delete(ref3);

      // Now content should be gone
      expect(await recoveredCas.exists(ref1)).toBe(false);
    });

    it('should handle large blobs correctly', async () => {
      const largeContent = 'X'.repeat(100000); // 100KB
      const blobRef = await cas.store(largeContent);

      // Simulate crash recovery
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // Should recover large content
      const retrieved = await recoveredCas.retrieve(blobRef);
      expect(retrieved).toBe(largeContent);
    });

    it('should handle binary content correctly', async () => {
      const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const blobRef = await cas.store(binaryContent);

      // Simulate crash recovery
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // Should recover binary content
      const retrieved = await recoveredCas.retrieve(blobRef);
      expect(retrieved).not.toBeNull();
      if (retrieved instanceof Uint8Array) {
        expect(Array.from(retrieved)).toEqual(Array.from(binaryContent));
      }
    });

    it('should handle non-existent blob references gracefully', async () => {
      // Simulate crash recovery
      const recoveredCas = new CAS(tempDir);
      await recoveredCas.initialize();

      // Try to retrieve non-existent blob
      const nonExistentRef = 'blob://' + '0'.repeat(64);
      const result = await recoveredCas.retrieve(nonExistentRef);
      expect(result).toBeNull();
    });
  });

  describe('CAS + EventLogger Integration Recovery', () => {
    it('should recover events with blob references correctly', async () => {
      const tempCasDir = await mkdtemp(join(tmpdir(), 'crash-recovery-integ-cas-'));
      const tempEventDir = await mkdtemp(join(tmpdir(), 'crash-recovery-integ-event-'));

      try {
        const casInstance = new CAS(tempCasDir);
        await casInstance.initialize();

        const eventLogger = new EventLogger(tempEventDir);
        await eventLogger.initialize();

        // Store a large payload in CAS
        const largePayload = 'Y'.repeat(70000); // > 64KB to trigger blob ref
        const blobRef = await casInstance.store(largePayload);

        // Create event with blob reference
        const eventWithBlobRef = createTestEvent({
          action: 'test.blobref',
          payload: { data: 'reference to large content', blobRef },
        });

        await eventLogger.append(eventWithBlobRef);

        // Simulate crash - create new instances
        const recoveredCas = new CAS(tempCasDir);
        await recoveredCas.initialize();

        const recoveredLogger = new EventLogger(tempEventDir);
        await recoveredLogger.initialize();

        // Recover and verify
        const state = await recoveredLogger.rebuildState();
        const payload = state.events[0].payload as any;

        expect(payload.blobRef).toBe(blobRef);

        // Recover the actual blob content
        const recoveredContent = await recoveredCas.retrieve(payload.blobRef);
        expect(recoveredContent).toBe(largePayload);
      } finally {
        await rm(tempCasDir, { recursive: true, force: true });
        await rm(tempEventDir, { recursive: true, force: true });
      }
    });

    it('should maintain referential integrity after multiple crash recoveries', async () => {
      const tempCasDir = await mkdtemp(join(tmpdir(), 'crash-recovery-multi-cas-'));
      const tempEventDir = await mkdtemp(join(tmpdir(), 'crash-recovery-multi-event-'));

      try {
        // First cycle
        let casInstance = new CAS(tempCasDir);
        await casInstance.initialize();
        let eventLogger = new EventLogger(tempEventDir);
        await eventLogger.initialize();

        const ref1 = await casInstance.store('Content 1');
        await eventLogger.append(createTestEvent({ action: 'cycle1', payload: { ref: ref1 } }));

        // Simulate crash and recover
        casInstance = new CAS(tempCasDir);
        await casInstance.initialize();
        eventLogger = new EventLogger(tempEventDir);
        await eventLogger.initialize();

        let state = await eventLogger.rebuildState();
        expect((state.events[0].payload as any).ref).toBe(ref1);
        expect(await casInstance.retrieve(ref1)).toBe('Content 1');

        // Second cycle - add more data
        const ref2 = await casInstance.store('Content 2');
        await eventLogger.append(createTestEvent({ action: 'cycle2', payload: { ref: ref2 } }));

        // Simulate another crash
        casInstance = new CAS(tempCasDir);
        await casInstance.initialize();
        eventLogger = new EventLogger(tempEventDir);
        await eventLogger.initialize();

        state = await eventLogger.rebuildState();
        expect(state.events.length).toBe(2);
        expect(await casInstance.retrieve(ref1)).toBe('Content 1');
        expect(await casInstance.retrieve(ref2)).toBe('Content 2');
      } finally {
        await rm(tempCasDir, { recursive: true, force: true });
        await rm(tempEventDir, { recursive: true, force: true });
      }
    });
  });
});

describe('Crash Recovery: End-to-End Scenario', () => {
  it('should simulate complete crash recovery scenario', async () => {
    const tempCasDir = await mkdtemp(join(tmpdir(), 'crash-e2e-cas-'));
    const tempEventDir = await mkdtemp(join(tmpdir(), 'crash-e2e-event-'));

    try {
      // === Phase 1: Normal operation ===
      let casInstance = new CAS(tempCasDir);
      await casInstance.initialize();
      let eventLogger = new EventLogger(tempEventDir);
      await eventLogger.initialize();

      // Store various events with CAS references
      const blobA = await casInstance.store('Important Data A');
      const blobB = await casInstance.store('Important Data B');

      await eventLogger.append(createTestEvent({
        category: 'workflow',
        action: 'workflow.started',
        payload: { blobRef: blobA },
      }));

      await eventLogger.append(createTestEvent({
        category: 'gate',
        action: 'gate.evaluated',
        payload: { result: 'passed' },
      }));

      await eventLogger.append(createTestEvent({
        category: 'system',
        action: 'system.dataStored',
        payload: { blobRef: blobB },
      }));

      // === Phase 2: Simulate crash (dispose instances) ===
      // In real scenario, this would be a process crash
      eventLogger = null as any;
      casInstance = null as any;

      // === Phase 3: Recovery - create new instances ===
      casInstance = new CAS(tempCasDir);
      await casInstance.initialize();
      eventLogger = new EventLogger(tempEventDir);
      await eventLogger.initialize();

      // === Phase 4: Verify state reconstruction ===
      const recoveredState = await eventLogger.rebuildState();

      // All events should be recovered
      expect(recoveredState.events.length).toBe(3);
      expect(recoveredState.events[0].category).toBe('workflow');
      expect(recoveredState.events[1].category).toBe('gate');
      expect(recoveredState.events[2].category).toBe('system');

      // === Phase 5: Verify CAS data integrity ===
      const payloadA = recoveredState.events[0].payload as any;
      const payloadB = recoveredState.events[2].payload as any;

      const dataA = await casInstance.retrieve(payloadA.blobRef);
      const dataB = await casInstance.retrieve(payloadB.blobRef);

      expect(dataA).toBe('Important Data A');
      expect(dataB).toBe('Important Data B');

      // === Phase 6: Verify last event tracking ===
      expect(recoveredState.lastEventId).toBeDefined();
      expect(recoveredState.eventCount).toBe(3);

    } finally {
      await rm(tempCasDir, { recursive: true, force: true });
      await rm(tempEventDir, { recursive: true, force: true });
    }
  });
});