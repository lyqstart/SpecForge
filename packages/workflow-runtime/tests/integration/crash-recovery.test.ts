/**
 * Crash Recovery Integration Tests
 * Tests workflow state recovery from simulated crash scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEnhancedWorkflowPersistence } from '../../src/WorkflowPersistence.js';
import { createEventLogReader } from '../../src/events/EventLogReader.js';
import type { WorkflowInstance } from '../../src/types.js';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Crash Recovery Integration', () => {
  let storageDir: string;
  let enhancedPersistence: ReturnType<typeof createEnhancedWorkflowPersistence>;
  let eventLogReader: ReturnType<typeof createEventLogReader>;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'crash-recovery-test-'));
    
    // Create enhanced persistence with event replay enabled
    enhancedPersistence = createEnhancedWorkflowPersistence(storageDir, true);
    eventLogReader = createEventLogReader(storageDir);
    
    // Initialize both
    await enhancedPersistence.initialize();
    await eventLogReader.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(storageDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  function createTestInstance(overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
    return {
      schema_version: '1.0',
      id: 'test-instance-' + Math.random().toString(36).substr(2, 9),
      workflowId: 'test-workflow',
      currentState: 'initial',
      status: 'running',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('Simulated Crash Scenarios', () => {
    it('should recover from partial write crash (corrupted instance file)', async () => {
      const instanceId = 'partial-write-instance';
      
      // Create a valid instance
      const instance = createTestInstance({
        id: instanceId,
        currentState: 'processing',
        status: 'running',
        history: [
          {
            type: 'workflow.started',
            instanceId,
            timestamp: new Date(Date.now() - 1000),
            data: { workflowId: 'test-workflow' },
          },
        ],
      });
      
      // Save instance normally
      await enhancedPersistence.saveInstance(instance);
      
      // Simulate partial write by corrupting the file
      const instancePath = join(storageDir, `${instanceId}.json`);
      const validContent = await readFile(instancePath, 'utf-8');
      const corruptedContent = validContent.substring(0, validContent.length / 2); // Truncate half
      await writeFile(instancePath, corruptedContent, 'utf-8');
      
      // Add events to event log for recovery
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
      });
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId,
          toState: 'processing',
        },
      });
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should recover from event log
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });

    it('should recover from event log when instance file is missing', async () => {
      const instanceId = 'missing-file-instance';
      
      // Add events to event log without creating instance file
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
      });
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId,
          toState: 'processing',
        },
      });
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.gate.started',
        payload: {
          instanceId,
          gateId: 'test-gate',
        },
      });
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should recover from event log
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
      
      // Instance file should now exist
      const instancePath = join(storageDir, `${instanceId}.json`);
      const fileExists = await readFile(instancePath, 'utf-8').then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should handle mixed state: some instances in storage, some in event log', async () => {
      // Create instances in storage
      const storedInstance1 = createTestInstance({ id: 'stored-1', status: 'running' });
      const storedInstance2 = createTestInstance({ id: 'stored-2', status: 'paused' });
      
      await enhancedPersistence.saveInstance(storedInstance1);
      await enhancedPersistence.saveInstance(storedInstance2);
      
      // Add events for instances only in event log
      const eventLogOnlyId = 'event-log-only';
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId: eventLogOnlyId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
      });
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId: eventLogOnlyId,
          toState: 'completed',
        },
      });
      
      // Need to add workflow.completed event to set status to 'completed'
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.completed',
        payload: {
          instanceId: eventLogOnlyId,
        },
      });
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should recover all instances
      expect(result.recoveredInstances).toHaveLength(3);
      
      const recoveredIds = result.recoveredInstances.map(i => i.id);
      expect(recoveredIds).toContain('stored-1');
      expect(recoveredIds).toContain('stored-2');
      expect(recoveredIds).toContain(eventLogOnlyId);
      
      // Check statuses
      const stored1 = result.recoveredInstances.find(i => i.id === 'stored-1');
      const stored2 = result.recoveredInstances.find(i => i.id === 'stored-2');
      const eventLogOnly = result.recoveredInstances.find(i => i.id === eventLogOnlyId);
      
      expect(stored1?.status).toBe('running');
      expect(stored2?.status).toBe('paused');
      expect(eventLogOnly?.status).toBe('completed');
    });

    it('should recover from event log with out-of-order events', async () => {
      const instanceId = 'out-of-order-instance';
      
      // Add events out of order (simulating distributed system)
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId,
          toState: 'processing',
        },
        ts: Date.now() + 2000, // Future timestamp
      });
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
        ts: Date.now(), // Earlier timestamp
      });
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should still recover despite out-of-order events
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      
      // The state should be based on the last event (processing)
      expect(recovered?.currentState).toBe('processing');
    });

    it('should handle recovery with large number of instances', async () => {
      const instanceCount = 50;
      const instances: WorkflowInstance[] = [];
      
      // Create many instances
      for (let i = 0; i < instanceCount; i++) {
        const instance = createTestInstance({
          id: `bulk-instance-${i}`,
          status: i % 3 === 0 ? 'running' : i % 3 === 1 ? 'paused' : 'completed',
        });
        instances.push(instance);
        await enhancedPersistence.saveInstance(instance);
      }
      
      // Add events for some instances
      for (let i = 0; i < 10; i++) {
        await eventLogReader.appendEvent({
          projectId: 'test-project',
          action: 'workflow.started',
          payload: {
            instanceId: `bulk-instance-${i}`,
            workflowId: 'test-workflow',
            state: 'initial',
          },
        });
      }
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should recover all instances
      expect(result.recoveredInstances).toHaveLength(instanceCount);
      expect(result.failedRecoveries).toHaveLength(0);
      expect(result.recoveryTime).toBeGreaterThan(0);
      
      // Verify all instances were recovered
      const recoveredIds = result.recoveredInstances.map(i => i.id);
      for (let i = 0; i < instanceCount; i++) {
        expect(recoveredIds).toContain(`bulk-instance-${i}`);
      }
    });

    it('should recover with repair inconsistencies enabled', async () => {
      const instanceId = 'inconsistent-repair-instance';
      
      // Create an instance with inconsistencies
      const instance = createTestInstance({
        id: instanceId,
        currentState: '', // Empty state - inconsistency
        status: 'running' as any,
        history: [
          {
            type: 'workflow.created',
            instanceId,
            timestamp: new Date(),
            data: {},
          },
          {
            type: 'workflow.created', // Duplicate event
            instanceId,
            timestamp: new Date(),
            data: {},
          },
        ],
      });
      
      await enhancedPersistence.saveInstance(instance);
      
      // Add events to event log
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
      });
      
      // Validate consistency (should detect issues)
      const validation = await enhancedPersistence.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies.length).toBeGreaterThan(0);
      
      // Perform crash recovery
      const result = await enhancedPersistence.performCrashRecovery();
      
      // Should recover despite inconsistencies
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      
      // Inconsistencies should be recorded
      expect(result.repairedInconsistencies.length).toBeGreaterThan(0);
    });
  });

  describe('Event Replay Scenarios', () => {
    it('should replay events to reconstruct state after crash', async () => {
      const instanceId = 'event-replay-instance';
      
      // Create instance with minimal state
      const instance = createTestInstance({
        id: instanceId,
        currentState: 'initial',
        status: 'pending',
        history: [], // Empty history - will be populated from event log
      });
      
      await enhancedPersistence.saveInstance(instance);
      
      // Add detailed events to event log
      const events = [
        { action: 'workflow.started', payload: { instanceId, state: 'initial' } },
        { action: 'workflow.state_changed', payload: { instanceId, toState: 'processing' } },
        { action: 'workflow.gate.started', payload: { instanceId, gateId: 'gate-1' } },
        { action: 'workflow.gate.completed', payload: { instanceId, gateId: 'gate-1', result: 'passed' } },
        { action: 'workflow.state_changed', payload: { instanceId, toState: 'review' } },
        { action: 'workflow.completed', payload: { instanceId } },
      ];
      
      for (const event of events) {
        await eventLogReader.appendEvent({
          projectId: 'test-project',
          action: event.action,
          payload: event.payload,
        });
      }
      
      // Replay events
      const replayResult = await enhancedPersistence.replayEvents(instanceId);
      
      expect(replayResult.replayedEvents).toBe(events.length);
      expect(replayResult.instance.currentState).toBe('review');
      expect(replayResult.instance.status).toBe('completed');
    });

    it('should handle event replay with missing intermediate events', async () => {
      const instanceId = 'missing-events-instance';
      
      // Create instance
      const instance = createTestInstance({
        id: instanceId,
        currentState: 'initial',
        status: 'pending',
      });
      
      await enhancedPersistence.saveInstance(instance);
      
      // Add events with gaps (simulating lost events)
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId, state: 'initial' },
      });
      
      // Skip some events...
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.completed',
        payload: { instanceId },
      });
      
      // Replay events
      const replayResult = await enhancedPersistence.replayEvents(instanceId);
      
      // Should still replay available events
      expect(replayResult.replayedEvents).toBe(2);
      expect(replayResult.instance.status).toBe('completed');
    });
  });

  describe('Recovery Performance', () => {
    it('should complete recovery within reasonable time', async () => {
      const instanceCount = 100;
      
      // Create many instances
      for (let i = 0; i < instanceCount; i++) {
        const instance = createTestInstance({
          id: `perf-instance-${i}`,
          status: 'running',
        });
        await enhancedPersistence.saveInstance(instance);
      }
      
      // Perform crash recovery and measure time
      const startTime = Date.now();
      const result = await enhancedPersistence.performCrashRecovery();
      const recoveryTime = Date.now() - startTime;
      
      // Should recover all instances
      expect(result.recoveredInstances).toHaveLength(instanceCount);
      expect(result.failedRecoveries).toHaveLength(0);
      
      // Recovery should complete within reasonable time
      // 100 instances should recover in under 5 seconds
      expect(recoveryTime).toBeLessThan(5000);
      
      console.log(`Recovery of ${instanceCount} instances took ${recoveryTime}ms`);
    });
  });
});