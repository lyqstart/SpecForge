/**
 * Property Test Generators for Workflow Runtime
 * Generates random but valid test data using fast-check
 */

import * as fc from 'fast-check';
import type { Arbitrary } from 'fast-check';
import { 
  type WorkflowDefinition, 
  type WorkflowInstance, 
  type GateDefinition, 
  type SimpleGateDefinition, 
  type CompositeGateDefinition,
  type CompositeGateMode,
  type FailPolicy,
  type WorkflowState,
  type StateMachine,
  type GateResult,
  type WorkflowInstanceStatus,
  type ArtifactDefinition
} from '../../src/types';

/**
 * Generate a valid simple gate definition
 */
export function simpleGateDefinitionArb(): Arbitrary<SimpleGateDefinition> {
  return fc.record({
    schema_version: fc.constant("1.0"),
    type: fc.constant('simple' as const),
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 50 })
  });
}

/**
 * Generate a valid composite gate definition (non-recursive for simplicity)
 */
export function compositeGateDefinitionArb(
  maxChildren: number = 3
): Arbitrary<CompositeGateDefinition> {
  return fc.record({
    schema_version: fc.constant("1.0"),
    type: fc.constant('composite' as const),
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    mode: fc.constantFrom('sequential' as CompositeGateMode, 'parallel' as CompositeGateMode),
    failPolicy: fc.constantFrom('fail_fast' as FailPolicy, 'collect_all' as FailPolicy),
    children: fc.array(simpleGateDefinitionArb(), { minLength: 1, maxLength: maxChildren })
  });
}

/**
 * Generate any gate definition (simple or composite)
 */
export function gateDefinitionArb(
  maxChildren: number = 3
): Arbitrary<GateDefinition> {
  // Use 60% simple, 40% composite
  return fc.oneof(
    simpleGateDefinitionArb(),
    compositeGateDefinitionArb(maxChildren)
  );
}

/**
 * Generate a valid workflow state
 */
export function workflowStateArb(gateIds: string[]): Arbitrary<WorkflowState> {
  if (gateIds.length === 0) {
    gateIds = ['default-gate'];
  }
  
  return fc.record({
    schema_version: fc.constant("1.0"),
    agent: fc.string({ minLength: 1, maxLength: 30 }),
    gate: fc.record({
      schema_version: fc.constant("1.0"),
      type: fc.constant('simple' as const),
      id: fc.constantFrom(...gateIds),
      name: fc.string({ minLength: 1, maxLength: 30 })
    }),
    skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    next: fc.oneof(
      fc.constantFrom(...gateIds).map(n => n as string | Record<string, string>),
      fc.constant(undefined)
    )
  });
}

/**
 * Generate a valid state machine
 * Uses fc.array to generate explicit state objects, avoiding __proto__ and length issues
 */
export function stateMachineArb(minStates: number = 2, maxStates: number = 5): Arbitrary<StateMachine> {
  // Generate safe state IDs that won't collide with Object.prototype properties
  const safeStringArb = fc.string({ 
    minLength: 3, 
    maxLength: 15 
  }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) && !['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'].includes(s));
  
  return fc.integer({ min: minStates, max: maxStates }).chain((stateCount) => {
    const stateIdsArb = fc.uniqueArray(
      safeStringArb,
      { minLength: stateCount, maxLength: stateCount }
    );
    
    return stateIdsArb.chain((stateIds) => {
      if (stateIds.length === 0) {
        return fc.constant({
          schema_version: "1.0" as const,
          initial: 'initial',
          states: {}
        });
      }
      
      // Use first safe state as initial to avoid __proto__
      const initialState = stateIds[0];
      
      // Build valid next states filter - must be from stateIds only
      const validNextStateArb = fc.oneof(
        fc.constantFrom(...stateIds),
        fc.constant(undefined)
      ).filter((next): next is string | undefined => {
        // Reject __proto__ and similar dangerous values
        if (typeof next === 'string' && ['__proto__', 'constructor', 'prototype'].includes(next)) {
          return false;
        }
        return true;
      });
      
      // Generate all states at once with proper structure
      return fc.record({
        schema_version: fc.constant("1.0" as const),
        initial: fc.constant(initialState),
        states: fc.record(
          stateIds.reduce((acc, id) => {
            const otherIds = stateIds.filter(i => i !== id);
            acc[id] = fc.record({
              schema_version: fc.constant("1.0" as const),
              agent: fc.string({ minLength: 1, maxLength: 30 }),
              gate: fc.record({
                schema_version: fc.constant("1.0" as const),
                type: fc.constant('simple' as const),
                id: fc.constant(id),
                name: fc.string({ minLength: 1, maxLength: 30 })
              }),
              skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
              next: otherIds.length > 0 
                ? fc.oneof(fc.constantFrom(...otherIds), fc.constant(undefined))
                : fc.constant(undefined)
            });
            return acc;
          }, {} as Record<string, Arbitrary<WorkflowState>>)
        )
      });
    });
  });
}

/**
 * Generate a valid workflow definition
 */
export function workflowDefinitionArb(
  minStates: number = 2,
  maxStates: number = 5
): Arbitrary<WorkflowDefinition> {
  return fc.record({
    schema_version: fc.constant("1.0"),
    id: fc.string({ minLength: 1, maxLength: 30 }),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
    intent: fc.string({ minLength: 1, maxLength: 200 }),
    stateMachine: stateMachineArb(minStates, maxStates),
    artifacts: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        type: fc.constantFrom('spec' as const, 'design' as const, 'tasks' as const, 'artifact' as const),
        content: fc.string({ minLength: 1, maxLength: 100 })
      } as const) as Arbitrary<ArtifactDefinition>,
      { maxLength: 3 }
    )
  });
}

/**
 * Generate a workflow instance status
 */
export function workflowInstanceStatusArb(): Arbitrary<WorkflowInstanceStatus> {
  return fc.constantFrom(
    'pending' as const,
    'running' as const,
    'paused' as const,
    'completed' as const,
    'failed' as const
  );
}

/**
 * Generate a valid workflow instance
 */
export function workflowInstanceArb(workflowId: string): Arbitrary<WorkflowInstance> {
  return fc.record({
    schema_version: fc.constant("1.0"),
    id: fc.string({ minLength: 1, maxLength: 30 }),
    workflowId: fc.constant(workflowId),
    currentState: fc.string({ minLength: 1, maxLength: 20 }),
    status: workflowInstanceStatusArb(),
    history: fc.array(
      fc.record({
        type: fc.constantFrom('started' as const, 'state_changed' as const, 'gate_completed' as const, 'failed' as const, 'completed' as const),
        instanceId: fc.string({ minLength: 1, maxLength: 30 }),
        timestamp: fc.date(),
        data: fc.json()
      }),
      { maxLength: 5 }
    ),
    createdAt: fc.date(),
    updatedAt: fc.date()
  });
}

/**
 * Generate a gate result
 */
export function gateResultArb(): Arbitrary<GateResult> {
  return fc.boolean().chain((passed) => {
    if (passed) {
      return fc.record({
        schema_version: fc.constant("1.0"),
        passed: fc.constant(passed),
        reason: fc.constant(undefined),
        details: fc.oneof(fc.record({}), fc.constant(undefined))
      });
    } else {
      return fc.record({
        schema_version: fc.constant("1.0"),
        passed: fc.constant(passed),
        reason: fc.string({ minLength: 1, maxLength: 100 }),
        details: fc.oneof(fc.record({}), fc.constant(undefined))
      });
    }
  });
}

/**
 * Generate a composite gate mode
 */
export function compositeGateModeArb(): Arbitrary<CompositeGateMode> {
  return fc.constantFrom('sequential' as const, 'parallel' as const);
}

/**
 * Generate a fail policy
 */
export function failPolicyArb(): Arbitrary<FailPolicy> {
  return fc.constantFrom('fail_fast' as const, 'collect_all' as const);
}

/**
 * Generate an array of gate definitions
 */
export function gateArrayArb(
  minLength: number = 1,
  maxLength: number = 5
): Arbitrary<GateDefinition[]> {
  return fc.array(gateDefinitionArb(3), { minLength, maxLength });
}

/**
 * Generate a composite gate with specific properties for testing
 * Useful for targeted property testing
 */
export function compositeGateWithModeArb(
  mode: CompositeGateMode,
  failPolicy: FailPolicy,
  childCount: number = 3
): Arbitrary<CompositeGateDefinition> {
  return fc.record({
    schema_version: fc.constant("1.0"),
    type: fc.constant('composite' as const),
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    mode: fc.constant(mode),
    failPolicy: fc.constant(failPolicy),
    children: fc.array(simpleGateDefinitionArb(), { minLength: childCount, maxLength: childCount })
  });
}

/**
 * Sample from an arbitrary - helper for quick generation
 */
export function sampleFrom<T>(arb: Arbitrary<T>, numSamples: number = 1): T[] {
  return fc.sample(arb, { numRuns: numSamples });
}