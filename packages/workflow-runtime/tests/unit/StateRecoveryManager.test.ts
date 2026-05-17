/**
 * StateRecoveryManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateRecoveryManager, createStateRecoveryManager } from '../../src/StateRecoveryManager.js';
import { WorkflowPersistence, createWorkflowPersistence } from '../../src/WorkflowPersistence.js';
import { EventLogReader, createEventLogReader } from '../../src/events/EventLogReader.js';
import type { WorkflowInstance } from '../../src/types.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('StateRecoveryManager', () => {
  let recoveryManager: StateRecoveryManager;
  let persistence: WorkflowPersistence;
  let eventLogReader: EventLogReader;
  let storageDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'workflow-recovery-test-'));
    
    // Create persistence and event log reader
    persistence = createWorkflowPersistence(storageDir);
    eventLogReader = createEventLogReader(storageDir);
    
    // Initialize both
    await persistence.initialize();
    await eventLogReader.initialize();
    
    // Create recovery manager
    recoveryManager = createStateRecoveryManager(persistence, eventLogReader, {
      validateConsistency: true,
      repairInconsistencies: false,
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

  describe('recoverState', () => {
    it('should recover workflow state from storage', async () => {
      const instance = createTestInstance({
        currentState: 'processing',
        status: 'running',
      });
      
      await persistence.saveInstance(instance);
      
      const recovered = await recoveryManager.recoverState(instance.id);
      expect(recovered).not.toBeNull();
      expect(recovered?.id).toBe(instance.id);
      expect(recovered?.currentState).toBe('processing');
    });

    it('should return null for non-existent instance', async () => {
      const recovered = await recoveryManager.recoverState('non-existent-id');
      expect(recovered).toBeNull();
    });

    it('should recover from event log when instance file is missing', async () => {
      const instanceId = 'event-log-instance';
      
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
      
      // Try to recover (no instance file exists)
      const recovered = await recoveryManager.recoverState(instanceId);
      expect(recovered).not.toBeNull();
      expect(recovered?.id).toBe(instanceId);
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });

    it('should handle recovery failures gracefully', async () => {
      // Mock persistence to throw error
      const mockPersistence = {
        loadInstance: vi.fn().mockRejectedValue(new Error('Storage error')),
        saveInstance: vi.fn(),
        deleteInstance: vi.fn(),
        listInstances: vi.fn(),
        recoverState: vi.fn(),
        replayEvents: vi.fn(),
      } as any;
      
      const failingManager = createStateRecoveryManager(mockPersistence, null);
      const recovered = await failingManager.recoverState('test-id');
      expect(recovered).toBeNull();
    });
  });

  describe('validateInstanceConsistency', () => {
    it('should validate consistent instance', async () => {
      const instance = createTestInstance({
        id: 'valid-instance',
        workflowId: 'test-workflow',
        currentState: 'initial',
        history: [
          {
            type: 'workflow.created',
            instanceId: 'valid-instance',
            timestamp: new Date(Date.now() - 1000),
            data: { workflowId: 'test-workflow' },
          },
          {
            type: 'workflow.started',
            instanceId: 'valid-instance',
            timestamp: new Date(),
            data: { state: 'initial' },
          },
        ],
      });
      
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(true);
      expect(validation.inconsistencies).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const instance = createTestInstance({
        id: '',
        workflowId: '',
      });
      
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies).toHaveLength(1);
      expect(validation.inconsistencies[0].type).toBe('missing_instance');
      expect(validation.inconsistencies[0].severity).toBe('high');
    });

    it('should detect invalid current state', async () => {
      const instance = createTestInstance({
        currentState: '',
      });
      
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies).toHaveLength(1);
      expect(validation.inconsistencies[0].type).toBe('state_mismatch');
    });

    it('should detect duplicate events', async () => {
      const timestamp = new Date();
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp,
            data: {},
          },
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp,
            data: {},
          },
        ],
      });
      
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies).toHaveLength(1);
      expect(validation.inconsistencies[0].type).toBe('event_sequence');
    });

    it('should detect out-of-order timestamps', async () => {
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp: new Date(Date.now() + 1000), // Future timestamp
            data: {},
          },
          {
            type: 'workflow.started',
            instanceId: 'test-id',
            timestamp: new Date(), // Earlier timestamp
            data: {},
          },
        ],
      });
      
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies).toHaveLength(1);
      expect(validation.inconsistencies[0].type).toBe('timestamp_order');
    });
  });

  describe('performCrashRecovery', () => {
    it('should recover all instances after crash', async () => {
      // Create multiple instances
      const instance1 = createTestInstance({ id: 'instance-1', status: 'running' });
      const instance2 = createTestInstance({ id: 'instance-2', status: 'paused' });
      const instance3 = createTestInstance({ id: 'instance-3', status: 'failed' });
      
      await persistence.saveInstance(instance1);
      await persistence.saveInstance(instance2);
      await persistence.saveInstance(instance3);
      
      // Add some events to event log
      await eventLogReader.appendEvent({
        projectId: 'test-project',
        action: 'workflow.started',
        payload: { instanceId: 'instance-1', workflowId: 'test-workflow' },
      });
      
      // Perform crash recovery
      const result = await recoveryManager.performCrashRecovery();
      
      expect(result.recoveredInstances).toHaveLength(3);
      expect(result.failedRecoveries).toHaveLength(0);
      expect(result.recoveryTime).toBeGreaterThan(0);
      
      // Check that instances were recovered
      const recoveredIds = result.recoveredInstances.map(i => i.id);
      expect(recoveredIds).toContain('instance-1');
      expect(recoveredIds).toContain('instance-2');
      expect(recoveredIds).toContain('instance-3');
    });

    it('should handle recovery failures for individual instances', async () => {
      // Create one valid instance
      const validInstance = createTestInstance({ id: 'valid-instance' });
      await persistence.saveInstance(validInstance);
      
      // Create a corrupted instance file with .json extension
      // This will be caught by listInstances but skipped due to parse error
      const corruptedPath = join(storageDir, 'corrupted-instance.json');
      await import('fs/promises').then(fs => 
        fs.writeFile(corruptedPath, 'invalid json content', 'utf-8')
      );
      
      // Perform crash recovery
      const result = await recoveryManager.performCrashRecovery();
      
      // The corrupted file will be skipped with a warning, not counted as a failure
      expect(result.recoveredInstances).toHaveLength(1);
      expect(result.failedRecoveries).toHaveLength(0); // Corrupted files are skipped, not failed
      expect(result.recoveredInstances[0].id).toBe('valid-instance');
    });

    it('should recover instances from event log only', async () => {
      // Add events to event log for an instance that doesn't have a file
      const instanceId = 'event-log-only-instance';
      
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
      expect(result.recoveredInstances.length).toBeGreaterThan(0);
      const recovered = result.recoveredInstances.find(i => i.id === instanceId);
      expect(recovered).toBeDefined();
      expect(recovered?.currentState).toBe('processing');
    });
  });

  describe('createRecoverySnapshot', () => {
    it('should create recovery snapshot', async () => {
      // Create some instances
      const instance1 = createTestInstance({ id: 'snapshot-instance-1' });
      const instance2 = createTestInstance({ id: 'snapshot-instance-2' });
      
      await persistence.saveInstance(instance1);
      await persistence.saveInstance(instance2);
      
      // Create snapshot
      const snapshot = await recoveryManager.createRecoverySnapshot();
      
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.instanceCount).toBe(2);
      expect(snapshot.snapshotId).toMatch(/^snapshot-\d+-[a-z0-9]+$/);
      expect(Array.isArray(snapshot.inconsistencies)).toBe(true);
    });

    it('should create snapshot with inconsistencies', async () => {
      // Create instance with inconsistency (empty current state)
      const instance = createTestInstance({
        id: 'inconsistent-instance',
        currentState: '',
      });
      
      await persistence.saveInstance(instance);
      
      // Create snapshot
      const snapshot = await recoveryManager.createRecoverySnapshot();
      
      expect(snapshot.instanceCount).toBe(1);
      expect(snapshot.inconsistencies.length).toBeGreaterThan(0);
      expect(snapshot.inconsistencies[0].type).toBe('state_mismatch');
    });
  });

  describe('getRecoveryStats', () => {
    it('should get recovery statistics', async () => {
      // Create instances with different statuses
      const instances = [
        createTestInstance({ id: 'running-1', status: 'running' }),
        createTestInstance({ id: 'running-2', status: 'running' }),
        createTestInstance({ id: 'paused-1', status: 'paused' }),
        createTestInstance({ id: 'failed-1', status: 'failed' }),
        createTestInstance({ id: 'inconsistent', currentState: '', status: 'pending' }), // Will cause inconsistency
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
      expect(stats.inconsistencyCount).toBeGreaterThan(0);
      expect(stats.lastRecoveryTime).toBeInstanceOf(Date);
    });

    it('should return null lastRecoveryTime when no instances', async () => {
      const stats = await recoveryManager.getRecoveryStats();
      
      expect(stats.totalInstances).toBe(0);
      expect(stats.lastRecoveryTime).toBeNull();
    });
  });

  describe('repairInconsistencies', () => {
    it('should repair inconsistencies when enabled', async () => {
      // Create recovery manager with repair enabled
      const repairManager = createStateRecoveryManager(persistence, eventLogReader, {
        validateConsistency: true,
        repairInconsistencies: true,
        maxRecoveryAttempts: 3,
        enableEventReplay: true,
      });
      
      // Create instance with inconsistency (empty current state)
      const instance = createTestInstance({
        id: 'repair-instance',
        currentState: '',
      });
      
      await persistence.saveInstance(instance);
      
      // Recover state (should repair inconsistency)
      const recovered = await repairManager.recoverState(instance.id);
      
      expect(recovered).not.toBeNull();
      expect(recovered?.currentState).toBe('initial'); // Should be repaired to 'initial'
      expect(recovered?.status).toBe('pending'); // Should be repaired to 'pending'
    });

    it('should remove duplicate events', async () => {
      const repairManager = createStateRecoveryManager(persistence, eventLogReader, {
        validateConsistency: true,
        repairInconsistencies: true,
        maxRecoveryAttempts: 3,
        enableEventReplay: true,
      });
      
      const timestamp = new Date();
      const instance = createTestInstance({
        id: 'duplicate-events-instance',
        history: [
          {
            type: 'workflow.created',
            instanceId: 'duplicate-events-instance',
            timestamp,
            data: {},
          },
          {
            type: 'workflow.created',
            instanceId: 'duplicate-events-instance',
            timestamp,
            data: {},
          },
          {
            type: 'workflow.started',
            instanceId: 'duplicate-events-instance',
            timestamp: new Date(timestamp.getTime() + 1000),
            data: {},
          },
        ],
      });
      
      await persistence.saveInstance(instance);
      
      // Recover state (should repair duplicate events)
      const recovered = await repairManager.recoverState(instance.id);
      
      expect(recovered).not.toBeNull();
      expect(recovered?.history).toHaveLength(2); // Should have removed one duplicate
    });
  });
});

describe('createStateRecoveryManager', () => {
  it('should create recovery manager with default config', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    const persistence = createWorkflowPersistence(storageDir);
    const eventLogReader = createEventLogReader(storageDir);
    
    await persistence.initialize();
    await eventLogReader.initialize();
    
    const manager = createStateRecoveryManager(persistence, eventLogReader);
    
    // Test with a simple instance
    const instance: WorkflowInstance = {
      schema_version: '1.0',
      id: 'test-id',
      workflowId: 'workflow-1',
      currentState: 'initial',
      status: 'pending',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await persistence.saveInstance(instance);
    const recovered = await manager.recoverState('test-id');
    expect(recovered?.id).toBe('test-id');
    
    await rm(storageDir, { recursive: true, force: true });
  });

  it('should create recovery manager without event log reader', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    const persistence = createWorkflowPersistence(storageDir, false); // Disable event replay
    
    await persistence.initialize();
    
    const manager = createStateRecoveryManager(persistence, null);
    
    // Should still work without event log
    const instance: WorkflowInstance = {
      schema_version: '1.0',
      id: 'test-id',
      workflowId: 'workflow-1',
      currentState: 'initial',
      status: 'pending',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await persistence.saveInstance(instance);
    const recovered = await manager.recoverState('test-id');
    expect(recovered?.id).toBe('test-id');
    
    await rm(storageDir, { recursive: true, force: true });
  });
});