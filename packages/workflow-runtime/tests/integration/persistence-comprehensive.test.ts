/**
 * Comprehensive Persistence Integration Tests
 * 
 * Tests all persistence functionality including:
 * 1. Workflow instance storage
 * 2. State recovery mechanisms
 * 3. Event replay functionality
 * 4. Crash recovery scenarios
 * 5. Consistency validation
 * 
 * Validates: Requirements 1.2, 4.3, 5.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  WorkflowPersistence, 
  createWorkflowPersistence,
  EnhancedWorkflowPersistence,
  createEnhancedWorkflowPersistence,
  type EventReplayResult
} from '../../src/WorkflowPersistence.js';
import { 
  StateRecoveryManager, 
  createStateRecoveryManager,
  type StateInconsistency,
  type CrashRecoveryResult
} from '../../src/StateRecoveryManager.js';
import { EventLogReader, createEventLogReader } from '../../src/events/EventLogReader.js';
import type { WorkflowInstance, WorkflowEvent } from '../../src/types.js';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Comprehensive Persistence Integration Tests', () => {
  let storageDir: string;
  let persistence: WorkflowPersistence;
  let enhancedPersistence: EnhancedWorkflowPersistence;
  let eventLogReader: EventLogReader;
  let recoveryManager: StateRecoveryManager;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'workflow-persistence-test-'));
    
    // Create persistence instances
    persistence = createWorkflowPersistence(storageDir, true);
    enhancedPersistence = createEnhancedWorkflowPersistence(storageDir, true);
    eventLogReader = createEventLogReader(storageDir);
    
    // Initialize all components
    await persistence.initialize();
    await enhancedPersistence.initialize();
    await eventLogReader.initialize();
    
    // Create recovery manager
    recoveryManager = createStateRecoveryManager(persistence, eventLogReader, {
      validateConsistency: true,
      repairInconsistencies: true,
      maxRecoveryAttempts: 3,
      enableEventReplay: true,
    });
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

  function createTestEvent(instanceId: string, type: string, data: any = {}): WorkflowEvent {
    return {
      type,
      instanceId,
      timestamp: new Date(),
      data,
    };
  }

  describe('Workflow Instance Storage - All Functions', () => {
    it('should perform complete CRUD operations cycle', async () => {
      // Create
      const instance = createTestInstance({
        id: 'crud-instance',
        currentState: 'processing',
        history: [
          createTestEvent('crud-instance', 'workflow.created', { workflowId: 'test-workflow' }),
          createTestEvent('crud-instance', 'workflow.started', { state: 'initial' }),
        ],
      });

      // Save
      await persistence.saveInstance(instance);
      
      // Read
      const loaded = await persistence.loadInstance('crud-instance');
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('crud-instance');
      expect(loaded?.currentState).toBe('processing');
      expect(loaded?.history).toHaveLength(2);

      // Update
      instance.status = 'completed';
      instance.currentState = 'final';
      await persistence.saveInstance(instance);
      
      const updated = await persistence.loadInstance('crud-instance');
      expect(updated?.status).toBe('completed');
      expect(updated?.currentState).toBe('final');

      // List
      const instances = await persistence.listInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('crud-instance');

      // Delete
      const deleted = await persistence.deleteInstance('crud-instance');
      expect(deleted).toBe(true);
      
      const afterDelete = await persistence.loadInstance('crud-instance');
      expect(afterDelete).toBeNull();
    });

    it('should handle concurrent instance operations', async () => {
      const instances = Array.from({ length: 10 }, (_, i) => 
        createTestInstance({ id: `concurrent-instance-${i}` })
      );

      // Save all instances concurrently
      await Promise.all(instances.map(instance => persistence.saveInstance(instance)));

      // List all instances
      const listed = await persistence.listInstances();
      expect(listed).toHaveLength(10);

      // Load each instance
      for (let i = 0; i < 10; i++) {
        const loaded = await persistence.loadInstance(`concurrent-instance-${i}`);
        expect(loaded).not.toBeNull();
        expect(loaded?.id).toBe(`concurrent-instance-${i}`);
      }

      // Delete all instances
      await Promise.all(
        instances.map(instance => persistence.deleteInstance(instance.id))
      );

      const afterDelete = await persistence.listInstances();
      expect(afterDelete).toHaveLength(0);
    });

    it('should handle large instance with many events', async () => {
      const history: WorkflowEvent[] = [];
      for (let i = 0; i < 100; i++) {
        history.push(createTestEvent('large-instance', `event-${i}`, { index: i }));
      }

      const instance = createTestInstance({
        id: 'large-instance',
        history,
      });

      await persistence.saveInstance(instance);
      
      const loaded = await persistence.loadInstance('large-instance');
      expect(loaded).not.toBeNull();
      expect(loaded?.history).toHaveLength(100);
      expect(loaded?.history[0].type).toBe('event-0');
      expect(loaded?.history[99].type).toBe('event-99');
    });

    it('should maintain data integrity after multiple updates', async () => {
      const instance = createTestInstance({ id: 'integrity-instance' });
      
      // Perform multiple updates
      for (let i = 0; i < 5; i++) {
        instance.currentState = `state-${i}`;
        instance.history.push(createTestEvent('integrity-instance', `update-${i}`));
        instance.updatedAt = new Date();
        await persistence.saveInstance(instance);
      }

      const loaded = await persistence.loadInstance('integrity-instance');
      expect(loaded).not.toBeNull();
      expect(loaded?.currentState).toBe('state-4');
      expect(loaded?.history).toHaveLength(5);
    });
  });

  describe('State Recovery Mechanisms', () => {
    it('should recover state from storage with full history', async () => {
      const instance = createTestInstance({
        id: 'recovery-instance',
        currentState: 'processing',
        history: [
          createTestEvent('recovery-instance', 'workflow.created'),
          createTestEvent('recovery-instance', 'workflow.started'),
          createTestEvent('recovery-instance', 'workflow.state_changed', { from: 'initial', to: 'processing' }),
        ],
      });

      await persistence.saveInstance(instance);
      
      const recovered = await persistence.recoverState('recovery-instance');
      expect(recovered).not.toBeNull();
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.history).toHaveLength(3);
    });

    it('should recover state from event log when instance file is missing', async () => {
      const instanceId = 'event-log-recovery-instance';
      
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
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId,
          toState: 'processing',
        },
      });

      // Recover from event log (no instance file exists)
      const recovered = await recoveryManager.recoverState(instanceId);
      expect(recovered).not.toBeNull();
      expect(recovered?.id).toBe(instanceId);
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });

    it('should handle partial recovery when some data is corrupted', async () => {
      // Create a valid instance
      const validInstance = createTestInstance({ id: 'valid-instance' });
      await persistence.saveInstance(validInstance);

      // Create a corrupted instance file
      const corruptedPath = join(storageDir, 'corrupted-instance.json');
      await writeFile(corruptedPath, 'invalid json content', 'utf-8');

      // List instances should skip corrupted file
      const instances = await persistence.listInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('valid-instance');
    });

    it('should recover state with repair inconsistencies enabled', async () => {
      // Create instance with inconsistency (empty current state)
      const instance = createTestInstance({
        id: 'repair-instance',
        currentState: '', // Invalid state
      });

      await persistence.saveInstance(instance);
      
      // Recover with repair enabled
      const recovered = await recoveryManager.recoverState('repair-instance');
      expect(recovered).not.toBeNull();
      expect(recovered?.currentState).toBe('initial'); // Should be repaired
      expect(recovered?.status).toBe('pending'); // Should be repaired
    });
  });

  describe('Event Replay Functionality', () => {
    it('should replay events and reconstruct state correctly', async () => {
      const instance = createTestInstance({
        id: 'replay-instance',
        currentState: 'initial',
        history: [
          createTestEvent('replay-instance', 'workflow.created'),
          createTestEvent('replay-instance', 'workflow.started'),
          createTestEvent('replay-instance', 'workflow.state_changed', { from: 'initial', to: 'processing' }),
          createTestEvent('replay-instance', 'workflow.state_changed', { from: 'processing', to: 'completed' }),
        ],
      });

      await persistence.saveInstance(instance);
      
      const replayResult = await persistence.replayEvents('replay-instance');
      expect(replayResult.replayedEvents).toBe(3); // First event is not replayed
      expect(replayResult.instance.currentState).toBe('completed');
    });

    it('should replay events from event log when available', async () => {
      const instanceId = 'event-log-replay-instance';
      
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
      
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.state_changed',
        payload: {
          instanceId,
          toState: 'processing',
        },
      });

      // Create instance with empty history
      const instance = createTestInstance({
        id: instanceId,
        history: [],
      });

      await persistence.saveInstance(instance);
      
      // Replay should use events from event log
      const replayResult = await persistence.replayEvents(instanceId);
      expect(replayResult.replayedEvents).toBe(2);
      expect(replayResult.instance.currentState).toBe('processing');
    });

    it('should handle empty history gracefully during replay', async () => {
      const instance = createTestInstance({
        id: 'empty-replay-instance',
        history: [],
      });

      await persistence.saveInstance(instance);
      
      const replayResult = await persistence.replayEvents('empty-replay-instance');
      expect(replayResult.replayedEvents).toBe(0);
      expect(replayResult.instance.currentState).toBe('initial');
    });

    it('should skip replay when disabled in configuration', async () => {
      const persistenceNoReplay = createWorkflowPersistence(storageDir, false);
      await persistenceNoReplay.initialize();

      const instance = createTestInstance({
        id: 'no-replay-instance',
        history: [
          createTestEvent('no-replay-instance', 'workflow.created'),
          createTestEvent('no-replay-instance', 'workflow.started'),
        ],
      });

      await persistenceNoReplay.saveInstance(instance);
      
      const replayResult = await persistenceNoReplay.replayEvents('no-replay-instance');
      expect(replayResult.replayedEvents).toBe(0);
    });
  });

  describe('Crash Recovery Scenarios', () => {
    it('should perform complete crash recovery for all instances', async () => {
      // Create multiple instances with different states
      const instances = [
        createTestInstance({ id: 'crash-instance-1', status: 'running' }),
        createTestInstance({ id: 'crash-instance-2', status: 'paused' }),
        createTestInstance({ id: 'crash-instance-3', status: 'failed' }),
        createTestInstance({ id: 'crash-instance-4', status: 'completed' }),
      ];

      for (const instance of instances) {
        await persistence.saveInstance(instance);
      }

      // Add some events to event log
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId: 'crash-instance-1', workflowId: 'test-workflow' },
      });

      // Perform crash recovery
      const result = await recoveryManager.performCrashRecovery();
      
      expect(result.recoveredInstances).toHaveLength(4);
      expect(result.failedRecoveries).toHaveLength(0);
      expect(result.recoveryTime).toBeGreaterThan(0);
      expect(result.repairedInconsistencies).toBeInstanceOf(Array);
    });

    it('should recover instances from event log only (no storage files)', async () => {
      const instanceId = 'event-log-only-crash-instance';
      
      // Add events to event log for an instance that doesn't have a file
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
      const result = await recoveryManager.performCrashRecovery();
      
      // Should recover the instance from event log
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });

    it('should handle mixed state: some instances in storage, some in event log', async () => {
      // Create instance in storage
      const storageInstance = createTestInstance({ id: 'storage-instance' });
      await persistence.saveInstance(storageInstance);

      // Create instance only in event log
      const eventLogInstanceId = 'event-log-instance';
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: {
          instanceId: eventLogInstanceId,
          workflowId: 'test-workflow',
          state: 'initial',
        },
      });

      // Perform crash recovery
      const result = await recoveryManager.performCrashRecovery();
      
      // Should recover both instances
      expect(result.recoveredInstances.length).toBeGreaterThanOrEqual(2);
      
      const storageRecovered = result.recoveredInstances.find(i => i.id === 'storage-instance');
      const eventLogRecovered = result.recoveredInstances.find(i => i.id === eventLogInstanceId);
      
      expect(storageRecovered).toBeDefined();
      expect(eventLogRecovered).toBeDefined();
    });

    it('should create and validate recovery snapshot', async () => {
      // Create some instances
      const instances = [
        createTestInstance({ id: 'snapshot-instance-1' }),
        createTestInstance({ id: 'snapshot-instance-2' }),
      ];

      for (const instance of instances) {
        await persistence.saveInstance(instance);
      }

      // Create snapshot
      const snapshot = await recoveryManager.createRecoverySnapshot();
      
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.instanceCount).toBe(2);
      expect(snapshot.snapshotId).toMatch(/^snapshot-\d+-[a-z0-9]+$/);
      expect(Array.isArray(snapshot.inconsistencies)).toBe(true);
    });

    it('should get accurate recovery statistics', async () => {
      // Create instances with different statuses
      const instances = [
        createTestInstance({ id: 'stats-running-1', status: 'running' }),
        createTestInstance({ id: 'stats-running-2', status: 'running' }),
        createTestInstance({ id: 'stats-paused-1', status: 'paused' }),
        createTestInstance({ id: 'stats-failed-1', status: 'failed' }),
        createTestInstance({ id: 'stats-completed-1', status: 'completed' }),
      ];

      for (const instance of instances) {
        await persistence.saveInstance(instance);
      }

      // Get stats
      const stats = await recoveryManager.getRecoveryStats();
      
      expect(stats.totalInstances).toBe(5);
      expect(stats.runningInstances).toBe(2);
      expect(stats.pausedInstances).toBe(1);
      expect(stats.failedInstances).toBe(1);
      expect(stats.lastRecoveryTime).toBeInstanceOf(Date);
    });
  });

  describe('Enhanced Workflow Persistence', () => {
    it('should perform enhanced crash recovery with statistics', async () => {
      const instances = [
        createTestInstance({ id: 'enhanced-1', status: 'running' }),
        createTestInstance({ id: 'enhanced-2', status: 'paused' }),
      ];

      for (const instance of instances) {
        await enhancedPersistence.saveInstance(instance);
      }

      const result = await enhancedPersistence.performCrashRecovery();
      
      expect(result.recoveredInstances).toHaveLength(2);
      expect(result.failedRecoveries).toHaveLength(0);
      expect(result.recoveryTime).toBeGreaterThan(0);
    });

    it('should validate instance consistency with enhanced methods', async () => {
      const instance = createTestInstance({
        id: 'enhanced-validation-instance',
        currentState: 'processing',
        history: [
          createTestEvent('enhanced-validation-instance', 'workflow.created'),
        ],
      });

      await enhancedPersistence.saveInstance(instance);
      
      const validation = await enhancedPersistence.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(true);
      expect(validation.inconsistencies).toHaveLength(0);
      expect(validation.recommendations).toBeInstanceOf(Array);
    });

    it('should detect and report inconsistencies', async () => {
      const instance = createTestInstance({
        id: 'enhanced-inconsistent-instance',
        currentState: '', // Empty state should be detected
      });

      const validation = await enhancedPersistence.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies.length).toBeGreaterThan(0);
      expect(validation.recommendations.length).toBeGreaterThan(0);
    });

    it('should create recovery snapshot with enhanced persistence', async () => {
      const instance = createTestInstance({ id: 'enhanced-snapshot-instance' });
      await enhancedPersistence.saveInstance(instance);
      
      const snapshot = await enhancedPersistence.createRecoverySnapshot();
      
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.instanceCount).toBe(1);
      expect(snapshot.snapshotId).toMatch(/^snapshot-/);
    });

    it('should get recovery statistics from enhanced persistence', async () => {
      const instances = [
        createTestInstance({ id: 'enhanced-stats-1', status: 'running' }),
        createTestInstance({ id: 'enhanced-stats-2', status: 'failed' }),
      ];

      for (const instance of instances) {
        await enhancedPersistence.saveInstance(instance);
      }

      const stats = await enhancedPersistence.getRecoveryStats();
      
      expect(stats.totalInstances).toBe(2);
      expect(stats.runningInstances).toBe(1);
      expect(stats.failedInstances).toBe(1);
      expect(stats.inconsistencyCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle non-existent instance gracefully', async () => {
      const loaded = await persistence.loadInstance('non-existent-id');
      expect(loaded).toBeNull();

      const deleted = await persistence.deleteInstance('non-existent-id');
      expect(deleted).toBe(false);

      const recovered = await persistence.recoverState('non-existent-id');
      expect(recovered).toBeNull();
    });

    it('should handle malformed instance files gracefully', async () => {
      // Create a malformed JSON file
      const malformedPath = join(storageDir, 'malformed-instance.json');
      await writeFile(malformedPath, '{ invalid json', 'utf-8');

      // List instances should skip malformed file
      const instances = await persistence.listInstances();
      expect(instances).toHaveLength(0);
    });

    it('should handle file system errors gracefully', async () => {
      // Mock file system error for a non-cached instance
      const mockError = new Error('File system error');
      const originalReadFile = (await import('fs/promises')).readFile;
      const readFileSpy = vi.spyOn(await import('fs/promises'), 'readFile').mockRejectedValueOnce(mockError);

      const instance = createTestInstance({ id: 'error-instance' });
      await persistence.saveInstance(instance);

      // Clear cache to force file read
      persistence.clearCache();

      // Should handle error gracefully - return null when file read fails
      const loaded = await persistence.loadInstance('error-instance');
      expect(loaded).toBeNull();

      // Restore original function
      readFileSpy.mockRestore();
    });

    it('should handle concurrent access to same instance', async () => {
      const instanceId = 'concurrent-access-instance';
      const instance = createTestInstance({ id: instanceId });

      // Save instance
      await persistence.saveInstance(instance);

      // Simulate concurrent reads
      const readPromises = Array.from({ length: 5 }, () => 
        persistence.loadInstance(instanceId)
      );

      const results = await Promise.all(readPromises);
      results.forEach(result => {
        expect(result).not.toBeNull();
        expect(result?.id).toBe(instanceId);
      });
    });

    it('should maintain cache consistency', async () => {
      const instance = createTestInstance({ id: 'cache-instance' });

      // Save and load to populate cache
      await persistence.saveInstance(instance);
      await persistence.loadInstance('cache-instance');
      
      expect(persistence.getCacheSize()).toBe(1);

      // Delete should clear cache
      await persistence.deleteInstance('cache-instance');
      expect(persistence.getCacheSize()).toBe(0);

      // Clear cache explicitly
      persistence.clearCache();
      expect(persistence.getCacheSize()).toBe(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of instances efficiently', async () => {
      const instanceCount = 50;
      const instances = Array.from({ length: instanceCount }, (_, i) => 
        createTestInstance({ id: `perf-instance-${i}` })
      );

      // Save all instances sequentially to avoid file system conflicts
      const saveStart = Date.now();
      for (const instance of instances) {
        await persistence.saveInstance(instance);
      }
      const saveTime = Date.now() - saveStart;

      // List all instances
      const listStart = Date.now();
      const listed = await persistence.listInstances();
      const listTime = Date.now() - listStart;

      expect(listed).toHaveLength(instanceCount);
      console.log(`Performance: Saved ${instanceCount} instances in ${saveTime}ms, listed in ${listTime}ms`);
    });

    it('should handle instances with large history efficiently', async () => {
      const eventCount = 200;
      const history: WorkflowEvent[] = [];
      
      for (let i = 0; i < eventCount; i++) {
        history.push(createTestEvent('large-history-instance', `event-${i}`, { index: i }));
      }

      const instance = createTestInstance({
        id: 'large-history-instance',
        history,
      });

      // Save instance with large history
      const saveStart = Date.now();
      await persistence.saveInstance(instance);
      const saveTime = Date.now() - saveStart;

      // Load instance with large history
      const loadStart = Date.now();
      const loaded = await persistence.loadInstance('large-history-instance');
      const loadTime = Date.now() - loadStart;

      expect(loaded).not.toBeNull();
      expect(loaded?.history).toHaveLength(eventCount);
      console.log(`Performance: Saved instance with ${eventCount} events in ${saveTime}ms, loaded in ${loadTime}ms`);
    });
  });
});