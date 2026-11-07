/**
 * WorkflowInstanceStorage Unit Tests
 * Tests for the workflow instance storage interface
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWorkflowInstanceStorage } from '../../src/storage/WorkflowInstanceStorage.js';
import type { WorkflowInstanceStorage, WorkflowInstance } from '../../src/types.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('WorkflowInstanceStorage Interface', () => {
  let storage: WorkflowInstanceStorage;
  let storageDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    storageDir = await mkdtemp(join(tmpdir(), 'workflow-storage-test-'));
    storage = createWorkflowInstanceStorage({
      storageDir,
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

  describe('saveInstance', () => {
    it('should save a workflow instance to storage', async () => {
      const instance = createTestInstance();
      
      await storage.saveInstance(instance);
      
      const loaded = await storage.loadInstance(instance.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(instance.id);
      expect(loaded?.workflowId).toBe(instance.workflowId);
    });

    it('should save instance with schema_version field', async () => {
      const instance = createTestInstance();
      
      await storage.saveInstance(instance);
      
      const loaded = await storage.loadInstance(instance.id);
      expect(loaded?.schema_version).toBe('1.0');
    });

    it('should update existing instance', async () => {
      const instance = createTestInstance();
      await storage.saveInstance(instance);
      
      const updatedInstance = {
        ...instance,
        status: 'completed' as const,
        updatedAt: new Date(),
      };
      
      await storage.saveInstance(updatedInstance);
      
      const loaded = await storage.loadInstance(instance.id);
      expect(loaded?.status).toBe('completed');
    });
  });

  describe('loadInstance', () => {
    it('should return null for non-existent instance', async () => {
      const loaded = await storage.loadInstance('non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should load instance with correct data types', async () => {
      const instance = createTestInstance({
        history: [
          {
            type: 'workflow.created',
            instanceId: 'test-id',
            timestamp: new Date(),
            data: { workflowId: 'test-workflow' },
          },
        ],
      });
      
      await storage.saveInstance(instance);
      
      const loaded = await storage.loadInstance(instance.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.createdAt).toBeInstanceOf(Date);
      expect(loaded?.updatedAt).toBeInstanceOf(Date);
      expect(loaded?.history[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('deleteInstance', () => {
    it('should delete an existing instance', async () => {
      const instance = createTestInstance();
      await storage.saveInstance(instance);
      
      const deleted = await storage.deleteInstance(instance.id, { force: true });
      expect(deleted).toBe(true);
      
      const loaded = await storage.loadInstance(instance.id);
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent instance', async () => {
      const deleted = await storage.deleteInstance('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('listInstances', () => {
    it('should return empty array when no instances exist', async () => {
      const instances = await storage.listInstances();
      expect(instances).toEqual([]);
    });

    it('should list all saved instances', async () => {
      const instance1 = createTestInstance({ id: 'instance-1' });
      const instance2 = createTestInstance({ id: 'instance-2' });
      
      await storage.saveInstance(instance1);
      await storage.saveInstance(instance2);
      
      const instances = await storage.listInstances();
      expect(instances).toHaveLength(2);
      expect(instances.map((i: WorkflowInstance) => i.id)).toContain('instance-1');
      expect(instances.map((i: WorkflowInstance) => i.id)).toContain('instance-2');
    });

    it('should list instances with correct schema_version', async () => {
      const instance = createTestInstance();
      await storage.saveInstance(instance);
      
      const instances = await storage.listInstances();
      expect(instances[0].schema_version).toBe('1.0');
    });
  });

  describe('recoverState', () => {
    it('should recover workflow state from storage', async () => {
      const instance = createTestInstance({
        currentState: 'processing',
        status: 'running',
      });
      
      await storage.saveInstance(instance);
      
      const recovered = await storage.recoverState(instance.id);
      expect(recovered).not.toBeNull();
      expect(recovered?.currentState).toBe('processing');
      expect(recovered?.status).toBe('running');
    });

    it('should return null for non-existent instance', async () => {
      const recovered = await storage.recoverState('non-existent-id');
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
      
      await storage.saveInstance(instance);
      
      const result = await storage.replayEvents(instance.id);
      expect(result.replayedEvents).toBeGreaterThan(0);
      expect(result.instance.id).toBe(instance.id);
    });

    it('should handle empty history gracefully', async () => {
      const instance = createTestInstance({
        history: [],
      });
      
      await storage.saveInstance(instance);
      
      const result = await storage.replayEvents(instance.id);
      expect(result.replayedEvents).toBe(0);
      expect(result.instance.currentState).toBe('initial');
    });
  });

  describe('interface contract', () => {
    it('should implement all required methods', () => {
      // TypeScript will check this at compile time
      const storageMethods = [
        'saveInstance',
        'loadInstance',
        'deleteInstance',
        'listInstances',
        'recoverState',
        'replayEvents',
      ];
      
      storageMethods.forEach(method => {
        expect(storage).toHaveProperty(method);
        expect(typeof (storage as any)[method]).toBe('function');
      });
    });
  });
});

describe('createWorkflowInstanceStorage', () => {
  it('should create storage with default config', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    const storage = createWorkflowInstanceStorage({
      storageDir,
      enableEventReplay: false,
    });
    
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
    
    await storage.saveInstance(instance);
    const loaded = await storage.loadInstance('test-id');
    expect(loaded?.id).toBe('test-id');
    expect(loaded?.schema_version).toBe('1.0');
    
    await rm(storageDir, { recursive: true, force: true });
  });

  it('should create storage with event replay enabled', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'workflow-test-'));
    const storage = createWorkflowInstanceStorage({
      storageDir,
      enableEventReplay: true,
    });
    
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
    
    await storage.saveInstance(instance);
    const result = await storage.replayEvents('test-id');
    expect(result.instance.id).toBe('test-id');
    
    await rm(storageDir, { recursive: true, force: true });
  });
});