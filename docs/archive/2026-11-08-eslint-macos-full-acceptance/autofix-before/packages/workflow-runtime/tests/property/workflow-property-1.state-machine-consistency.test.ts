/**
 * Property Test: Workflow State Machine Consistency
 * 
 * Feature: workflow
 * Property 1: State Machine Consistency
 * 
 * Validates: Requirements 1.2 - THE Workflow_Runtime SHALL maintain workflow instance 
 * state machine and support state transitions.
 * 
 * For all workflow instances w, state transitions must follow the rules defined in 
 * the workflow's state machine.
 * 
 * Derived-From: v6-architecture-overview Property 1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { WorkflowEngine } from '../../src/WorkflowEngine';
import { 
  WorkflowDefinition, 
  GateDefinition,
  SimpleGateDefinition
} from '../../src/types';
import { workflowDefinitionArb } from './generators';

// Configure iterations as per spec requirements
const NUM_ITERATIONS = 100;

describe('Property 1: Workflow State Machine Consistency', () => {
  
  describe('State Transition Validity', () => {
    /**
     * Property: All valid transitions should succeed
     */
    it('should allow valid state transitions defined in the workflow', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            
            const validTransitions: Array<{from: string, to: string}> = [];
            
            for (const [stateId, state] of Object.entries(workflowDef.stateMachine.states)) {
              if (state.next) {
                if (typeof state.next === 'string') {
                  validTransitions.push({ from: stateId, to: state.next });
                } else {
                  for (const targetState of Object.values(state.next)) {
                    validTransitions.push({ from: stateId, to: targetState });
                  }
                }
              }
            }
            
            if (validTransitions.length === 0) {
              return true;
            }
            
            const instance = engine.createInstance(workflowDef.id);
            const initialState = workflowDef.stateMachine.states[instance.currentState];
            
            if (!initialState || !initialState.next) {
              return true;
            }
            
            const validNextStates: string[] = [];
            if (typeof initialState.next === 'string') {
              validNextStates.push(initialState.next);
            } else {
              validNextStates.push(...Object.values(initialState.next));
            }
            
            for (const nextState of validNextStates) {
              const testInstance = engine.createInstance(workflowDef.id);
              const currentState = testInstance.currentState;
              const result = engine.transition(testInstance.id, currentState, nextState);
              expect(result).toBe(true);
              const updatedInstance = engine.getInstance(testInstance.id);
              expect(updatedInstance?.currentState).toBe(nextState);
            }
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Invalid transitions should be rejected
     */
    it('should reject invalid state transitions not defined in workflow', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            
            const instance = engine.createInstance(workflowDef.id);
            const currentState = instance.currentState;
            const currentStateDef = workflowDef.stateMachine.states[currentState];
            const allStates = Object.keys(workflowDef.stateMachine.states);
            
            let validNextStates: string[] = [];
            if (currentStateDef?.next) {
              if (typeof currentStateDef.next === 'string') {
                validNextStates = [currentStateDef.next];
              } else {
                validNextStates = Object.values(currentStateDef.next);
              }
            }
            
            const invalidNextStates = allStates.filter(
              s => s !== currentState && !validNextStates.includes(s)
            );
            
            if (invalidNextStates.length === 0) {
              return true;
            }
            
            for (const invalidState of invalidNextStates) {
              const result = engine.transition(instance.id, currentState, invalidState);
              expect(result).toBe(false);
              const unchangedInstance = engine.getInstance(instance.id);
              expect(unchangedInstance?.currentState).toBe(currentState);
            }
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Initial State Configuration', () => {
    /**
     * Property: Initial state must be correctly set
     */
    it('should set initial state correctly when creating workflow instance', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            const instance = engine.createInstance(workflowDef.id);
            expect(instance.currentState).toBe(workflowDef.stateMachine.initial);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Initial status must be 'pending'
     */
    it('should set initial status to pending', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            const instance = engine.createInstance(workflowDef.id);
            expect(instance.status).toBe('pending');
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('State Machine Structure Validity', () => {
    /**
     * Property: All states must have valid gate definitions
     */
    it('should have valid gate definitions for all states', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            for (const [, state] of Object.entries(workflowDef.stateMachine.states)) {
              expect(state.gate).toBeDefined();
              expect(state.gate.id).toBeTruthy();
              expect(['simple', 'composite']).toContain(state.gate.type);
            }
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Initial state must exist in states map
     */
    it('should have initial state present in states map', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const initialState = workflowDef.stateMachine.initial;
            const stateKeys = Object.keys(workflowDef.stateMachine.states);
            expect(stateKeys).toContain(initialState);
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: All referenced next states must exist
     */
    it('should have all next states exist in state machine', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const stateIds = Object.keys(workflowDef.stateMachine.states);
            for (const [, state] of Object.entries(workflowDef.stateMachine.states)) {
              if (state.next) {
                const nextStates = typeof state.next === 'string' 
                  ? [state.next] 
                  : Object.values(state.next);
                for (const nextState of nextStates) {
                  expect(stateIds).toContain(nextState);
                }
              }
            }
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });

  describe('Transition Rejection Scenarios', () => {
    /**
     * Property: Transition from non-current state should fail
     */
    it('should reject transition when from state is not current', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(3, 5),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            
            const instance = engine.createInstance(workflowDef.id);
            const currentState = instance.currentState;
            
            const allStates = Object.keys(workflowDef.stateMachine.states);
            const differentState = allStates.find(s => s !== currentState);
            
            if (!differentState) return true;
            
            const currentStateDef = workflowDef.stateMachine.states[currentState];
            let validNextState: string | undefined;
            
            if (currentStateDef?.next) {
              validNextState = typeof currentStateDef.next === 'string' 
                ? currentStateDef.next 
                : Object.values(currentStateDef.next)[0];
            }
            
            if (!validNextState) return true;
            
            const result = engine.transition(instance.id, differentState, validNextState);
            expect(result).toBe(false);
            const unchangedInstance = engine.getInstance(instance.id);
            expect(unchangedInstance?.currentState).toBe(currentState);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });

    /**
     * Property: Transition with non-existent instance should fail
     */
    it('should reject transition for non-existent instance', () => {
      const engine = new WorkflowEngine();
      const result = engine.transition('non-existent-id', 'state1', 'state2');
      expect(result).toBe(false);
    });

    /**
     * Property: Transition to undefined state should fail
     */
    it('should reject transition to undefined state', () => {
      fc.assert(
        fc.property(
          workflowDefinitionArb(2, 4),
          (workflowDef) => {
            const engine = new WorkflowEngine();
            engine.loadWorkflow(workflowDef);
            
            const instance = engine.createInstance(workflowDef.id);
            const currentState = instance.currentState;
            
            const result = engine.transition(instance.id, currentState, 'non-existent-state');
            expect(result).toBe(false);
            
            const unchangedInstance = engine.getInstance(instance.id);
            expect(unchangedInstance?.currentState).toBe(currentState);
            
            return true;
          }
        ),
        { numRuns: NUM_ITERATIONS }
      );
    });
  });
});

describe('Property 1: Edge Cases', () => {
  /**
   * Edge Case: Single state workflow
   */
  it('should handle single state workflow correctly', () => {
    const singleStateWorkflow: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'single-state-workflow',
      displayName: 'Single State',
      intent: 'Test single state',
      stateMachine: {
        schema_version: '1.0',
        initial: 'only-state',
        states: {
          'only-state': {
            schema_version: '1.0',
            agent: 'test-agent',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate1', name: 'Gate 1' },
            skills: []
          }
        }
      },
      artifacts: []
    };
    
    const engine = new WorkflowEngine();
    engine.loadWorkflow(singleStateWorkflow);
    const instance = engine.createInstance(singleStateWorkflow.id);
    
    expect(instance.currentState).toBe('only-state');
    expect(instance.status).toBe('pending');
    
    const result = engine.transition(instance.id, 'only-state', 'any-other-state');
    expect(result).toBe(false);
  });

  /**
   * Edge Case: Linear state chain
   */
  it('should handle linear state chain correctly', () => {
    const linearWorkflow: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'linear-workflow',
      displayName: 'Linear',
      intent: 'Test linear',
      stateMachine: {
        schema_version: '1.0',
        initial: 'state1',
        states: {
          'state1': {
            schema_version: '1.0',
            agent: 'agent1',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate1', name: 'Gate 1' },
            skills: [],
            next: 'state2'
          },
          'state2': {
            schema_version: '1.0',
            agent: 'agent2',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate2', name: 'Gate 2' },
            skills: [],
            next: 'state3'
          },
          'state3': {
            schema_version: '1.0',
            agent: 'agent3',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate3', name: 'Gate 3' },
            skills: []
          }
        }
      },
      artifacts: []
    };
    
    const engine = new WorkflowEngine();
    engine.loadWorkflow(linearWorkflow);
    const instance = engine.createInstance(linearWorkflow.id);
    
    expect(instance.currentState).toBe('state1');
    expect(engine.transition(instance.id, 'state1', 'state2')).toBe(true);
    expect(engine.getInstance(instance.id)?.currentState).toBe('state2');
    expect(engine.transition(instance.id, 'state2', 'state3')).toBe(true);
    expect(engine.getInstance(instance.id)?.currentState).toBe('state3');
    expect(engine.transition(instance.id, 'state3', 'state1')).toBe(false);
  });

  /**
   * Edge Case: Branching state machine (pass/fail paths)
   */
  it('should handle branching state machine with pass/fail paths', () => {
    const branchingWorkflow: WorkflowDefinition = {
      schema_version: '1.0',
      id: 'branching-workflow',
      displayName: 'Branching',
      intent: 'Test branching',
      stateMachine: {
        schema_version: '1.0',
        initial: 'decision',
        states: {
          'decision': {
            schema_version: '1.0',
            agent: 'agent1',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate1', name: 'Decision Gate' },
            skills: [],
            next: {
              pass: 'success',
              fail: 'failure'
            }
          },
          'success': {
            schema_version: '1.0',
            agent: 'agent2',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate2', name: 'Success Gate' },
            skills: []
          },
          'failure': {
            schema_version: '1.0',
            agent: 'agent3',
            gate: { schema_version: '1.0', type: 'simple', id: 'gate3', name: 'Failure Gate' },
            skills: []
          }
        }
      },
      artifacts: []
    };
    
    const engine = new WorkflowEngine();
    engine.loadWorkflow(branchingWorkflow);
    
    const passInstance = engine.createInstance(branchingWorkflow.id);
    expect(engine.transition(passInstance.id, 'decision', 'success')).toBe(true);
    expect(engine.getInstance(passInstance.id)?.currentState).toBe('success');
    
    const failInstance = engine.createInstance(branchingWorkflow.id);
    expect(engine.transition(failInstance.id, 'decision', 'failure')).toBe(true);
    expect(engine.getInstance(failInstance.id)?.currentState).toBe('failure');
    
    const invalidPass = engine.transition(passInstance.id, 'success', 'failure');
    expect(invalidPass).toBe(false);
  });
});