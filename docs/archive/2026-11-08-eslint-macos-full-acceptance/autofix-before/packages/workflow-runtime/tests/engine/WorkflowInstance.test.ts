/**
 * Unit tests for WorkflowInstance creation and management
 * Tests instance creation, state initialization, and ID tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WorkflowInstanceFactory,
  WorkflowInstanceTracker,
  WorkflowInstanceStateManager,
  CreateInstanceOptions,
} from '../../src/engine/WorkflowInstance.js';
import type { WorkflowInstance, WorkflowEventData } from '../../src/types.js';

describe('WorkflowInstance Creation and Management', () => {
  describe('WorkflowInstanceFactory', () => {
    describe('create', () => {
      it('should create a workflow instance with required fields', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance = WorkflowInstanceFactory.create(options);

        expect(instance).toBeDefined();
        expect(instance.id).toBeDefined();
        expect(typeof instance.id).toBe('string');
        expect(instance.id.length).toBeGreaterThan(0);
        expect(instance.workflowId).toBe('workflow-123');
        expect(instance.currentState).toBe('state1');
        expect(instance.status).toBe('pending');
        expect(instance.schema_version).toBe('1.0');
      });

      it('should generate unique IDs for each instance', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance1 = WorkflowInstanceFactory.create(options);
        const instance2 = WorkflowInstanceFactory.create(options);

        expect(instance1.id).not.toBe(instance2.id);
      });

      it('should initialize history as empty array', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance = WorkflowInstanceFactory.create(options);

        expect(Array.isArray(instance.history)).toBe(true);
        expect(instance.history).toHaveLength(0);
      });

      it('should set createdAt and updatedAt to current time', () => {
        const beforeCreation = new Date();
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance = WorkflowInstanceFactory.create(options);
        const afterCreation = new Date();

        expect(instance.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
        expect(instance.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
        expect(instance.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
        expect(instance.updatedAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
      });

      it('should support custom initial status', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
          initialStatus: 'running',
        };

        const instance = WorkflowInstanceFactory.create(options);

        expect(instance.status).toBe('running');
      });

      it('should support metadata in options', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
          metadata: { userId: 'user-456', projectId: 'project-789' },
        };

        const instance = WorkflowInstanceFactory.create(options);

        expect(instance).toBeDefined();
        expect(instance.workflowId).toBe('workflow-123');
      });

      it('should default to pending status when not specified', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance = WorkflowInstanceFactory.create(options);

        expect(instance.status).toBe('pending');
      });
    });

    describe('createWithInitialEvent', () => {
      it('should create instance with initial event in history', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const event: WorkflowEventData = {
          type: 'workflow_started',
          instanceId: 'instance-123',
          timestamp: new Date(),
        };

        const instance = WorkflowInstanceFactory.createWithInitialEvent(options, event);

        expect(instance.history).toHaveLength(1);
        expect(instance.history[0].type).toBe('workflow_started');
      });

      it('should create instance without event if not provided', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const instance = WorkflowInstanceFactory.createWithInitialEvent(options);

        expect(instance.history).toHaveLength(0);
      });

      it('should preserve event data in history', () => {
        const options: CreateInstanceOptions = {
          workflowId: 'workflow-123',
          initialState: 'state1',
        };

        const event: WorkflowEventData = {
          type: 'workflow_started',
          instanceId: 'instance-123',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          data: { initiator: 'user-456' },
        };

        const instance = WorkflowInstanceFactory.createWithInitialEvent(options, event);

        expect(instance.history[0].data).toEqual({ initiator: 'user-456' });
      });
    });

    describe('validate', () => {
      it('should validate a correct instance', () => {
        const instance: WorkflowInstance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(true);
      });

      it('should reject instance without id', () => {
        const instance = {
          schema_version: '1.0',
          id: '',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance without workflowId', () => {
        const instance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: '',
          currentState: 'state1',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance without currentState', () => {
        const instance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: '',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance with invalid status', () => {
        const instance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'invalid_status',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance with non-array history', () => {
        const instance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'pending',
          history: 'not-an-array',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance with invalid createdAt', () => {
        const instance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'pending',
          history: [],
          createdAt: 'not-a-date',
          updatedAt: new Date(),
        } as unknown as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });

      it('should reject instance with invalid schema_version', () => {
        const instance = {
          schema_version: '2.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as WorkflowInstance;

        const isValid = WorkflowInstanceFactory.validate(instance);

        expect(isValid).toBe(false);
      });
    });
  });

  describe('WorkflowInstanceTracker', () => {
    let tracker: WorkflowInstanceTracker;

    beforeEach(() => {
      tracker = new WorkflowInstanceTracker();
    });

    afterEach(() => {
      tracker.clear();
    });

    describe('register and get', () => {
      it('should register and retrieve an instance', () => {
        const instance = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });

        tracker.register(instance);
        const retrieved = tracker.get(instance.id);

        expect(retrieved).toEqual(instance);
      });

      it('should return undefined for unregistered instance', () => {
        const retrieved = tracker.get('non-existent-id');

        expect(retrieved).toBeUndefined();
      });

      it('should track multiple instances', () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });

        tracker.register(instance1);
        tracker.register(instance2);

        expect(tracker.get(instance1.id)).toEqual(instance1);
        expect(tracker.get(instance2.id)).toEqual(instance2);
        expect(tracker.size()).toBe(2);
      });
    });

    describe('getAll', () => {
      it('should return all tracked instances', () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });

        tracker.register(instance1);
        tracker.register(instance2);

        const all = tracker.getAll();

        expect(all).toHaveLength(2);
        expect(all).toContainEqual(instance1);
        expect(all).toContainEqual(instance2);
      });

      it('should return empty array when no instances tracked', () => {
        const all = tracker.getAll();

        expect(all).toHaveLength(0);
      });
    });

    describe('getByWorkflowId', () => {
      it('should return instances for specific workflow', () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        const instance3 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });

        tracker.register(instance1);
        tracker.register(instance2);
        tracker.register(instance3);

        const instances = tracker.getByWorkflowId('workflow-123');

        expect(instances).toHaveLength(2);
        expect(instances).toContainEqual(instance1);
        expect(instances).toContainEqual(instance2);
      });

      it('should return empty array for non-existent workflow', () => {
        const instances = tracker.getByWorkflowId('non-existent');

        expect(instances).toHaveLength(0);
      });
    });

    describe('getByStatus', () => {
      it('should return instances with specific status', () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
          initialStatus: 'pending',
        });
        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
          initialStatus: 'running',
        });
        const instance3 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
          initialStatus: 'pending',
        });

        tracker.register(instance1);
        tracker.register(instance2);
        tracker.register(instance3);

        const pending = tracker.getByStatus('pending');

        expect(pending).toHaveLength(2);
        expect(pending).toContainEqual(instance1);
        expect(pending).toContainEqual(instance3);
      });
    });

    describe('unregister', () => {
      it('should unregister an instance', () => {
        const instance = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });

        tracker.register(instance);
        expect(tracker.has(instance.id)).toBe(true);

        const removed = tracker.unregister(instance.id);

        expect(removed).toBe(true);
        expect(tracker.has(instance.id)).toBe(false);
      });

      it('should return false when unregistering non-existent instance', () => {
        const removed = tracker.unregister('non-existent-id');

        expect(removed).toBe(false);
      });
    });

    describe('clear', () => {
      it('should clear all tracked instances', () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });

        tracker.register(instance1);
        tracker.register(instance2);
        expect(tracker.size()).toBe(2);

        tracker.clear();

        expect(tracker.size()).toBe(0);
        expect(tracker.getAll()).toHaveLength(0);
      });
    });

    describe('size', () => {
      it('should return correct number of tracked instances', () => {
        expect(tracker.size()).toBe(0);

        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });
        tracker.register(instance1);
        expect(tracker.size()).toBe(1);

        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });
        tracker.register(instance2);
        expect(tracker.size()).toBe(2);
      });
    });

    describe('update', () => {
      it('should update a tracked instance', () => {
        const instance = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });

        tracker.register(instance);

        // Modify instance
        instance.currentState = 'state2';
        instance.status = 'running';

        tracker.update(instance);

        const retrieved = tracker.get(instance.id);
        expect(retrieved?.currentState).toBe('state2');
        expect(retrieved?.status).toBe('running');
      });

      it('should not update unregistered instance', () => {
        const instance = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });

        // Try to update without registering
        tracker.update(instance);

        expect(tracker.has(instance.id)).toBe(false);
      });
    });

    describe('getCreatedBetween', () => {
      it('should return instances created within time range', async () => {
        const instance1 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-123',
          initialState: 'state1',
        });

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));

        const instance2 = WorkflowInstanceFactory.create({
          workflowId: 'workflow-456',
          initialState: 'state1',
        });

        tracker.register(instance1);
        tracker.register(instance2);

        const startTime = new Date(instance1.createdAt.getTime() - 100);
        const endTime = new Date(instance2.createdAt.getTime() + 100);

        const instances = tracker.getCreatedBetween(startTime, endTime);

        expect(instances.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('WorkflowInstanceStateManager', () => {
    let instance: WorkflowInstance;

    beforeEach(() => {
      instance = WorkflowInstanceFactory.create({
        workflowId: 'workflow-123',
        initialState: 'state1',
      });
    });

    describe('addEvent', () => {
      it('should add event to instance history', () => {
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
          data: { from: 'state1', to: 'state2' },
        };

        WorkflowInstanceStateManager.addEvent(instance, event);

        expect(instance.history).toHaveLength(1);
        expect(instance.history[0]).toEqual(event);
      });

      it('should update updatedAt when adding event', () => {
        const beforeAdd = new Date();
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event);

        expect(instance.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeAdd.getTime());
      });

      it('should add multiple events to history', () => {
        const event1: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };
        const event2: WorkflowEventData = {
          type: 'gate_executed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event1);
        WorkflowInstanceStateManager.addEvent(instance, event2);

        expect(instance.history).toHaveLength(2);
      });
    });

    describe('transitionState', () => {
      it('should transition to new state', () => {
        WorkflowInstanceStateManager.transitionState(instance, 'state2');

        expect(instance.currentState).toBe('state2');
      });

      it('should add event when transitioning', () => {
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
          data: { from: 'state1', to: 'state2' },
        };

        WorkflowInstanceStateManager.transitionState(instance, 'state2', event);

        expect(instance.currentState).toBe('state2');
        expect(instance.history).toHaveLength(1);
      });

      it('should update updatedAt on transition', () => {
        const beforeTransition = new Date();

        WorkflowInstanceStateManager.transitionState(instance, 'state2');

        expect(instance.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeTransition.getTime());
      });

      it('should block critical states via transitionState (v1.1 guard)', () => {
        const criticalStates = [
          'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
          'implementation_ready', 'verification_done', 'closed',
        ];

        for (const state of criticalStates) {
          expect(() =>
            WorkflowInstanceStateManager.transitionState(instance, state)
          ).toThrow(/transitionState|transitionFull/);
        }
      });
    });

    describe('updateStatus', () => {
      it('should update instance status', () => {
        WorkflowInstanceStateManager.updateStatus(instance, 'running');

        expect(instance.status).toBe('running');
      });

      it('should add event when updating status', () => {
        const event: WorkflowEventData = {
          type: 'workflow_started',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.updateStatus(instance, 'running', event);

        expect(instance.status).toBe('running');
        expect(instance.history).toHaveLength(1);
      });
    });

    describe('getEventsByType', () => {
      it('should return events of specific type', () => {
        const event1: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };
        const event2: WorkflowEventData = {
          type: 'gate_executed',
          instanceId: instance.id,
          timestamp: new Date(),
        };
        const event3: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event1);
        WorkflowInstanceStateManager.addEvent(instance, event2);
        WorkflowInstanceStateManager.addEvent(instance, event3);

        const stateChanges = WorkflowInstanceStateManager.getEventsByType(instance, 'state_changed');

        expect(stateChanges).toHaveLength(2);
        expect(stateChanges).toContainEqual(event1);
        expect(stateChanges).toContainEqual(event3);
      });

      it('should return empty array for non-existent event type', () => {
        const events = WorkflowInstanceStateManager.getEventsByType(instance, 'non_existent');

        expect(events).toHaveLength(0);
      });
    });

    describe('getLastEvent', () => {
      it('should return last event in history', () => {
        const event1: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };
        const event2: WorkflowEventData = {
          type: 'gate_executed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event1);
        WorkflowInstanceStateManager.addEvent(instance, event2);

        const lastEvent = WorkflowInstanceStateManager.getLastEvent(instance);

        expect(lastEvent).toEqual(event2);
      });

      it('should return undefined when history is empty', () => {
        const lastEvent = WorkflowInstanceStateManager.getLastEvent(instance);

        expect(lastEvent).toBeUndefined();
      });
    });

    describe('getEventsBetween', () => {
      it('should return events within time range', () => {
        const startTime = new Date('2024-01-01T10:00:00Z');
        const midTime = new Date('2024-01-01T10:01:00Z');
        const endTime = new Date('2024-01-01T10:02:00Z');

        const event1: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date('2024-01-01T09:59:00Z'),
        };
        const event2: WorkflowEventData = {
          type: 'gate_executed',
          instanceId: instance.id,
          timestamp: midTime,
        };
        const event3: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date('2024-01-01T10:03:00Z'),
        };

        WorkflowInstanceStateManager.addEvent(instance, event1);
        WorkflowInstanceStateManager.addEvent(instance, event2);
        WorkflowInstanceStateManager.addEvent(instance, event3);

        const events = WorkflowInstanceStateManager.getEventsBetween(instance, startTime, endTime);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual(event2);
      });
    });

    describe('clearHistory', () => {
      it('should clear all events from history', () => {
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event);
        expect(instance.history).toHaveLength(1);

        WorkflowInstanceStateManager.clearHistory(instance);

        expect(instance.history).toHaveLength(0);
      });

      it('should update updatedAt when clearing history', () => {
        const beforeClear = new Date();

        WorkflowInstanceStateManager.clearHistory(instance);

        expect(instance.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeClear.getTime());
      });
    });

    describe('getSummary', () => {
      it('should return instance summary', () => {
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        WorkflowInstanceStateManager.addEvent(instance, event);

        const summary = WorkflowInstanceStateManager.getSummary(instance);

        expect(summary.id).toBe(instance.id);
        expect(summary.workflowId).toBe(instance.workflowId);
        expect(summary.currentState).toBe(instance.currentState);
        expect(summary.status).toBe(instance.status);
        expect(summary.eventCount).toBe(1);
        expect(summary.duration).toBeGreaterThanOrEqual(0);
      });

      it('should calculate duration correctly', async () => {
        const event: WorkflowEventData = {
          type: 'state_changed',
          instanceId: instance.id,
          timestamp: new Date(),
        };

        await new Promise(resolve => setTimeout(resolve, 100));

        WorkflowInstanceStateManager.addEvent(instance, event);

        const summary = WorkflowInstanceStateManager.getSummary(instance);

        expect(summary.duration).toBeGreaterThanOrEqual(80);
      });
    });
  });

  describe('Integration: Instance Creation and Tracking', () => {
    let tracker: WorkflowInstanceTracker;

    beforeEach(() => {
      tracker = new WorkflowInstanceTracker();
    });

    afterEach(() => {
      tracker.clear();
    });

    it('should create and track multiple instances', () => {
      const instance1 = WorkflowInstanceFactory.create({
        workflowId: 'workflow-123',
        initialState: 'state1',
      });
      const instance2 = WorkflowInstanceFactory.create({
        workflowId: 'workflow-456',
        initialState: 'state1',
      });

      tracker.register(instance1);
      tracker.register(instance2);

      expect(tracker.size()).toBe(2);
      expect(tracker.get(instance1.id)).toEqual(instance1);
      expect(tracker.get(instance2.id)).toEqual(instance2);
    });

    it('should manage instance lifecycle', () => {
      const instance = WorkflowInstanceFactory.create({
        workflowId: 'workflow-123',
        initialState: 'state1',
      });

      tracker.register(instance);

      // Transition state
      WorkflowInstanceStateManager.transitionState(instance, 'state2');
      tracker.update(instance);

      // Update status
      WorkflowInstanceStateManager.updateStatus(instance, 'running');
      tracker.update(instance);

      const retrieved = tracker.get(instance.id);
      expect(retrieved?.currentState).toBe('state2');
      expect(retrieved?.status).toBe('running');

      // Unregister
      tracker.unregister(instance.id);
      expect(tracker.has(instance.id)).toBe(false);
    });

    it('should validate instances before tracking', () => {
      const instance = WorkflowInstanceFactory.create({
        workflowId: 'workflow-123',
        initialState: 'state1',
      });

      const isValid = WorkflowInstanceFactory.validate(instance);
      expect(isValid).toBe(true);

      tracker.register(instance);
      expect(tracker.has(instance.id)).toBe(true);
    });
  });
});
