/**
 * EventLogReader Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventLogReader, createEventLogReader } from '../../src/events/EventLogReader.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EventLogReader', () => {
  let logReader: EventLogReader;
  let logDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    logDir = await mkdtemp(join(tmpdir(), 'event-log-test-'));
    logReader = createEventLogReader(logDir);
    await logReader.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(logDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should create log directory and file if they dont exist', async () => {
      const newDir = join(tmpdir(), 'new-log-dir-' + Math.random().toString(36).substr(2, 9));
      const newReader = createEventLogReader(newDir);
      
      await newReader.initialize();
      
      // Check that directory and file were created
      const stats = await newReader.getStats();
      expect(stats.fileSize).toBe(0);
      expect(stats.eventCount).toBe(0);
      
      await rm(newDir, { recursive: true, force: true });
    });
  });

  describe('readAllEvents', () => {
    it('should return empty array for empty log', async () => {
      const events = await logReader.readAllEvents();
      expect(events).toEqual([]);
    });

    it('should read events from log file', async () => {
      // Write test events to log file
      const testEvents = [
        {
          eventId: 'event-1',
          ts: Date.now(),
          projectId: 'test-project',
          action: 'workflow.started',
          payload: { instanceId: 'instance-1', workflowId: 'workflow-1' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-2',
          ts: Date.now() + 1000,
          projectId: 'test-project',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-1', fromState: 'initial', toState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const logFile = join(logDir, 'events.jsonl');
      await writeFile(logFile, testEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

      const events = await logReader.readAllEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventId).toBe('event-1');
      expect(events[1].eventId).toBe('event-2');
    });

    it('should skip malformed lines', async () => {
      const logFile = join(logDir, 'events.jsonl');
      await writeFile(logFile, 
        '{"eventId": "event-1", "ts": 123, "projectId": "test", "action": "test", "payload": {}, "metadata": {"schemaVersion": "1.0", "source": "daemon"}}\n' +
        'malformed json line\n' +
        '{"eventId": "event-2", "ts": 124, "projectId": "test", "action": "test", "payload": {}, "metadata": {"schemaVersion": "1.0", "source": "daemon"}}',
        'utf-8'
      );

      const events = await logReader.readAllEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventId).toBe('event-1');
      expect(events[1].eventId).toBe('event-2');
    });
  });

  describe('readEvents with filtering', () => {
    beforeEach(async () => {
      // Write test events
      const testEvents = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'project-1',
          action: 'workflow.started',
          payload: { instanceId: 'instance-1', workflowId: 'workflow-a' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-2',
          ts: 2000,
          projectId: 'project-1',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-1', workflowId: 'workflow-a', fromState: 'initial', toState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-3',
          ts: 3000,
          projectId: 'project-2',
          action: 'workflow.started',
          payload: { instanceId: 'instance-2', workflowId: 'workflow-b' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-4',
          ts: 4000,
          projectId: 'project-1',
          action: 'gate.started',
          payload: { instanceId: 'instance-1', gateId: 'gate-1' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const logFile = join(logDir, 'events.jsonl');
      await writeFile(logFile, testEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
    });

    it('should filter by instanceId', async () => {
      const result = await logReader.readEvents({ instanceId: 'instance-1' });
      expect(result.totalEvents).toBe(4);
      expect(result.filteredEvents).toBe(3);
      expect(result.events.map(e => e.eventId)).toEqual(['event-1', 'event-2', 'event-4']);
    });

    it('should filter by workflowId', async () => {
      const result = await logReader.readEvents({ workflowId: 'workflow-a' });
      expect(result.filteredEvents).toBe(2);
      expect(result.events.map(e => e.eventId)).toEqual(['event-1', 'event-2']);
    });

    it('should filter by action', async () => {
      const result = await logReader.readEvents({ action: 'workflow.started' });
      expect(result.filteredEvents).toBe(2);
      expect(result.events.map(e => e.eventId)).toEqual(['event-1', 'event-3']);
    });

    it('should filter by multiple actions', async () => {
      const result = await logReader.readEvents({ action: ['workflow.started', 'workflow.state_changed'] });
      expect(result.filteredEvents).toBe(3);
      expect(result.events.map(e => e.eventId)).toEqual(['event-1', 'event-2', 'event-3']);
    });

    it('should filter by time range', async () => {
      const result = await logReader.readEvents({
        startTime: new Date(1500),
        endTime: new Date(3500),
      });
      expect(result.filteredEvents).toBe(2);
      expect(result.events.map(e => e.eventId)).toEqual(['event-2', 'event-3']);
    });

    it('should limit results', async () => {
      const result = await logReader.readEvents({ limit: 2 });
      expect(result.filteredEvents).toBe(2);
      expect(result.events).toHaveLength(2);
    });

    it('should combine multiple filters', async () => {
      const result = await logReader.readEvents({
        instanceId: 'instance-1',
        action: 'workflow.started',
        limit: 1,
      });
      expect(result.filteredEvents).toBe(1);
      expect(result.events[0].eventId).toBe('event-1');
    });
  });

  describe('readWorkflowEvents', () => {
    beforeEach(async () => {
      // Write test events
      const testEvents = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'project-1',
          action: 'workflow.started',
          payload: { instanceId: 'instance-1', workflowId: 'workflow-a' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-2',
          ts: 2000,
          projectId: 'project-1',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-1', fromState: 'initial', toState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-3',
          ts: 3000,
          projectId: 'project-1',
          action: 'gate.started', // Not a workflow event
          payload: { instanceId: 'instance-1', gateId: 'gate-1' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-4',
          ts: 4000,
          projectId: 'project-1',
          action: 'workflow.completed',
          payload: { instanceId: 'instance-1', finalState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const logFile = join(logDir, 'events.jsonl');
      await writeFile(logFile, testEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
    });

    it('should read only workflow events for specific instance', async () => {
      const events = await logReader.readWorkflowEvents('instance-1');
      expect(events).toHaveLength(3);
      expect(events.map(e => e.action)).toEqual([
        'workflow.started',
        'workflow.state_changed',
        'workflow.completed',
      ]);
    });

    it('should return empty array for non-existent instance', async () => {
      const events = await logReader.readWorkflowEvents('non-existent');
      expect(events).toEqual([]);
    });
  });

  describe('reconstructWorkflowState', () => {
    beforeEach(async () => {
      // Write test events for a complete workflow execution
      const testEvents = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'project-1',
          action: 'workflow.started',
          payload: { instanceId: 'instance-1', workflowId: 'workflow-a', currentState: 'initial' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-2',
          ts: 2000,
          projectId: 'project-1',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-1', fromState: 'initial', toState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-3',
          ts: 3000,
          projectId: 'project-1',
          action: 'workflow.paused',
          payload: { instanceId: 'instance-1', currentState: 'processing', reason: 'user request' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-4',
          ts: 4000,
          projectId: 'project-1',
          action: 'workflow.resumed',
          payload: { instanceId: 'instance-1', currentState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-5',
          ts: 5000,
          projectId: 'project-1',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-1', fromState: 'processing', toState: 'completed' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-6',
          ts: 6000,
          projectId: 'project-1',
          action: 'workflow.completed',
          payload: { instanceId: 'instance-1', finalState: 'completed' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const logFile = join(logDir, 'events.jsonl');
      await writeFile(logFile, testEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
    });

    it('should reconstruct workflow state from events', async () => {
      const state = await logReader.reconstructWorkflowState('instance-1');
      
      expect(state.currentState).toBe('completed');
      expect(state.status).toBe('completed');
      expect(state.lastEventTime).not.toBeNull();
      expect(state.lastEventTime!.getTime()).toBe(6000);
    });

    it('should handle partial workflow execution', async () => {
      // Create a separate log with only some events
      const partialDir = await mkdtemp(join(tmpdir(), 'partial-log-'));
      const partialReader = createEventLogReader(partialDir);
      await partialReader.initialize();
      
      const partialEvents = [
        {
          eventId: 'event-1',
          ts: 1000,
          projectId: 'project-1',
          action: 'workflow.started',
          payload: { instanceId: 'instance-2', workflowId: 'workflow-b', currentState: 'initial' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
        {
          eventId: 'event-2',
          ts: 2000,
          projectId: 'project-1',
          action: 'workflow.state_changed',
          payload: { instanceId: 'instance-2', fromState: 'initial', toState: 'processing' },
          metadata: { schemaVersion: '1.0', source: 'daemon' },
        },
      ];

      const logFile = join(partialDir, 'events.jsonl');
      await writeFile(logFile, partialEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
      
      const state = await partialReader.reconstructWorkflowState('instance-2');
      
      expect(state.currentState).toBe('processing');
      expect(state.status).toBe('running');
      expect(state.lastEventTime!.getTime()).toBe(2000);
      
      await rm(partialDir, { recursive: true, force: true });
    });

    it('should return default state for non-existent instance', async () => {
      const state = await logReader.reconstructWorkflowState('non-existent');
      
      expect(state.currentState).toBe('initial');
      expect(state.status).toBe('pending');
      expect(state.lastEventTime).toBeNull();
    });
  });

  describe('appendEvent', () => {
    it('should append event to log file', async () => {
      const initialStats = await logReader.getStats();
      expect(initialStats.eventCount).toBe(0);
      
      await logReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId: 'instance-1', workflowId: 'workflow-1' },
      });
      
      const stats = await logReader.getStats();
      expect(stats.eventCount).toBe(1);
      
      const events = await logReader.readAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('workflow.started');
      expect(events[0].payload.instanceId).toBe('instance-1');
      expect(events[0].metadata.schemaVersion).toBe('1.0');
    });

    it('should allow custom eventId and timestamp', async () => {
      const customEventId = 'custom-event-id';
      const customTimestamp = 1234567890;
      
      await logReader.appendEvent({
        eventId: customEventId,
        ts: customTimestamp,
        projectId: 'test-project',
        action: 'test.action',
        payload: { test: 'data' },
        metadata: { source: 'client' },
      });
      
      const events = await logReader.readAllEvents();
      expect(events[0].eventId).toBe(customEventId);
      expect(events[0].ts).toBe(customTimestamp);
      expect(events[0].metadata.source).toBe('client');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const initialStats = await logReader.getStats();
      expect(initialStats.fileSize).toBe(0);
      expect(initialStats.eventCount).toBe(0);
      
      // Add some events
      await logReader.appendEvent({
        projectId: 'test-project',
        action: 'event.1',
        payload: { data: 'test' },
      });
      
      await logReader.appendEvent({
        projectId: 'test-project',
        action: 'event.2',
        payload: { data: 'test2' },
      });
      
      const stats = await logReader.getStats();
      expect(stats.eventCount).toBe(2);
      expect(stats.fileSize).toBeGreaterThan(0);
      expect(stats.lastModified).toBeInstanceOf(Date);
    });
  });

  describe('clearEvents', () => {
    it('should clear all events from log', async () => {
      // Add some events
      await logReader.appendEvent({
        projectId: 'test-project',
        action: 'event.1',
        payload: { data: 'test' },
      });
      
      let stats = await logReader.getStats();
      expect(stats.eventCount).toBe(1);
      
      // Clear events
      await logReader.clearEvents();
      
      stats = await logReader.getStats();
      expect(stats.eventCount).toBe(0);
      expect(stats.fileSize).toBe(0);
    });
  });
});