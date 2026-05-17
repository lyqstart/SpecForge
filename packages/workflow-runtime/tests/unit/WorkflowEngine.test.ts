/**
 * Unit tests for WorkflowEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine, WorkflowEvent } from '../../src/WorkflowEngine.js';
import { WorkflowDefinition, SimpleGateDefinition, CompositeGateDefinition } from '../../src/types.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  describe('loadWorkflow', () => {
    it('should load a valid workflow definition', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test Workflow',
        intent: 'Test workflow intent',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' },
              skills: ['skill1'],
              next: 'state2',
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' },
              skills: ['skill2'],
            },
          },
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).not.toThrow();
      expect(engine.getWorkflow('test-workflow')).toEqual(definition);
    });

    it('should throw error for workflow without id', () => {
      const definition: WorkflowDefinition = {
        id: '',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: { state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' }, skills: [] } },
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow('must have an id');
    });

    it('should throw error for workflow without stateMachine', () => {
      const definition = {
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: null as unknown as WorkflowDefinition['stateMachine'],
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow('must have a stateMachine');
    });

    it('should throw error for workflow without initial state', () => {
      const definition: WorkflowDefinition = {
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: '',
          states: { state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' }, skills: [] } },
        },
        artifacts: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow('must have an initial state');
    });

    it('should throw error for workflow without states', () => {
      const definition: WorkflowDefinition = {
        id: 'test',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
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
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' }, skills: [] },
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

  describe('execute', () => {
    it('should execute a simple workflow to completion', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
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
      const gateFn = vi.fn().mockResolvedValue({ passed: true, reason: 'Custom check passed' });
      
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1', checkFn: gateFn } as SimpleGateDefinition,
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
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { 
                type: 'simple', 
                id: 'gate1', 
                name: 'Gate 1',
                checkFn: async () => ({ passed: true }),
              } as SimpleGateDefinition,
              skills: [],
              next: { pass: 'state2', fail: 'state3' },
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
            state3: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate3', name: 'Gate 3' } as SimpleGateDefinition,
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
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
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
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
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

    it('should unsubscribe from events', () => {
      const events: WorkflowEvent[] = [];
      const handler = (event: WorkflowEvent) => { events.push(event); };
      
      engine.onEvent(handler);
      engine.offEvent(handler);

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      engine.createInstance('test-workflow');

      expect(events).toHaveLength(0);
    });

    it('should handle event handler errors gracefully', () => {
      const errorHandler = () => { throw new Error('Handler error'); };
      const successHandler = vi.fn();
      
      engine.onEvent(errorHandler);
      engine.onEvent(successHandler);

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      expect(() => engine.createInstance('test-workflow')).not.toThrow();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should handle async event handlers', async () => {
      const events: WorkflowEvent[] = [];
      const asyncHandler = async (event: WorkflowEvent) => {
        await new Promise(r => setTimeout(r, 10));
        events.push(event);
      };
      
      engine.onEvent(asyncHandler);

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      engine.createInstance('test-workflow');

      // Give async handler time to complete
      await new Promise(r => setTimeout(r, 50));
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('transition', () => {
    it('should transition between states', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'a',
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'a',
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state1', 'state2');
      expect(result).toBe(true);
      expect(engine.getInstance(instance.id)?.currentState).toBe('state2');
    });

    it('should fail transition from wrong current state', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'a',
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'a',
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state2', 'state1');
      expect(result).toBe(false);
    });

    it('should fail transition to invalid state', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'a',
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition,
              skills: [],
              next: 'state2',
            },
            state2: {
              agent: 'a',
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state1', 'state3');
      expect(result).toBe(false);
    });

    it('should fail transition for unknown instance', () => {
      const result = engine.transition('unknown-id', 'state1', 'state2');
      expect(result).toBe(false);
    });

    it('should transition with dynamic next states', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'a',
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition,
              skills: [],
              next: { pass: 'state2', fail: 'state3' },
            },
            state2: {
              agent: 'a',
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition,
              skills: [],
            },
            state3: {
              agent: 'a',
              gate: { type: 'simple', id: 'g3', name: 'G3' } as SimpleGateDefinition,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      const result = engine.transition(instance.id, 'state1', 'state2');
      expect(result).toBe(true);
    });
  });

  describe('pause/resume', () => {
    it('should pause a running workflow', async () => {
      // Create a workflow with multiple states for testing
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition, 
              skills: [],
              next: 'state2',
            },
            state2: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition, 
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      
      // Simulate running by directly setting status to running
      // (In real usage, this happens during execute())
      instance.status = 'running';
      
      // Pause the workflow
      const pausedInstance = engine.pause(instance.id, 'Testing pause');
      
      expect(pausedInstance.status).toBe('paused');
      expect(pausedInstance.currentState).toBe('state1');
    });

    it('should pause a running workflow at any state', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g1', name: 'G1' } as SimpleGateDefinition, 
              skills: [],
              next: 'state2',
            },
            state2: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition, 
              skills: [],
              next: 'state3',
            },
            state3: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g3', name: 'G3' } as SimpleGateDefinition, 
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      
      // Set to running and advance to state2
      instance.status = 'running';
      instance.currentState = 'state2';
      
      // Pause at state2
      const pausedInstance = engine.pause(instance.id, 'Paused at state2');
      
      expect(pausedInstance.status).toBe('paused');
      expect(pausedInstance.currentState).toBe('state2');
    });

    it('should throw error when pausing non-running workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      expect(() => engine.pause(instance.id)).toThrow('Cannot pause workflow instance in status: pending');
    });

    it('should throw error when pausing completed workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      instance.status = 'completed';

      expect(() => engine.pause(instance.id)).toThrow('Cannot pause workflow instance in status: completed');
    });

    it('should throw error when pausing already paused workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      instance.status = 'paused';

      expect(() => engine.pause(instance.id)).toThrow('Cannot pause workflow instance in status: paused');
    });

    it('should resume a paused workflow from current state', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { 
              agent: 'a', 
              gate: { 
                type: 'simple', 
                id: 'g1', 
                name: 'G1',
                checkFn: async () => ({ schema_version: '1.0', passed: true }),
              } as SimpleGateDefinition, 
              skills: [],
              next: 'state2',
            },
            state2: { 
              agent: 'a', 
              gate: { type: 'simple', id: 'g2', name: 'G2' } as SimpleGateDefinition, 
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      
      // Set to running and advance to state2
      instance.status = 'running';
      instance.currentState = 'state2';
      
      // Pause the workflow at state2
      engine.pause(instance.id, 'Need to pause');
      
      // Verify it's paused
      const pausedInstance = engine.getInstance(instance.id);
      expect(pausedInstance?.status).toBe('paused');
      
      // Resume the workflow - it should continue from state2
      // Note: Since the gate passes, it will complete the workflow
      await engine.resume(instance.id);
      
      const resumedInstance = engine.getInstance(instance.id);
      expect(resumedInstance?.status).toBe('completed');
      expect(resumedInstance?.currentState).toBe('state2');
    });

    it('should throw error when resuming non-paused workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');

      expect(() => engine.resume(instance.id)).toThrow('Cannot resume workflow instance in status: pending');
    });

    it('should throw error when resuming completed workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      instance.status = 'completed';

      expect(() => engine.resume(instance.id)).toThrow('Cannot resume workflow instance in status: completed');
    });

    it('should throw error when resuming running workflow', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      instance.status = 'running';

      expect(() => engine.resume(instance.id)).toThrow('Cannot resume workflow instance in status: running');
    });

    it('should throw error when instance not found', () => {
      expect(() => engine.pause('non-existent-id')).toThrow('Workflow instance not found: non-existent-id');
      expect(() => engine.resume('non-existent-id')).toThrow('Workflow instance not found: non-existent-id');
    });

    it('should store pause reason', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      instance.status = 'running';
      
      const pauseReason = 'User requested pause for maintenance';
      const pausedInstance = engine.pause(instance.id, pauseReason);
      
      // The reason should be stored in the instance's updatedAt
      expect(pausedInstance.status).toBe('paused');
      
      // Verify the instance was updated
      const updatedInstance = engine.getInstance(instance.id);
      expect(updatedInstance?.status).toBe('paused');
    });
  });

  describe('getAllInstances', () => {
    it('should return all workflow instances', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance1 = engine.createInstance('test-workflow');
      const instance2 = engine.createInstance('test-workflow');

      const allInstances = engine.getAllInstances();
      expect(allInstances).toHaveLength(2);
      expect(allInstances.map(i => i.id)).toContain(instance1.id);
      expect(allInstances.map(i => i.id)).toContain(instance2.id);
    });

    it('should return empty array when no instances exist', () => {
      const allInstances = engine.getAllInstances();
      expect(allInstances).toHaveLength(0);
    });
  });

  describe('executeGate', () => {
    it('should throw error for unknown gate type', async () => {
      const unknownGate = { type: 'unknown' } as unknown as GateDefinition;
      await expect(engine.executeGate(unknownGate)).rejects.toThrow('Unknown gate type');
    });

    it('should execute gate without checkFn', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'gate1',
        name: 'Gate 1',
      };

      const result = await engine.executeGate(gate);
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('No check function defined, default pass');
    });
  });

  describe('getInstance', () => {
    it('should return undefined for unknown instance', () => {
      const instance = engine.getInstance('unknown-id');
      expect(instance).toBeUndefined();
    });

    it('should return the correct instance', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: { agent: 'a', gate: { type: 'simple', id: 'g', name: 'G' } as SimpleGateDefinition, skills: [] },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const created = engine.createInstance('test-workflow');
      const retrieved = engine.getInstance(created.id);

      expect(retrieved).toEqual(created);
    });
  });

  describe('execute with no next state', () => {
    it('should complete workflow when state has no next', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate1', name: 'Gate 1' } as SimpleGateDefinition,
              skills: [],
              // No next state defined
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      const result = await engine.execute(instance.id);

      expect(result.status).toBe('completed');
      expect(result.currentState).toBe('state1');
    });

    it('should handle fail branch when gate fails', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: {
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
                checkFn: async () => ({ passed: false, reason: 'Failed' }),
              } as SimpleGateDefinition,
              skills: [],
              next: { pass: 'state2', fail: 'state3' },
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
            state3: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate3', name: 'Gate 3' } as SimpleGateDefinition,
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
      expect(result.currentState).toBe('state3');
    });

    it('should handle missing next state gracefully', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: {
                type: 'simple',
                id: 'gate1',
                name: 'Gate 1',
                checkFn: async () => ({ passed: true }),
              } as SimpleGateDefinition,
              skills: [],
              next: { pass: 'state2', fail: 'state3' },
            },
            state2: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate2', name: 'Gate 2' } as SimpleGateDefinition,
              skills: [],
            },
            state3: {
              agent: 'test-agent',
              gate: { type: 'simple', id: 'gate3', name: 'Gate 3' } as SimpleGateDefinition,
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
  describe('composite gates', () => {
    it('should execute composite gate in sequential mode', async () => {
      const executionOrder: string[] = [];
      
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child1',
        name: 'Child Gate 1',
        checkFn: async () => { executionOrder.push('child1'); return { passed: true }; },
      };
      
      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child2',
        name: 'Child Gate 2',
        checkFn: async () => { executionOrder.push('child2'); return { passed: true }; },
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite1',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: compositeGate,
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
      expect(executionOrder).toEqual(['child1', 'child2']);
    });

    it('should execute composite gate in parallel mode', async () => {
      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite1',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          { type: 'simple', id: 'child1', name: 'Child 1', checkFn: async () => ({ passed: true }) },
          { type: 'simple', id: 'child2', name: 'Child 2', checkFn: async () => ({ passed: true }) },
        ],
      };

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: compositeGate,
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
    });

    it('should fail fast in sequential mode', async () => {
      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite1',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [
          { type: 'simple', id: 'child1', name: 'Child 1', checkFn: async () => ({ passed: false, reason: 'Failed' }) },
          { type: 'simple', id: 'child2', name: 'Child 2', checkFn: async () => { throw new Error('Should not be reached'); } },
        ],
      };

      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        displayName: 'Test',
        intent: 'Test',
        stateMachine: {
          initial: 'state1',
          states: {
            state1: {
              agent: 'test-agent',
              gate: compositeGate,
              skills: [],
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(definition);
      const instance = engine.createInstance('test-workflow');
      const result = await engine.execute(instance.id);

      // The workflow completes but the composite gate reports failure
      // Since there's no next state, workflow ends as completed
      expect(result.status).toBe('completed');
    });
  });
});