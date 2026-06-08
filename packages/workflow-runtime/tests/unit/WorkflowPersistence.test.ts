/**
 * WorkflowPersistence Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowPersistence, createWorkflowPersistence } from '../../src/WorkflowPersistence.js';
import type { WorkflowInstance } from '../../src/types.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('WorkflowPersistence', () => {
  let persistence: WorkflowPersistence;
  let storageDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    persistence = createWorkflowPersistence(storageDir);
    await persistence.initialize();
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

  describe('saveInstance', () => {
    it('should save a workflow instance to storage', async () => {
      const instance = createTestInstance();
      
      await persistence.saveInstance(instance);
      
      const loaded = await persistence.loadInstance(instance.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(instance.id);
      expect(loaded?.workflowId).toBe(instance.workflowId);
    });

    it('should save instance with history events', async () => {
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: { workflowId: 'test-workflow' },
          },
          {
            type: 'workflow.started',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: { state: 'initial' },
          },
        ],
      });
      
      await persistence.saveInstance(instance);
      
      const loaded = await persistence.loadInstance(instance.id);
      expect(loaded?.history).toHaveLength(2);
      expect(loaded?.history[0].type).toBe('workflow.created');
    });

    it('should update existing instance', async () => {
      const instance = createTestInstance();
      await persistence.saveInstance(instance);
      
      instance.status = 'completed';
      await persistence.saveInstance(instance);
      
      const loaded = await persistence.loadInstance(instance.id);
      expect(loaded?.status).toBe('completed');
    });
  });

  describe('loadInstance', () => {
    it('should return null for non-existent instance', async () => {
      const loaded = await persistence.loadInstance('non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should load instance with correct schema version', async () => {
      const instance = createTestInstance();
      await persistence.saveInstance(instance);
      
      const loaded = await persistence.loadInstance(instance.id);
      expect(loaded).not.toBeNull();
    });
  });

  describe('deleteInstance', () => {
    it('should delete an existing instance', async () => {
      const instance = createTestInstance();
      await persistence.saveInstance(instance);
      
      const deleted = await persistence.deleteInstance(instance.id);
      expect(deleted).toBe(true);
      
      const loaded = await persistence.loadInstance(instance.id);
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent instance', async () => {
      const deleted = await persistence.deleteInstance('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('listInstances', () => {
    it('should return empty array when no instances exist', async () => {
      const instances = await persistence.listInstances();
      expect(instances).toEqual([]);
    });

    it('should list all saved instances', async () => {
      const instance1 = createTestInstance({ id: 'instance-1' });
      const instance2 = createTestInstance({ id: 'instance-2' });
      
      await persistence.saveInstance(instance1);
      await persistence.saveInstance(instance2);
      
      const instances = await persistence.listInstances();
      expect(instances).toHaveLength(2);
      expect(instances.map((i: WorkflowInstance) => i.id)).toContain('instance-1');
      expect(instances.map((i: WorkflowInstance) => i.id)).toContain('instance-2');
    });
  });

  describe('recoverState', () => {
    it('should recover workflow state from storage', async () => {
      const instance = createTestInstance({
        currentState: 'processing',
        status: 'running',
      });
      
      await persistence.saveInstance(instance);
      
      const recovered = await persistence.recoverState(instance.id);
      expect(recovered).not.toBeNull();
      expect(recovered?.currentState).toBe('processing');
    });

    it('should return null for non-existent instance', async () => {
      const recovered = await persistence.recoverState('non-existent-id');
      expect(recovered).toBeNull();
    });
  });

  describe('replayEvents', () => {
    it('should replay events and return count', async () => {
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: {},
          },
          {
            type: 'workflow.state_changed',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: { from: 'initial', to: 'processing' },
          },
        ],
      });
      
      await persistence.saveInstance(instance);
      
      const result = await persistence.replayEvents(instance.id);
      expect(result.replayedEvents).toBe(1); // First event is not replayed
      expect(result.instance.currentState).toBe('processing');
    });

    it('should skip replay when disabled', async () => {
      const persistenceNoReplay = createWorkflowPersistence(storageDir, false);
      
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: {},
          },
        ],
      });
      
      await persistenceNoReplay.saveInstance(instance);
      
      const result = await persistenceNoReplay.replayEvents(instance.id);
      expect(result.replayedEvents).toBe(0);
    });

    it('should handle empty history gracefully', async () => {
      const instance = createTestInstance({
        history: [],
      });
      
      await persistence.saveInstance(instance);
      
      const result = await persistence.replayEvents(instance.id);
      expect(result.replayedEvents).toBe(0);
      expect(result.instance.currentState).toBe('initial');
    });
  });

  describe('cache', () => {
    it('should cache instances after load', async () => {
      const instance = createTestInstance();
      await persistence.saveInstance(instance);
      
      // Load once to populate cache
      await persistence.loadInstance(instance.id);
      
      // Second load should hit cache
      expect(persistence.getCacheSize()).toBe(1);
      
      // Clear cache
      persistence.clearCache();
      expect(persistence.getCacheSize()).toBe(0);
    });
  });
});

describe('createWorkflowPersistence', () => {
  it('should create persistence with default config', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    const persistence = createWorkflowPersistence(storageDir);
    await persistence.initialize();
    
    const instance: WorkflowInstance = {
      id: 'test-id',
      workflowId: 'workflow-1',
      currentState: 'initial',
      status: 'pending',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await persistence.saveInstance(instance);
    const loaded = await persistence.loadInstance('test-id');
    expect(loaded?.id).toBe('test-id');
    
    await rm(storageDir, { recursive: true, force: true });
  });
});

describe('EnhancedWorkflowPersistence', () => {
  let enhancedPersistence: import('../../src/WorkflowPersistence.js').EnhancedWorkflowPersistence;
  let storageDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'workflow-enhanced-test-'));
    
    // Create enhanced persistence
    const { createEnhancedWorkflowPersistence } = await import('../../src/WorkflowPersistence.js');
    enhancedPersistence = createEnhancedWorkflowPersistence(storageDir);
    await enhancedPersistence.initialize();
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

  describe('crash recovery', () => {
    it('should perform crash recovery', async () => {
      const instance1 = createTestInstance({ id: 'crash-instance-1', status: 'running' });
      const instance2 = createTestInstance({ id: 'crash-instance-2', status: 'paused' });
      
      await enhancedPersistence.saveInstance(instance1);
      await enhancedPersistence.saveInstance(instance2);
      
      const result = await enhancedPersistence.performCrashRecovery();
      
      expect(result.recoveredInstances).toHaveLength(2);
      expect(result.failedRecoveries).toHaveLength(0);
      expect(result.recoveryTime).toBeGreaterThanOrEqual(0);
    });

    it('should create recovery snapshot', async () => {
      const instance = createTestInstance();
      await enhancedPersistence.saveInstance(instance);
      
      const snapshot = await enhancedPersistence.createRecoverySnapshot();
      
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.instanceCount).toBe(1);
      expect(snapshot.snapshotId).toMatch(/^snapshot-/);
    });

    it('should get recovery statistics', async () => {
      const instance1 = createTestInstance({ id: 'stats-1', status: 'running' });
      const instance2 = createTestInstance({ id: 'stats-2', status: 'failed' });
      
      await enhancedPersistence.saveInstance(instance1);
      await enhancedPersistence.saveInstance(instance2);
      
      const stats = await enhancedPersistence.getRecoveryStats();
      
      expect(stats.totalInstances).toBe(2);
      expect(stats.runningInstances).toBe(1);
      expect(stats.failedInstances).toBe(1);
    });
  });

  describe('consistency validation', () => {
    it('should validate instance consistency', async () => {
      const instance = createTestInstance({
        id: 'validation-instance',
        currentState: 'processing',
        history: [
          {
            type: 'workflow.created',
            instanceId: 'validation-instance',
            timestamp: new Date(),
            data: {},
          },
        ],
      });
      
      await enhancedPersistence.saveInstance(instance);
      
      const validation = await enhancedPersistence.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(true);
    });

    it('should detect inconsistencies', async () => {
      const instance = createTestInstance({
        id: 'inconsistent-instance',
        currentState: '', // Empty state should be detected
      });
      
      const validation = await enhancedPersistence.validateInstanceConsistency(instance);
      expect(validation.isValid).toBe(false);
      expect(validation.inconsistencies.length).toBeGreaterThan(0);
    });
  });
});