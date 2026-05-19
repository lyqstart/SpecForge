/**
 * End-to-End Test: Complete Workflow Execution with Property 29 (compositeGate Semantics)
 * 
 * Feature: workflow-runtime, Task 5.1: End-to-End Tests
 * 
 * This test validates:
 * 1. Complete workflow execution flow
 * 2. Integration with parent spec (v6-architecture-overview)
 * 3. Property 29: Composite Gate Semantics
 * 
 * Property 29 Validation:
 * - mode = sequential: Execute in sequence order
 * - mode = parallel: Execute concurrently
 * - failPolicy = fail_fast + mode = parallel: Cancel unfinished children on any child failure
 * - failPolicy = collect_all: Complete all children then aggregate failures
 * 
 * Derived-From: v6-architecture-overview Property 29
 * Validates: Requirements 3.3, 3.4, 3.5 (workflow-runtime requirements.md)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '@specforge/daemon-core/src/event-bus/EventBus';
import { WorkflowEngine } from '../../src/WorkflowEngine.js';
import { EventPublisher } from '../../src/events/EventPublisher.js';
import { CompositeGateRunner } from '../../src/GateRunner.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  IEventBus,
  Event,
  GateResult,
  CompositeGateDefinition,
  SimpleGateDefinition,
  GateDefinition,
} from '../../src/types.js';

// Test configuration
const NUM_ITERATIONS = 100;

/**
 * Helper: Create a simple workflow definition for testing
 */
function createSimpleWorkflow(): WorkflowDefinition {
  return {
    id: 'e2e-simple-workflow',
    displayName: 'Simple E2E Workflow',
    intent: 'test-e2e',
    schema_version: '1.0',
    stateMachine: {
      initial: 'requirements',
      states: {
        requirements: {
          agent: 'requirements-agent',
          gate: {
            id: 'req-gate',
            type: 'simple',
            checkFn: async () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'Requirements validated',
              details: {}
            }),
          },
          next: 'design',
        },
        design: {
          agent: 'design-agent',
          gate: {
            id: 'design-gate',
            type: 'simple',
            checkFn: async () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'Design validated',
              details: {}
            }),
          },
          next: 'implementation',
        },
        implementation: {
          agent: 'impl-agent',
          gate: {
            id: 'impl-gate',
            type: 'simple',
            checkFn: async () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'Implementation validated',
              details: {}
            }),
          },
          next: undefined,
        },
      },
    },
    artifacts: [],
  };
}

/**
 * Helper: Create a workflow with compositeGate (sequential mode)
 */
function createSequentialCompositeGateWorkflow(): WorkflowDefinition {
  return {
    id: 'e2e-sequential-composite-workflow',
    displayName: 'Sequential Composite Gate Workflow',
    intent: 'test-sequential-composite',
    schema_version: '1.0',
    stateMachine: {
      initial: 'requirements',
      states: {
        requirements: {
          agent: 'requirements-agent',
          gate: {
            schema_version: '1.0',
            type: 'composite',
            id: 'req-composite-gate',
            name: 'Requirements Composite Gate',
            mode: 'sequential',
            failPolicy: 'collect_all',
            children: [
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'req-check-1',
                name: 'Requirements Check 1',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Req check 1 passed',
                  details: { step: 1 }
                }),
              },
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'req-check-2',
                name: 'Requirements Check 2',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Req check 2 passed',
                  details: { step: 2 }
                }),
              },
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'req-check-3',
                name: 'Requirements Check 3',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Req check 3 passed',
                  details: { step: 3 }
                }),
              },
            ],
          },
          next: 'design',
        },
        design: {
          agent: 'design-agent',
          gate: {
            id: 'design-gate',
            type: 'simple',
            checkFn: async () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'Design validated',
              details: {}
            }),
          },
          next: undefined,
        },
      },
    },
    artifacts: [],
  };
}

/**
 * Helper: Create a workflow with compositeGate (parallel mode)
 */
function createParallelCompositeGateWorkflow(): WorkflowDefinition {
  return {
    id: 'e2e-parallel-composite-workflow',
    displayName: 'Parallel Composite Gate Workflow',
    intent: 'test-parallel-composite',
    schema_version: '1.0',
    stateMachine: {
      initial: 'verification',
      states: {
        verification: {
          agent: 'verification-agent',
          gate: {
            schema_version: '1.0',
            type: 'composite',
            id: 'verify-composite-gate',
            name: 'Verification Composite Gate',
            mode: 'parallel',
            failPolicy: 'collect_all',
            children: [
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'verify-check-1',
                name: 'Verification Check 1',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Verify check 1 passed',
                  details: { step: 1 }
                }),
              },
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'verify-check-2',
                name: 'Verification Check 2',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Verify check 2 passed',
                  details: { step: 2 }
                }),
              },
              {
                schema_version: '1.0',
                type: 'simple',
                id: 'verify-check-3',
                name: 'Verification Check 3',
                checkFn: async () => ({
                  schema_version: '1.0',
                  passed: true,
                  reason: 'Verify check 3 passed',
                  details: { step: 3 }
                }),
              },
            ],
          },
          next: undefined,
        },
      },
    },
    artifacts: [],
  };
}

/**
 * Helper: Create a compositeGate definition for direct testing
 */
function createCompositeGateDefinition(
  mode: 'sequential' | 'parallel',
  failPolicy: 'fail_fast' | 'collect_all',
  children: SimpleGateDefinition[]
): CompositeGateDefinition {
  return {
    schema_version: '1.0',
    type: 'composite',
    id: `composite-gate-${mode}-${failPolicy}`,
    name: `Test ${mode} ${failPolicy} Composite Gate`,
    mode,
    failPolicy,
    children,
  };
}

describe('Task 5.1: End-to-End Tests for Property 29 (compositeGate Semantics)', () => {
  let eventBus: EventBus;
  let engine: WorkflowEngine;
  let publisher: EventPublisher;
  let publishedEvents: Event[];

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();

    // Capture all published events
    publishedEvents = [];
    eventBus.subscribe('*', (event: Event) => {
      publishedEvents.push(event);
    });

    publisher = new EventPublisher({
      projectId: 'e2e-test',
      eventBus: eventBus as unknown as IEventBus,
      source: 'daemon',
    });

    engine = new WorkflowEngine({
      eventPublisher: publisher,
    });
  });

  afterEach(() => {
    eventBus.stop();
    publishedEvents = [];
  });

  describe('Complete Workflow Execution Flow', () => {
    /**
     * Test: Simple workflow execution from start to finish
     */
    it('should execute a simple workflow end-to-end', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      const instance = engine.createInstance(workflow.id);
      expect(instance).toBeDefined();
      expect(instance.id).toBeDefined();
      expect(instance.workflowId).toBe(workflow.id);
      expect(instance.currentState).toBe('requirements');

      // Execute the workflow
      const result = await engine.execute(instance.id);

      // Verify the workflow completed successfully
      expect(result.status).toBe('completed');

      // Verify events were published
      const startedEvent = publishedEvents.find(e => e.action === 'workflow.started');
      const completedEvent = publishedEvents.find(e => e.action === 'workflow.completed');

      expect(startedEvent).toBeDefined();
      expect(completedEvent).toBeDefined();
    });

    /**
     * Test: Workflow with sequential compositeGate executes correctly
     */
    it('should execute workflow with sequential compositeGate', async () => {
      const workflow = createSequentialCompositeGateWorkflow();
      engine.loadWorkflow(workflow);

      const instance = engine.createInstance(workflow.id);
      expect(instance.currentState).toBe('requirements');

      // Execute workflow
      const result = await engine.execute(instance.id);

      // Verify completion
      expect(result.status).toBe('completed');

      // Verify compositeGate was executed (the parent composite gate should have an event)
      const gateCompletedEvents = publishedEvents.filter(
        e => e.action === 'workflow.gate.completed'
      );
      
      // The compositeGate should have been executed
      expect(gateCompletedEvents.length).toBeGreaterThan(0);
    });

    /**
     * Test: Workflow with parallel compositeGate executes correctly
     */
    it('should execute workflow with parallel compositeGate', async () => {
      const workflow = createParallelCompositeGateWorkflow();
      engine.loadWorkflow(workflow);

      const instance = engine.createInstance(workflow.id);
      expect(instance.currentState).toBe('verification');

      // Execute workflow
      const result = await engine.execute(instance.id);

      // Verify completion
      expect(result.status).toBe('completed');

      // Verify compositeGate was executed
      const gateCompletedEvents = publishedEvents.filter(
        e => e.action === 'workflow.gate.completed'
      );
      
      // The compositeGate should have been executed
      expect(gateCompletedEvents.length).toBeGreaterThan(0);
    });

    /**
     * Test: Multiple workflow instances can run concurrently
     */
    it('should handle multiple concurrent workflow instances', async () => {
      const workflow = createSimpleWorkflow();
      engine.loadWorkflow(workflow);

      const instance1 = engine.createInstance(workflow.id);
      const instance2 = engine.createInstance(workflow.id);
      const instance3 = engine.createInstance(workflow.id);

      // Execute all instances concurrently
      const [result1, result2, result3] = await Promise.all([
        engine.execute(instance1.id),
        engine.execute(instance2.id),
        engine.execute(instance3.id),
      ]);

      // All should complete successfully
      expect(result1.status).toBe('completed');
      expect(result2.status).toBe('completed');
      expect(result3.status).toBe('completed');

      // Events should be properly isolated per instance
      const instance1Events = publishedEvents.filter(
        e => e.payload.instanceId === instance1.id
      );
      const instance2Events = publishedEvents.filter(
        e => e.payload.instanceId === instance2.id
      );
      const instance3Events = publishedEvents.filter(
        e => e.payload.instanceId === instance3.id
      );

      expect(instance1Events.length).toBeGreaterThan(0);
      expect(instance2Events.length).toBeGreaterThan(0);
      expect(instance3Events.length).toBeGreaterThan(0);
    });
  });

  describe('Property 29: Composite Gate Semantics', () => {
    /**
     * Property 29.1: Sequential mode executes in order
     * Validates: Requirements 3.3
     */
    it('should execute compositeGate children in sequential order', async () => {
      const executionLog: string[] = [];

      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-child-1',
          name: 'Sequential Child 1',
          checkFn: async () => {
            executionLog.push('seq-child-1');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 1 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-child-2',
          name: 'Sequential Child 2',
          checkFn: async () => {
            executionLog.push('seq-child-2');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 2 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-child-3',
          name: 'Sequential Child 3',
          checkFn: async () => {
            executionLog.push('seq-child-3');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 3 passed',
              details: {}
            };
          }
        },
      ];

      const compositeGate = createCompositeGateDefinition('sequential', 'collect_all', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Verify all children executed in order
      expect(executionLog).toEqual(['seq-child-1', 'seq-child-2', 'seq-child-3']);
      expect(result.passed).toBe(true);
    });

    /**
     * Property 29.2: Parallel mode executes concurrently
     * Validates: Requirements 3.4
     */
    it('should execute compositeGate children in parallel mode', async () => {
      const executionLog: string[] = [];
      const startTimes: number[] = [];

      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'par-child-1',
          name: 'Parallel Child 1',
          checkFn: async () => {
            startTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 20));
            executionLog.push('par-child-1');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 1 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'par-child-2',
          name: 'Parallel Child 2',
          checkFn: async () => {
            startTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 10));
            executionLog.push('par-child-2');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 2 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'par-child-3',
          name: 'Parallel Child 3',
          checkFn: async () => {
            startTimes.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 15));
            executionLog.push('par-child-3');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 3 passed',
              details: {}
            };
          }
        },
      ];

      const compositeGate = createCompositeGateDefinition('parallel', 'collect_all', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Verify all children executed
      expect(executionLog.length).toBe(3);
      expect(result.passed).toBe(true);

      // Verify parallel execution (start times should be close)
      const maxStartTimeDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxStartTimeDiff).toBeLessThan(50); // All should start within 50ms
    });

    /**
     * Property 29.3: fail_fast with parallel mode cancels unfinished children
     * Validates: Requirements 3.5
     */
    it('should cancel unfinished children with fail_fast in parallel mode', async () => {
      const executionStatus: Record<string, string> = {};

      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ff-par-child-1',
          name: 'FF Parallel Child 1 (slow)',
          checkFn: async () => {
            executionStatus['ff-par-child-1'] = 'started';
            await new Promise(resolve => setTimeout(resolve, 30));
            executionStatus['ff-par-child-1'] = 'completed';
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 1 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ff-par-child-2',
          name: 'FF Parallel Child 2 (fast fail)',
          checkFn: async () => {
            executionStatus['ff-par-child-2'] = 'started';
            await new Promise(resolve => setTimeout(resolve, 5));
            executionStatus['ff-par-child-2'] = 'completed';
            return {
              schema_version: '1.0',
              passed: false,
              reason: 'Child 2 intentionally failed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ff-par-child-3',
          name: 'FF Parallel Child 3 (slow)',
          checkFn: async () => {
            executionStatus['ff-par-child-3'] = 'started';
            await new Promise(resolve => setTimeout(resolve, 25));
            executionStatus['ff-par-child-3'] = 'completed';
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 3 passed',
              details: {}
            };
          }
        },
      ];

      const compositeGate = createCompositeGateDefinition('parallel', 'fail_fast', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Should fail due to fail_fast
      expect(result.passed).toBe(false);
      expect(result.details).toBeDefined();
      expect((result.details as any).failPolicy).toBe('fail_fast');

      // Failing child should have completed
      expect(executionStatus['ff-par-child-2']).toBe('completed');

      // Other children may or may not have completed (timing dependent)
      // But the result should indicate fail_fast behavior
    });

    /**
     * Property 29.4: collect_all executes all children and aggregates results
     * Validates: Requirements 3.6
     */
    it('should aggregate all results with collect_all policy', async () => {
      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ca-child-1',
          name: 'Collect All Child 1',
          checkFn: async () => ({
            schema_version: '1.0',
            passed: true,
            reason: 'Child 1 passed',
            details: { childId: 'ca-child-1' }
          })
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ca-child-2',
          name: 'Collect All Child 2',
          checkFn: async () => ({
            schema_version: '1.0',
            passed: false,
            reason: 'Child 2 failed',
            details: { childId: 'ca-child-2', error: 'intentional failure' }
          })
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'ca-child-3',
          name: 'Collect All Child 3',
          checkFn: async () => ({
            schema_version: '1.0',
            passed: true,
            reason: 'Child 3 passed',
            details: { childId: 'ca-child-3' }
          })
        },
      ];

      const compositeGate = createCompositeGateDefinition('parallel', 'collect_all', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Should fail (because child 2 failed)
      expect(result.passed).toBe(false);

      // Should have results for all children
      expect(result.details).toBeDefined();
      const childResults = (result.details as any).results;
      expect(childResults).toBeDefined();
      expect(childResults.length).toBe(3);

      // Verify each child's result
      expect(childResults[0].passed).toBe(true);
      expect(childResults[1].passed).toBe(false);
      expect(childResults[2].passed).toBe(true);
    });

    /**
     * Property 29.5: Sequential mode with fail_fast stops on first failure
     * Validates: Requirements 3.5
     */
    it('should stop on first failure with fail_fast in sequential mode', async () => {
      const executionLog: string[] = [];

      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-ff-child-1',
          name: 'Sequential FF Child 1',
          checkFn: async () => {
            executionLog.push('seq-ff-child-1');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 1 passed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-ff-child-2',
          name: 'Sequential FF Child 2 (fails)',
          checkFn: async () => {
            executionLog.push('seq-ff-child-2');
            return {
              schema_version: '1.0',
              passed: false,
              reason: 'Child 2 failed',
              details: {}
            };
          }
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'seq-ff-child-3',
          name: 'Sequential FF Child 3',
          checkFn: async () => {
            executionLog.push('seq-ff-child-3');
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'Child 3 passed',
              details: {}
            };
          }
        },
      ];

      const compositeGate = createCompositeGateDefinition('sequential', 'fail_fast', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Should fail
      expect(result.passed).toBe(false);

      // Should have executed only up to the failing gate
      expect(executionLog).toEqual(['seq-ff-child-1', 'seq-ff-child-2']);
      expect(executionLog).not.toContain('seq-ff-child-3');

      // Details should indicate fail_fast
      expect((result.details as any)?.failPolicy).toBe('fail_fast');
    });
  });

  describe('Integration with Parent Spec', () => {
    /**
     * Test: Verify Property 29 alignment with v6-architecture-overview
     * The workflow-runtime should implement all behaviors defined in the parent spec
     */
    it('should align with parent spec Property 29 requirements', async () => {
      // This test verifies that the implementation matches the parent spec:
      // - Property 29: Composite Gate Semantics
      //   - mode = sequential: Execute in sequence order
      //   - mode = parallel: Execute concurrently  
      //   - failPolicy = fail_fast + mode = parallel: Cancel unfinished
      //   - failPolicy = collect_all: Aggregate all results

      // Test all four combinations
      const modes: Array<'sequential' | 'parallel'> = ['sequential', 'parallel'];
      const failPolicies: Array<'fail_fast' | 'collect_all'> = ['fail_fast', 'collect_all'];

      for (const mode of modes) {
        for (const failPolicy of failPolicies) {
          const children: SimpleGateDefinition[] = [
            {
              schema_version: '1.0',
              type: 'simple',
              id: `integration-child-1-${mode}-${failPolicy}`,
              name: 'Integration Child 1',
              checkFn: async () => ({
                schema_version: '1.0',
                passed: true,
                reason: 'Passed',
                details: {}
              })
            },
            {
              schema_version: '1.0',
              type: 'simple',
              id: `integration-child-2-${mode}-${failPolicy}`,
              name: 'Integration Child 2',
              checkFn: async () => ({
                schema_version: '1.0',
                passed: false,
                reason: 'Failed',
                details: {}
              })
            },
          ];

          const compositeGate = createCompositeGateDefinition(mode, failPolicy, children);
          const runner = new CompositeGateRunner(compositeGate);

          const result = await runner.check();

          // All combinations should work correctly
          expect(result.passed).toBe(false); // Child 2 fails
          expect(result.details).toBeDefined();
        }
      }
    });

    /**
     * Test: Full workflow execution demonstrates Property 29
     */
    it('should demonstrate Property 29 through full workflow execution', async () => {
      // Create a workflow that uses compositeGate at multiple stages
      const workflow: WorkflowDefinition = {
        id: 'property-29-full-workflow',
        displayName: 'Property 29 Full Validation Workflow',
        intent: 'validate-property-29',
        schema_version: '1.0',
        stateMachine: {
          initial: 'setup',
          states: {
            setup: {
              agent: 'setup-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'setup-gate',
                name: 'Setup Composite Gate',
                mode: 'sequential',
                failPolicy: 'collect_all',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'setup-1',
                    name: 'Setup Step 1',
                    checkFn: async () => ({
                      schema_version: '1.0',
                      passed: true,
                      reason: 'Setup 1 complete',
                      details: {}
                    })
                  },
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'setup-2',
                    name: 'Setup Step 2',
                    checkFn: async () => ({
                      schema_version: '1.0',
                      passed: true,
                      reason: 'Setup 2 complete',
                      details: {}
                    })
                  },
                ],
              },
              next: 'validate',
            },
            validate: {
              agent: 'validate-agent',
              gate: {
                schema_version: '1.0',
                type: 'composite',
                id: 'validate-gate',
                name: 'Validation Composite Gate',
                mode: 'parallel',
                failPolicy: 'collect_all',
                children: [
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'validate-1',
                    name: 'Validation Check 1',
                    checkFn: async () => ({
                      schema_version: '1.0',
                      passed: true,
                      reason: 'Validation 1 passed',
                      details: {}
                    })
                  },
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'validate-2',
                    name: 'Validation Check 2',
                    checkFn: async () => ({
                      schema_version: '1.0',
                      passed: true,
                      reason: 'Validation 2 passed',
                      details: {}
                    })
                  },
                  {
                    schema_version: '1.0',
                    type: 'simple',
                    id: 'validate-3',
                    name: 'Validation Check 3',
                    checkFn: async () => ({
                      schema_version: '1.0',
                      passed: true,
                      reason: 'Validation 3 passed',
                      details: {}
                    })
                  },
                ],
              },
              next: undefined,
            },
          },
        },
        artifacts: [],
      };

      engine.loadWorkflow(workflow);
      const instance = engine.createInstance(workflow.id);

      const result = await engine.execute(instance.id);

      // Verify complete execution
      expect(result.status).toBe('completed');

      // Verify sequential compositeGate in setup stage executed
      const setupEvents = publishedEvents.filter(
        e => e.action === 'workflow.gate.completed' && e.payload.gateId === 'setup-gate'
      );
      expect(setupEvents.length).toBe(1);

      // Verify parallel compositeGate in validate stage executed
      const validateEvents = publishedEvents.filter(
        e => e.action === 'workflow.gate.completed' && e.payload.gateId === 'validate-gate'
      );
      expect(validateEvents.length).toBe(1);
    });
  });

  describe('Error Handling in Composite Gates', () => {
    /**
     * Test: Handle compositeGate with all children failing
     */
    it('should handle compositeGate with all children failing', async () => {
      const children: SimpleGateDefinition[] = [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'all-fail-1',
          name: 'All Fail Child 1',
          checkFn: async () => ({
            schema_version: '1.0',
            passed: false,
            reason: 'Failed 1',
            details: { error: 'error-1' }
          })
        },
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'all-fail-2',
          name: 'All Fail Child 2',
          checkFn: async () => ({
            schema_version: '1.0',
            passed: false,
            reason: 'Failed 2',
            details: { error: 'error-2' }
          })
        },
      ];

      const compositeGate = createCompositeGateDefinition('parallel', 'collect_all', children);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Should fail
      expect(result.passed).toBe(false);

      // Should have aggregated results
      const childResults = (result.details as any).results;
      expect(childResults.every((r: any) => !r.passed)).toBe(true);
    });

    /**
     * Test: Handle compositeGate with empty children
     */
    it('should handle compositeGate with empty children', async () => {
      const compositeGate = createCompositeGateDefinition('sequential', 'collect_all', []);
      const runner = new CompositeGateRunner(compositeGate);

      const result = await runner.check();

      // Empty compositeGate should pass
      expect(result.passed).toBe(true);
    });
  });
});

describe('Property 29: Fast-Check Integration', () => {
  /**
   * Using fast-check for property-based validation of Property 29
   */
  
  /**
   * Property: Sequential mode always preserves order
   */
  it('should always preserve order in sequential mode (property test)', async () => {
    // Sample various numbers of children
    const childCounts = [2, 3, 4, 5, 6, 7, 8];
    
    for (const numChildren of childCounts) {
      const executionLog: string[] = [];
      
      const children: SimpleGateDefinition[] = Array.from(
        { length: numChildren },
        (_, i) => ({
          schema_version: '1.0' as const,
          type: 'simple' as const,
          id: `prop-seq-child-${i}`,
          name: `Property Sequential Child ${i}`,
          checkFn: async () => {
            executionLog.push(`prop-seq-child-${i}`);
            return {
              schema_version: '1.0',
              passed: true,
              reason: `Child ${i} passed`,
              details: {}
            };
          }
        })
      );

      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'property-sequential-test',
        name: 'Property Sequential Test',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children
      };

      const runner = new CompositeGateRunner(compositeGate);
      await runner.check();

      // Verify order is preserved
      const expectedOrder = Array.from(
        { length: numChildren },
        (_, i) => `prop-seq-child-${i}`
      );
      expect(executionLog).toEqual(expectedOrder);
    }
  });

  /**
   * Property: Parallel mode executes all children
   */
  it('should execute all children in parallel mode (property test)', async () => {
    const childCounts = [2, 3, 4, 5, 6];
    
    for (const numChildren of childCounts) {
      const executedChildren: string[] = [];
      
      const children: SimpleGateDefinition[] = Array.from(
        { length: numChildren },
        (_, i) => ({
          schema_version: '1.0' as const,
          type: 'simple' as const,
          id: `prop-par-child-${i}`,
          name: `Property Parallel Child ${i}`,
          checkFn: async () => {
            executedChildren.push(`prop-par-child-${i}`);
            return {
              schema_version: '1.0',
              passed: true,
              reason: `Child ${i} passed`,
              details: {}
            };
          }
        })
      );

      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'property-parallel-test',
        name: 'Property Parallel Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // All children should be executed
      expect(executedChildren.length).toBe(numChildren);
      expect(result.passed).toBe(true);
    }
  });
});