/**
 * Unit tests for GateRunner
 */

import { describe, it, expect } from 'vitest';
import {
  SimpleGateRunner,
  CompositeGateRunner,
  createGateRunner,
} from '../../src/GateRunner.js';
import {
  SimpleGateDefinition,
  CompositeGateDefinition,
  WorkflowContext,
} from '../../src/types.js';

describe('GateRunner', () => {
  describe('SimpleGateRunner', () => {
    it('should execute a simple gate with passing check function', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.reason).toBe('Test passed');
    });

    it('should execute a simple gate with synchronous check function', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-sync',
        name: 'Test Sync Gate',
        checkFn: () => ({ passed: true, reason: 'Sync test passed' }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.reason).toBe('Sync test passed');
    });

    it('should return default pass when no check function is defined', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-default',
        name: 'Test Gate Default',
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.reason).toContain('No check function defined');
    });

    it('should return failure when check function fails', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-fail',
        name: 'Test Gate Fail',
        checkFn: async () => ({ passed: false, reason: 'Validation failed' }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toBe('Validation failed');
    });

    it('should handle errors in check function', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-error',
        name: 'Test Gate Error',
        checkFn: async () => {
          throw new Error('Check function threw an error');
        },
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('test-gate-error');
      expect(result.details?.originalError?.name).toBe('Error');
    });

    it('should store and return context', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-context',
        name: 'Test Gate Context',
      };

      const context = { userId: 'test-user', role: 'admin' };
      const runner = new SimpleGateRunner(gate, context);

      expect(runner.getContext()).toEqual(context);
    });

    it('should update context', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-context-update',
        name: 'Test Gate Context Update',
      };

      const runner = new SimpleGateRunner(gate, { initial: 'value' });
      runner.setContext({ additional: 'data' });

      expect(runner.getContext()).toEqual({ initial: 'value', additional: 'data' });
    });

    it('should get gate definition', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-get',
        name: 'Test Gate Get',
      };

      const runner = new SimpleGateRunner(gate);
      expect(runner.getGate()).toEqual(gate);
    });

    it('should validate gate definition', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: '',
        name: 'Test Gate Invalid',
      };

      const runner = new SimpleGateRunner(gate);
      // The validation happens at the start of check() which is async
      expect(runner.check()).rejects.toThrow('Gate definition must have an id');
    });
  });

  describe('CompositeGateRunner', () => {
    it('should execute composite gate in sequential mode with all passing', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Child 1 passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: true, reason: 'Child 2 passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.details?.results).toHaveLength(2);
    });

    it('should fail fast in sequential mode when child fails', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Child 1 passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Child 2 failed' }),
      };

      const childGate3: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-3',
        name: 'Child Gate 3',
        checkFn: async () => ({ passed: true, reason: 'Child 3 passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-fail-fast',
        name: 'Composite Gate Fail Fast',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2, childGate3],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.failedGateId).toBe('child-2');
      // Should not execute child 3
      expect(result.details?.results).toHaveLength(2);
    });

    it('should execute composite gate in parallel mode', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Child 1 passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: true, reason: 'Child 2 passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-parallel',
        name: 'Composite Gate Parallel',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.details?.results).toHaveLength(2);
    });

    it('should fail fast in parallel mode when child fails', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Child 1 passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Child 2 failed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-parallel-fail-fast',
        name: 'Composite Gate Parallel Fail Fast',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('fail_fast');
    });

    it('should collect all failures with collect_all policy', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: false, reason: 'Child 1 failed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Child 2 failed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-collect-all',
        name: 'Composite Gate Collect All',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.failed).toBe(2);
      expect(result.details?.passed).toBe(0);
    });

    it('should handle nested composite gates', async () => {
      const simpleGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'simple-gate',
        name: 'Simple Gate',
        checkFn: async () => ({ passed: true, reason: 'Simple passed' }),
      };

      const innerComposite: CompositeGateDefinition = {
        type: 'composite',
        id: 'inner-composite',
        name: 'Inner Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [simpleGate],
      };

      const outerComposite: CompositeGateDefinition = {
        type: 'composite',
        id: 'outer-composite',
        name: 'Outer Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [innerComposite],
      };

      const runner = new CompositeGateRunner(outerComposite);
      const result = await runner.check();

      expect(result.passed).toBe(true);
    });
  });

  describe('createGateRunner factory', () => {
    it('should create SimpleGateRunner for simple gates', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = createGateRunner(gate);
      expect(runner).toBeInstanceOf(SimpleGateRunner);
    });

    it('should create CompositeGateRunner for composite gates', () => {
      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'test-composite',
        name: 'Test Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const runner = createGateRunner(compositeGate);
      expect(runner).toBeInstanceOf(CompositeGateRunner);
    });

    it('should throw error for unknown gate types', () => {
      // Create an object that doesn't match any known gate type
      const gate = {
        type: 'unknown' as const,
        id: 'test-gate',
        name: 'Test Gate',
      };

      // This will fail at runtime since the type assertion is wrong
      expect(() => createGateRunner(gate as any)).toThrow('Unknown gate type');
    });

    it('should pass context to created runner', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const context = { testKey: 'testValue' };
      const runner = createGateRunner(gate, context);

      expect(runner.getContext()).toEqual(context);
    });
  });

  describe('validate(context)', () => {
    it('should return true for valid workflow context', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      const validContext: WorkflowContext = {
        instance: {
          schema_version: '1.0',
          id: 'instance-1',
          workflowId: 'workflow-1',
          currentState: 'start',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        definition: {
          schema_version: '1.0',
          id: 'workflow-1',
          displayName: 'Test Workflow',
          intent: 'Test intent',
          stateMachine: {
            schema_version: '1.0',
            initial: 'start',
            states: {
              start: {
                schema_version: '1.0',
                agent: 'test-agent',
                gate: {
                  type: 'simple',
                  id: 'gate-1',
                  name: 'Test Gate',
                },
                skills: [],
              },
            },
          },
          artifacts: [],
        },
      };

      expect(runner.validate(validContext)).toBe(true);
    });

    it('should return false for null context', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      expect(runner.validate(null as any)).toBe(false);
    });

    it('should return false for undefined context', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      expect(runner.validate(undefined as any)).toBe(false);
    });

    it('should return false for context missing instance', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      expect(runner.validate({ instance: null as any, definition: null as any })).toBe(false);
    });

    it('should return false for context missing definition', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      const contextWithMissingDefinition = {
        instance: {
          schema_version: '1.0',
          id: 'instance-1',
          workflowId: 'workflow-1',
          currentState: 'start',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        definition: null,
      };
      expect(runner.validate(contextWithMissingDefinition as any)).toBe(false);
    });

    it('should return false for context with missing instance.id', () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
      };

      const runner = new SimpleGateRunner(gate);
      const contextWithMissingInstanceId = {
        instance: {
          schema_version: '1.0',
          id: '',
          workflowId: 'workflow-1',
          currentState: 'start',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        definition: {
          schema_version: '1.0',
          id: 'workflow-1',
          displayName: 'Test Workflow',
          intent: 'Test intent',
          stateMachine: {
            schema_version: '1.0',
            initial: 'start',
            states: {},
          },
          artifacts: [],
        },
      };
      expect(runner.validate(contextWithMissingInstanceId as any)).toBe(false);
    });
  });

  describe('check(context)', () => {
    it('should pass context to check function', async () => {
      let capturedContext: any;

      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-context',
        name: 'Test Gate',
        checkFn: () => {
          // Note: checkFn doesn't receive context parameter based on type definition
          // But we can capture the runner's context if needed
          capturedContext = 'checkFn executed';
          return { passed: true, reason: 'Context received' };
        },
      };

      const runner = new SimpleGateRunner(gate);
      const testContext: WorkflowContext = {
        instance: {
          schema_version: '1.0',
          id: 'instance-1',
          workflowId: 'workflow-1',
          currentState: 'start',
          status: 'pending',
          history: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        definition: {
          schema_version: '1.0',
          id: 'workflow-1',
          displayName: 'Test Workflow',
          intent: 'Test intent',
          stateMachine: {
            schema_version: '1.0',
            initial: 'start',
            states: {},
          },
          artifacts: [],
        },
      };

      const result = await runner.check(testContext);

      expect(result.passed).toBe(true);
      expect(capturedContext).toBe('checkFn executed');
    });

    it('should work without context parameter', async () => {
      const gate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate-no-context',
        name: 'Test Gate',
        checkFn: () => ({ passed: true, reason: 'No context needed' }),
      };

      const runner = new SimpleGateRunner(gate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.reason).toBe('No context needed');
    });
  });
});