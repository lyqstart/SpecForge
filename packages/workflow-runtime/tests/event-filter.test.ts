/**
 * Event Filter Unit Tests
 * Tests for event filtering mechanism
 *
 * 规则 T1（清理必须与创建对称）：
 * 测试中创建的资源必须在 afterEach 中清理。
 * 规则 T4（不依赖进程退出判断通过）：
 * 每个测试必须有显式的 expect 断言。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventFilter, FilterCriteria } from '../src/event-filter.js';
import { Event } from '../src/types.js';

describe('EventFilter', () => {
  let testEvents: Event[];

  beforeEach(() => {
    // Create test events with various types, sources, and timestamps
    const baseTime = 1000000;

    testEvents = [
      {
        eventId: 'evt-1',
        ts: baseTime,
        projectId: 'proj-1',
        action: 'workflow.started',
        payload: { instanceId: 'inst-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
      {
        eventId: 'evt-2',
        ts: baseTime + 1000,
        projectId: 'proj-1',
        action: 'workflow.gate.started',
        payload: { gateId: 'gate-1' },
        metadata: { schemaVersion: '1.0', source: 'client' },
      },
      {
        eventId: 'evt-3',
        ts: baseTime + 2000,
        projectId: 'proj-1',
        action: 'workflow.gate.completed',
        payload: { gateId: 'gate-1', passed: true },
        metadata: { schemaVersion: '1.0', source: 'adapter' },
      },
      {
        eventId: 'evt-4',
        ts: baseTime + 3000,
        projectId: 'proj-1',
        action: 'workflow.completed',
        payload: { instanceId: 'inst-1' },
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      },
      {
        eventId: 'evt-5',
        ts: baseTime + 4000,
        projectId: 'proj-2',
        action: 'workflow.started',
        payload: { instanceId: 'inst-2' },
        metadata: { schemaVersion: '1.0', source: 'client' },
      },
    ];
  });

  afterEach(() => {
    // Clean up test data
    testEvents = [];
  });

  describe('filter() - basic filtering', () => {
    it('should return all events when no criteria provided', () => {
      const result = EventFilter.filter(testEvents, {});
      expect(result).toHaveLength(5);
      expect(result).toEqual(testEvents);
    });

    it('should return empty array for empty input', () => {
      const result = EventFilter.filter([], {});
      expect(result).toHaveLength(0);
    });

    it('should throw error for invalid events input', () => {
      expect(() => {
        EventFilter.filter(null as any, {});
      }).toThrow('Events must be an array');
    });

    it('should throw error for invalid criteria input', () => {
      expect(() => {
        EventFilter.filter(testEvents, null as any);
      }).toThrow('Criteria must be an object');
    });
  });

  describe('filter() - type filtering', () => {
    it('should filter by exact event type', () => {
      const result = EventFilter.filter(testEvents, { type: 'workflow.started' });
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('workflow.started');
      expect(result[1].action).toBe('workflow.started');
    });

    it('should filter by wildcard pattern - single level', () => {
      const result = EventFilter.filter(testEvents, { type: 'workflow.gate.*' });
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('workflow.gate.started');
      expect(result[1].action).toBe('workflow.gate.completed');
    });

    it('should filter by wildcard pattern - all events', () => {
      const result = EventFilter.filter(testEvents, { type: '*' });
      expect(result).toHaveLength(5);
    });

    it('should filter by wildcard pattern - prefix match', () => {
      const result = EventFilter.filter(testEvents, { type: 'workflow.*' });
      expect(result).toHaveLength(5);
    });

    it('should return empty array for non-matching type', () => {
      const result = EventFilter.filter(testEvents, { type: 'nonexistent.event' });
      expect(result).toHaveLength(0);
    });

    it('should handle complex wildcard patterns', () => {
      const result = EventFilter.filter(testEvents, { type: 'workflow.*.started' });
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('workflow.gate.started');
    });
  });

  describe('filter() - source filtering', () => {
    it('should filter by daemon source', () => {
      const result = EventFilter.filter(testEvents, { source: 'daemon' });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.metadata.source === 'daemon')).toBe(true);
    });

    it('should filter by client source', () => {
      const result = EventFilter.filter(testEvents, { source: 'client' });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.metadata.source === 'client')).toBe(true);
    });

    it('should filter by adapter source', () => {
      const result = EventFilter.filter(testEvents, { source: 'adapter' });
      expect(result).toHaveLength(1);
      expect(result[0].metadata.source).toBe('adapter');
    });

    it('should return empty array for non-matching source', () => {
      const result = EventFilter.filter(testEvents, { source: 'unknown' as any });
      expect(result).toHaveLength(0);
    });
  });

  describe('filter() - timestamp range filtering', () => {
    it('should filter by start timestamp only', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        timestampRange: { start: baseTime + 2000 },
      });
      expect(result).toHaveLength(3);
      expect(result[0].ts).toBe(baseTime + 2000);
    });

    it('should filter by end timestamp only', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        timestampRange: { end: baseTime + 2000 },
      });
      expect(result).toHaveLength(3);
      expect(result[result.length - 1].ts).toBe(baseTime + 2000);
    });

    it('should filter by timestamp range (start and end)', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        timestampRange: { start: baseTime + 1000, end: baseTime + 3000 },
      });
      expect(result).toHaveLength(3);
      expect(result[0].ts).toBe(baseTime + 1000);
      expect(result[result.length - 1].ts).toBe(baseTime + 3000);
    });

    it('should return empty array for non-matching timestamp range', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        timestampRange: { start: baseTime + 10000, end: baseTime + 20000 },
      });
      expect(result).toHaveLength(0);
    });

    it('should handle edge case: single timestamp', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        timestampRange: { start: baseTime, end: baseTime },
      });
      expect(result).toHaveLength(1);
      expect(result[0].ts).toBe(baseTime);
    });
  });

  describe('filter() - combined criteria', () => {
    it('should filter by type and source', () => {
      const result = EventFilter.filter(testEvents, {
        type: 'workflow.started',
        source: 'daemon',
      });
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('workflow.started');
      expect(result[0].metadata.source).toBe('daemon');
    });

    it('should filter by type and timestamp range', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        type: 'workflow.*',
        timestampRange: { start: baseTime + 1000, end: baseTime + 3000 },
      });
      expect(result).toHaveLength(3);
    });

    it('should filter by all criteria', () => {
      const baseTime = 1000000;
      const result = EventFilter.filter(testEvents, {
        type: 'workflow.gate.*',
        source: 'client',
        timestampRange: { start: baseTime + 1000, end: baseTime + 2000 },
      });
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('workflow.gate.started');
      expect(result[0].metadata.source).toBe('client');
    });

    it('should return empty array when no events match combined criteria', () => {
      const result = EventFilter.filter(testEvents, {
        type: 'workflow.started',
        source: 'adapter',
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('filter() - custom predicate', () => {
    it('should filter using custom predicate', () => {
      const result = EventFilter.filter(testEvents, {
        predicate: (event) => event.projectId === 'proj-2',
      });
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('proj-2');
    });

    it('should combine predicate with other criteria', () => {
      const result = EventFilter.filter(testEvents, {
        type: 'workflow.*',
        predicate: (event) => event.projectId === 'proj-1',
      });
      expect(result).toHaveLength(4);
      expect(result.every((e) => e.projectId === 'proj-1')).toBe(true);
    });

    it('should handle predicate that returns false for all', () => {
      const result = EventFilter.filter(testEvents, {
        predicate: () => false,
      });
      expect(result).toHaveLength(0);
    });

    it('should handle predicate that returns true for all', () => {
      const result = EventFilter.filter(testEvents, {
        predicate: () => true,
      });
      expect(result).toHaveLength(5);
    });
  });

  describe('filterByType()', () => {
    it('should filter by type using convenience method', () => {
      const result = EventFilter.filterByType(testEvents, 'workflow.started');
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.action === 'workflow.started')).toBe(true);
    });

    it('should support wildcard patterns', () => {
      const result = EventFilter.filterByType(testEvents, 'workflow.gate.*');
      expect(result).toHaveLength(2);
    });
  });

  describe('filterBySource()', () => {
    it('should filter by source using convenience method', () => {
      const result = EventFilter.filterBySource(testEvents, 'daemon');
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.metadata.source === 'daemon')).toBe(true);
    });
  });

  describe('filterByTimestampRange()', () => {
    it('should filter by timestamp range using convenience method', () => {
      const baseTime = 1000000;
      const result = EventFilter.filterByTimestampRange(
        testEvents,
        baseTime + 1000,
        baseTime + 3000
      );
      expect(result).toHaveLength(3);
    });

    it('should support start-only filtering', () => {
      const baseTime = 1000000;
      const result = EventFilter.filterByTimestampRange(testEvents, baseTime + 2000);
      expect(result).toHaveLength(3);
    });

    it('should support end-only filtering', () => {
      const baseTime = 1000000;
      const result = EventFilter.filterByTimestampRange(testEvents, undefined, baseTime + 2000);
      expect(result).toHaveLength(3);
    });
  });

  describe('createFilterFn()', () => {
    it('should create a reusable filter function', () => {
      const filterFn = EventFilter.createFilterFn({ type: 'workflow.started' });
      const result = testEvents.filter(filterFn);
      expect(result).toHaveLength(2);
    });

    it('should work with Array.filter() method', () => {
      const filterFn = EventFilter.createFilterFn({
        source: 'daemon',
        type: 'workflow.*',
      });
      const result = testEvents.filter(filterFn);
      expect(result).toHaveLength(2);
    });

    it('should create independent filter functions', () => {
      const filterFn1 = EventFilter.createFilterFn({ type: 'workflow.started' });
      const filterFn2 = EventFilter.createFilterFn({ source: 'daemon' });

      const result1 = testEvents.filter(filterFn1);
      const result2 = testEvents.filter(filterFn2);

      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(2);
      expect(result1).not.toEqual(result2);
    });
  });

  describe('edge cases', () => {
    it('should handle events with missing metadata', () => {
      const eventWithoutMetadata: Event = {
        eventId: 'evt-no-meta',
        ts: 1000000,
        projectId: 'proj-1',
        action: 'test.event',
        payload: {},
        metadata: undefined as any,
      };

      const result = EventFilter.filter([eventWithoutMetadata], { source: 'daemon' });
      expect(result).toHaveLength(0);
    });

    it('should handle events with missing action', () => {
      const eventWithoutAction: Event = {
        eventId: 'evt-no-action',
        ts: 1000000,
        projectId: 'proj-1',
        action: '',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      const result = EventFilter.filter([eventWithoutAction], { type: 'workflow.*' });
      expect(result).toHaveLength(0);
    });

    it('should handle very large event arrays', () => {
      const largeEventArray: Event[] = [];
      for (let i = 0; i < 10000; i++) {
        largeEventArray.push({
          eventId: `evt-${i}`,
          ts: 1000000 + i,
          projectId: 'proj-1',
          action: i % 2 === 0 ? 'workflow.started' : 'workflow.completed',
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        });
      }

      const result = EventFilter.filter(largeEventArray, { type: 'workflow.started' });
      expect(result).toHaveLength(5000);
    });

    it('should handle special characters in event type', () => {
      const eventWithSpecialChars: Event = {
        eventId: 'evt-special',
        ts: 1000000,
        projectId: 'proj-1',
        action: 'workflow.gate[0].started',
        payload: {},
        metadata: { schemaVersion: '1.0', source: 'daemon' },
      };

      const result = EventFilter.filter([eventWithSpecialChars], {
        type: 'workflow.gate[0].started',
      });
      expect(result).toHaveLength(1);
    });

    it('should handle dot in wildcard pattern correctly', () => {
      const events: Event[] = [
        {
          eventId: 'evt-1',
          ts: 1000000,
          projectId: 'proj-1',
          action: 'workflow.started',
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'evt-2',
          ts: 1000000,
          projectId: 'proj-1',
          action: 'workflowXstarted', // Should NOT match "workflow.*"
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const result = EventFilter.filter(events, { type: 'workflow.*' });
      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('workflow.started');
    });
  });

  describe('performance', () => {
    it('should filter large event arrays efficiently', () => {
      const largeEventArray: Event[] = [];
      for (let i = 0; i < 100000; i++) {
        largeEventArray.push({
          eventId: `evt-${i}`,
          ts: 1000000 + i,
          projectId: `proj-${i % 10}`,
          action: `workflow.event.${i % 5}`,
          payload: {},
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        });
      }

      const startTime = Date.now();
      const result = EventFilter.filter(largeEventArray, {
        type: 'workflow.event.*',
        source: 'daemon',
      });
      const endTime = Date.now();

      expect(result.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});
