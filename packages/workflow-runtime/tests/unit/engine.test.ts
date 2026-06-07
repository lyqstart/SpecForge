/**
 * Unit tests for WorkflowEngine
 * Tests workflow definition loading, instance creation, and state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine, WorkflowEvent } from '../../src/engine/WorkflowEngine.js';
import { WorkflowDefinition, SimpleGateDefinition } from '../../src/types.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  describe('loadWorkflow', () => {
    it('should load a valid workflow definition and return workflow ID', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { schema_version: '1.0', type: 'simple', id: 'gate1', name: 'Gate 1' },
              skills: ['skill1'],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { schema_version: '1.0', type: 'simple', id: 'gate2', name: 'Gate 2' },
              skills: ['skill2'],
            },
          },
        },
        artifacts: [],
      };

      const workflowId = engine.loadWorkflow(definition);
      
      expect(workflowId).toBe('test-workflow');
      expect(engine.getWorkflow('test-workflow')).toEqual(definition);
    });

    it('should throw error for workflow without id', () => {
      const definition = {
        schema_version: '1.0',
        id: '',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: { state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [] } },
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition as WorkflowDefinition)).toThrow('must have an id');
    });

    it('should throw error for workflow without stateMachine', () => {
      const definition = {
        schema_version: '1.0',
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: null as unknown as WorkflowDefinition['stateMachine'],
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition as WorkflowDefinition)).toThrow('must have a stateMachine');
    });

    it('should throw error for workflow without initial state', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: '',
          states: { state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [] } },
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow('must have an initial state');
    });

    it('should throw error for workflow without states', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {},
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow('must have at least one state');
    });
  });

  describe('createInstance', () => {
    it('should create a workflow instance', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      expect(instance.id).toBeDefined();
      expect(instance.workflowId).toBe('test-workflow');
      expect(instance.currentState).toBe('state1');
      expect(instance.status).toBe('pending');
      expect(instance.createdAt).toBeInstanceOf(Date);
    });

    it('should throw error for unknown workflow', () => {
      expect(() => engine.createInstance('unknown')).toThrow('Workflow definition not found');
    });
  });

  describe('transition', () => {
    it('should transition from current state to valid next state', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [], next: 'state2' },
            state2: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g2', name: 'G2' }, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state1', 'state2');

      expect(result).toBe(true);
      expect(instance.currentState).toBe('state2');
    });

    it('should fail transition when instance does not exist', () => {
      const result = engine.transition('non-existent-instance', 'state1', 'state2');
      expect(result).toBe(false);
    });

    it('should fail transition when from state does not match current state', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [], next: 'state2' },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      // Try to transition from wrong state
      const result = engine.transition(instance.id, 'wrong-state', 'state2');

      expect(result).toBe(false);
      expect(instance.currentState).toBe('state1');
    });

    it('should fail transition to invalid next state', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [], next: 'state2' },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state1', 'invalid-state');

      expect(result).toBe(false);
      expect(instance.currentState).toBe('state1');
    });

    it('should support pass/fail branches for transition', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { 
              schema_version: '1.0', 
              agent: 'a', 
              gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, 
              skills: [], 
              next: { pass: 'state2', fail: 'state3' } 
            },
            state2: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g2', name: 'G2' }, skills: [] },
            state3: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g3', name: 'G3' }, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      // Transition using pass branch
      const result = engine.transition(instance.id, 'state1', 'state2');

      expect(result).toBe(true);
      expect(instance.currentState).toBe('state2');

      // Now try fail branch
      const instance2 = engine.createInstance('test-workflow');
      const result2 = engine.transition(instance2.id, 'state1', 'state3');

      expect(result2).toBe(true);
      expect(instance2.currentState).toBe('state3');
    });

    it('should emit event on successful transition', () => {
      const events: WorkflowEvent[] = [];
      engine.onEvent((event) => { events.push(event); });

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [], next: 'state2' },
            state2: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g2', name: 'G2' }, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      engine.transition(instance.id, 'state1', 'state2');

      expect(events).toHaveLength(2); // workflow.created + workflow.state_changed
      expect(events[1].type).toBe('workflow.state_changed');
      expect(events[1].data).toEqual({ from: 'state1', to: 'state2' });
    });
  });

  describe('getInstance', () => {
    it('should return workflow instance by ID', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' }, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const created = engine.createInstance('test-workflow');
      const retrieved = engine.getInstance(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent instance', () => {
      const result = engine.getInstance('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should execute a simple workflow to completion', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: null,
              skills: [],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: null,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      const result = await engine.execute(instance.id);

      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('state2');
    });

    it('should execute workflow with custom gate function', async () => {
      const gateFn = vi.fn().mockResolvedValue({ schema_version: '1.0', passed: true, reason: 'Custom check passed' });
      
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { schema_version: '1.0', type: 'simple', id: 'gate1', name: 'Gate 1', checkFn: gateFn } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      const result = await engine.execute(instance.id);

      expect(gateFn).toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });

    it('should follow pass/fail branches', async () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { 
                schema_version: '1.0',
                type: 'simple', 
                id: 'gate1', 
                name: 'Gate 1',
                checkFn: async () => ({ schema_version: '1.0', passed: true }),
              } as SimpleGateDefinition,
              skills: [],
              next: { pass: 'state2', fail: 'state3' },
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { schema_version: '1.0', type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
            state3: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: { schema_version: '1.0', type: 'simple', id: 'gate3', name: 'Gate 3' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      const result = await engine.execute(instance.id);

      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('state2');
    });
  });

  describe('events', () => {
    it('should emit workflow.created event', () => {
      const events: WorkflowEvent[] = [];
      engine.onEvent((event) => { events.push(event); });

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      engine.createInstance('test-workflow');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('workflow.created');
    });

    it('should emit multiple events during execution', async () => {
      const events: WorkflowEvent[] = [];
      engine.onEvent((event) => { events.push(event); });

      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: null,
              skills: [],
              next: 'state2',
            },
            state2: {
              schema_version: '1.0',
              agent: 'test-agent',
              gate: null,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      await engine.execute(instance.id);

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('workflow.created');
      expect(eventTypes).toContain('workflow.started');
      expect(eventTypes).toContain('workflow.state_changed');
      expect(eventTypes).toContain('workflow.completed');
    });
  });

  describe('pause/resume', () => {
    it('should throw error when pausing non-running workflow', () => {
      const definition: WorkflowDefinition = {
        schema_version: '1.0',
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          schema_version: '1.0',
          initial: 'state1',
          states: {
            state1: { schema_version: '1.0', agent: 'a', gate: { schema_version: '1.0', type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      expect(() => engine.pause(instance.id)).toThrow('Cannot pause workflow instance in status: pending');
    });
  });
});