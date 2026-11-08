/**
 * Unit tests for WorkflowInstance type definition
 * Validates the structure and properties of WorkflowInstance interface
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowInstance, WorkflowInstanceStatus, WorkflowEventData } from '../../src/types.js';

describe('WorkflowInstance Type Definition', () => {
  describe('WorkflowInstance interface', () => {
    it('should have schema_version field set to "1.0"', () => {
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

      expect(instance.schema_version).toBe('1.0');
    });

    it('should have required id field', () => {
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

      expect(instance.id).toBeDefined();
      expect(typeof instance.id).toBe('string');
      expect(instance.id.length).toBeGreaterThan(0);
    });

    it('should have required workflowId field', () => {
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

      expect(instance.workflowId).toBeDefined();
      expect(typeof instance.workflowId).toBe('string');
    });

    it('should have required currentState field', () => {
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

      expect(instance.currentState).toBeDefined();
      expect(typeof instance.currentState).toBe('string');
    });

    it('should have required status field with valid values', () => {
      const validStatuses: WorkflowInstanceStatus[] = ['pending', 'running', 'paused', 'completed', 'failed'];

      for (const status of validStatuses) {
        const instance: WorkflowInstance = {
          schema_version: '1.0',
          id: 'instance-123',
          workflowId: 'workflow-456',
          currentState: 'state1',
          status,
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        expect(instance.status).toBe(status);
      }
    });

    it('should have required history field as array', () => {
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

      expect(Array.isArray(instance.history)).toBe(true);
    });

    it('should have required createdAt field as Date', () => {
      const now = new Date();
      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state1',
        status: 'pending',
        history: [],
        createdAt: now,
        updatedAt: new Date(),
      };

      expect(instance.createdAt).toBeInstanceOf(Date);
      expect(instance.createdAt.getTime()).toBe(now.getTime());
    });

    it('should have required updatedAt field as Date', () => {
      const now = new Date();
      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state1',
        status: 'pending',
        history: [],
        createdAt: new Date(),
        updatedAt: now,
      };

      expect(instance.updatedAt).toBeInstanceOf(Date);
      expect(instance.updatedAt.getTime()).toBe(now.getTime());
    });

    it('should support workflow event history', () => {
      const event: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: new Date(),
        data: { from: 'state1', to: 'state2' },
      };

      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state2',
        status: 'running',
        history: [event],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(instance.history).toHaveLength(1);
      expect(instance.history[0].type).toBe('state_changed');
      expect(instance.history[0].instanceId).toBe('instance-123');
    });

    it('should support multiple events in history', () => {
      const events: WorkflowEventData[] = [
        {
          type: 'workflow_started',
          instanceId: 'instance-123',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          type: 'state_changed',
          instanceId: 'instance-123',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          data: { from: 'state1', to: 'state2' },
        },
        {
          type: 'gate_executed',
          instanceId: 'instance-123',
          timestamp: new Date('2024-01-01T10:02:00Z'),
          data: { gateId: 'gate1', result: 'passed' },
        },
      ];

      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state2',
        status: 'running',
        history: events,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(instance.history).toHaveLength(3);
      expect(instance.history.map(e => e.type)).toEqual([
        'workflow_started',
        'state_changed',
        'gate_executed',
      ]);
    });
  });

  describe('WorkflowEventData interface', () => {
    it('should have required type field', () => {
      const event: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: new Date(),
      };

      expect(event.type).toBeDefined();
      expect(typeof event.type).toBe('string');
    });

    it('should have required instanceId field', () => {
      const event: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: new Date(),
      };

      expect(event.instanceId).toBeDefined();
      expect(typeof event.instanceId).toBe('string');
    });

    it('should have required timestamp field as Date', () => {
      const now = new Date();
      const event: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: now,
      };

      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.getTime()).toBe(now.getTime());
    });

    it('should have optional data field', () => {
      const event1: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: new Date(),
      };

      const event2: WorkflowEventData = {
        type: 'state_changed',
        instanceId: 'instance-123',
        timestamp: new Date(),
        data: { from: 'state1', to: 'state2' },
      };

      expect(event1.data).toBeUndefined();
      expect(event2.data).toBeDefined();
      expect(typeof event2.data).toBe('object');
    });

    it('should support arbitrary data in data field', () => {
      const event: WorkflowEventData = {
        type: 'gate_executed',
        instanceId: 'instance-123',
        timestamp: new Date(),
        data: {
          gateId: 'gate1',
          result: 'passed',
          duration: 1234,
          metadata: { key: 'value' },
        },
      };

      expect(event.data?.gateId).toBe('gate1');
      expect(event.data?.result).toBe('passed');
      expect(event.data?.duration).toBe(1234);
      expect(event.data?.metadata).toEqual({ key: 'value' });
    });
  });

  describe('WorkflowInstanceStatus type', () => {
    it('should accept pending status', () => {
      const status: WorkflowInstanceStatus = 'pending';
      expect(status).toBe('pending');
    });

    it('should accept running status', () => {
      const status: WorkflowInstanceStatus = 'running';
      expect(status).toBe('running');
    });

    it('should accept paused status', () => {
      const status: WorkflowInstanceStatus = 'paused';
      expect(status).toBe('paused');
    });

    it('should accept completed status', () => {
      const status: WorkflowInstanceStatus = 'completed';
      expect(status).toBe('completed');
    });

    it('should accept failed status', () => {
      const status: WorkflowInstanceStatus = 'failed';
      expect(status).toBe('failed');
    });
  });

  describe('WorkflowInstance creation patterns', () => {
    it('should create instance with minimal required fields', () => {
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

      expect(instance).toBeDefined();
      expect(instance.id).toBe('instance-123');
      expect(instance.workflowId).toBe('workflow-456');
    });

    it('should create instance with full event history', () => {
      const createdAt = new Date('2024-01-01T10:00:00Z');
      const updatedAt = new Date('2024-01-01T10:05:00Z');

      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state3',
        status: 'completed',
        history: [
          {
            type: 'workflow_started',
            instanceId: 'instance-123',
            timestamp: new Date('2024-01-01T10:00:00Z'),
          },
          {
            type: 'state_changed',
            instanceId: 'instance-123',
            timestamp: new Date('2024-01-01T10:01:00Z'),
            data: { from: 'state1', to: 'state2' },
          },
          {
            type: 'state_changed',
            instanceId: 'instance-123',
            timestamp: new Date('2024-01-01T10:05:00Z'),
            data: { from: 'state2', to: 'state3' },
          },
          {
            type: 'workflow_completed',
            instanceId: 'instance-123',
            timestamp: new Date('2024-01-01T10:05:00Z'),
          },
        ],
        createdAt,
        updatedAt,
      };

      expect(instance.history).toHaveLength(4);
      expect(instance.status).toBe('completed');
      expect(instance.currentState).toBe('state3');
    });

    it('should support status transitions', () => {
      let instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state1',
        status: 'pending',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(instance.status).toBe('pending');

      // Simulate status transition
      instance = {
        ...instance,
        status: 'running',
        updatedAt: new Date(),
      };

      expect(instance.status).toBe('running');

      // Simulate completion
      instance = {
        ...instance,
        status: 'completed',
        currentState: 'final_state',
        updatedAt: new Date(),
      };

      expect(instance.status).toBe('completed');
      expect(instance.currentState).toBe('final_state');
    });
  });

  describe('WorkflowInstance serialization compatibility', () => {
    it('should be JSON serializable', () => {
      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: 'instance-123',
        workflowId: 'workflow-456',
        currentState: 'state1',
        status: 'running',
        history: [
          {
            type: 'state_changed',
            instanceId: 'instance-123',
            timestamp: new Date('2024-01-01T10:00:00Z'),
            data: { from: 'state0', to: 'state1' },
          },
        ],
        createdAt: new Date('2024-01-01T09:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      };

      const json = JSON.stringify(instance);
      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      // Verify it can be parsed back
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('instance-123');
      expect(parsed.workflowId).toBe('workflow-456');
      expect(parsed.schema_version).toBe('1.0');
    });

    it('should preserve schema_version during serialization', () => {
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

      const json = JSON.stringify(instance);
      const parsed = JSON.parse(json);

      expect(parsed.schema_version).toBe('1.0');
    });
  });
});
