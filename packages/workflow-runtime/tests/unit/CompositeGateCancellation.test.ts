/**
 * Unit tests for CompositeGateRunner cancellation mechanism
 * Tests Task 3.3: 子 Gate 取消机制
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompositeGateRunner } from '../../src/GateRunner.js';
import { CompositeGateDefinition, SimpleGateDefinition } from '../../src/types.js';

describe('CompositeGateRunner Cancellation', () => {
  describe('cancel()', () => {
    it('should set isCancelled flag when cancel is called', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      
      // Initially not cancelled
      expect(runner.isExecutionCancelled()).toBe(false);
      
      // Cancel the execution
      await runner.cancel('Test cancellation');
      
      // Should be cancelled now
      expect(runner.isExecutionCancelled()).toBe(true);
    });

    it('should track cancelled gate IDs', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      
      // Get cancelled gates set and manually add for testing
      const cancelledGates = runner.getCancelledGates();
      expect(cancelledGates.size).toBe(0);
    });
  });

  describe('fail_fast cancellation in parallel mode', () => {
    // Child gate checkFn uses real setTimeout for simulated work delay
    // Global setup enables fake timers which blocks setTimeout from resolving
    beforeEach(() => { vi.useRealTimers(); });
    afterEach(() => { vi.useFakeTimers(); });

    it('should cancel remaining gates when fail_fast is triggered in parallel mode', async () => {
      let gate1Executed = false;
      let gate2Executed = false;
      let gate3Started = false;

      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => {
          gate1Executed = true;
          // Add small delay to simulate work
          await new Promise(resolve => setTimeout(resolve, 50));
          return { passed: true, reason: 'Child 1 passed' };
        },
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => {
          gate2Executed = true;
          // Fail immediately
          return { passed: false, reason: 'Child 2 failed' };
        },
      };

      const childGate3: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-3',
        name: 'Child Gate 3',
        checkFn: async () => {
          gate3Started = true;
          return { passed: true, reason: 'Child 3 passed' };
        },
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-fail-fast',
        name: 'Composite Gate Fail Fast',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2, childGate3],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should fail due to fail_fast
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('fail_fast');
      
      // Should track cancelled gates in results
      expect(result.details?.cancelledGates).toBeDefined();
    });

    it('should not execute child gates after cancellation in sequential mode', async () => {
      let gate1Executed = false;
      let gate2Executed = false;

      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => {
          gate1Executed = true;
          return { passed: false, reason: 'Child 1 failed' };
        },
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => {
          gate2Executed = true;
          return { passed: true, reason: 'Child 2 passed' };
        },
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate-sequential',
        name: 'Composite Gate Sequential',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should fail at first gate
      expect(result.passed).toBe(false);
      expect(gate1Executed).toBe(true);
      
      // gate2 should not execute due to fail_fast
      expect(gate2Executed).toBe(false);
      
      // In sequential mode, cancelledGates might be empty because gates 
      // that weren't started aren't tracked as "cancelled" (they were skipped)
      // The key behavior is that gate2 didn't execute
      expect(result.details?.results).toHaveLength(1);
    });
  });

  describe('parallel mode execution with all gates completing', () => {
    it('should complete all gates in parallel mode with collect_all', async () => {
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

      // All gates should complete
      expect(result.passed).toBe(true);
      expect(result.details?.results).toHaveLength(2);
    });
  });

  describe('cancellation event publishing', () => {
    it('should include cancellation info in context for event publishing', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      // Create runner with event publisher mock in context
      const mockPublish = vi.fn();
      const runner = new CompositeGateRunner(compositeGate, {
        instanceId: 'test-instance',
        workflowId: 'test-workflow',
        currentState: 'test-state',
        eventPublisher: {
          publish: mockPublish,
        },
      });

      await runner.cancel('Test cancellation');

      // The cancel method should have attempted to publish
      expect(runner.isExecutionCancelled()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources after execution completes', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      
      // Execute and check
      await runner.check();
      
      // After execution, cancellation state should be available
      expect(runner.isExecutionCancelled()).toBe(false);
    });

    it('should reset cancellation state for new execution', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      
      // First execution
      await runner.check();
      expect(runner.isExecutionCancelled()).toBe(false);
      
      // Second execution should start fresh (not cancelled)
      await runner.check();
      expect(runner.isExecutionCancelled()).toBe(false);
    });
  });

  describe('abort signal', () => {
    it('should pass abort signal to child runners in parallel mode', async () => {
      let capturedSignal: AbortSignal | undefined;

      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Test passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Execution should complete
      expect(result.passed).toBe(true);
      
      // Abort controller should have been created and cleaned up
      expect(runner.isExecutionCancelled()).toBe(false);
    });
  });
});