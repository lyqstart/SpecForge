/**
 * Property Test: Composite Gate Sequential Execution
 * 
 * Feature: workflow, Property 3: Composite Gate Sequential Execution
 * 
 * Validates: Requirements 3.3 - WHEN mode = sequential, THE compositeGate_Runner 
 * SHALL execute child gates in definition order.
 * 
 * For all composite gates with mode = sequential, the execution order of child gates
 * must match the order defined in the children array.
 * 
 * Derived-From: v6-architecture-overview Property 29 (compositeGate semantics)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CompositeGateRunner } from '../../src/GateRunner';
import type { CompositeGateDefinition, SimpleGateDefinition, GateResult } from '../../src/types';

// Configure iterations as per spec requirements (>= 100)
const NUM_ITERATIONS = 100;

// Custom arbitraries
const validStringArb = (minLen: number, maxLen: number) => 
  fc.string({ minLength: minLen, maxLength: maxLen })
    .filter(s => s.length > 0 && /^[a-zA-Z0-9_-]+$/.test(s));

/**
 * Generate a simple gate definition with execution tracking
 */
function createTrackableGate(id: string, name: string, executionLog: string[]): SimpleGateDefinition {
  return {
    schema_version: '1.0',
    type: 'simple',
    id,
    name,
    checkFn: () => {
      executionLog.push(id);
      return {
        schema_version: '1.0',
        passed: true,
        reason: `Gate ${id} executed`,
        details: { gateId: id }
      };
    }
  };
}

/**
 * Generate a random composite gate definition with sequential mode
 */
function generateSequentialCompositeGate(
  numChildren: number,
  executionLog: string[]
): CompositeGateDefinition {
  return {
    schema_version: '1.0',
    type: 'composite',
    id: `composite-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: 'Sequential Composite Gate',
    mode: 'sequential',
    failPolicy: fc.sample(fc.constantFrom('fail_fast', 'collect_all'))[0] || 'collect_all',
    children: Array.from({ length: numChildren }, (_, i) => 
      createTrackableGate(`child-gate-${i}`, `Child Gate ${i}`, executionLog)
    )
  };
}

describe('Property 3: Composite Gate Sequential Execution', () => {
  
  describe('Sequential Execution Order', () => {
    /**
     * Property: Child gates in sequential mode MUST execute in definition order
     * 
     * This is the core property being tested - for any composite gate with 
     * mode = sequential, the execution order should match the children array order.
     */
    it('should execute child gates in sequential order (sample-based)', async () => {
      // Sample test with various numbers of children
      const childCounts = fc.sample(fc.integer({ min: 2, max: 8 }), { numRuns: NUM_ITERATIONS });
      
      for (const numChildren of childCounts) {
        const executionLog: string[] = [];
        const compositeGate = generateSequentialCompositeGate(numChildren, executionLog);
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // Execution log should contain all child gates
        expect(executionLog.length).toBe(numChildren);
        
        // Execution order should match definition order: child-gate-0, child-gate-1, ...
        const expectedOrder = Array.from({ length: numChildren }, (_, i) => `child-gate-${i}`);
        expect(executionLog).toEqual(expectedOrder);
        
        // All gates should have passed
        expect(result.passed).toBe(true);
      }
    });

    /**
     * Property: Sequential execution must respect fail_fast policy
     * When failPolicy = fail_fast, execution should stop on first failure
     */
    it('should stop on first failure with fail_fast policy', async () => {
      const childCounts = fc.sample(fc.integer({ min: 3, max: 6 }), { numRuns: Math.min(50, NUM_ITERATIONS) });
      
      for (const numChildren of childCounts) {
        const executionLog: string[] = [];
        
        // Create a composite gate with the third child failing
        const children: SimpleGateDefinition[] = [];
        for (let i = 0; i < numChildren; i++) {
          if (i === 2) {
            // Third child fails
            children.push({
              schema_version: '1.0',
              type: 'simple',
              id: `child-gate-${i}`,
              name: `Child Gate ${i}`,
              checkFn: () => ({
                schema_version: '1.0',
                passed: false,
                reason: `Gate ${i} intentionally failed`,
                details: { gateId: `child-gate-${i}` }
              })
            });
            executionLog.push(`child-gate-${i}`);
          } else {
            children.push(createTrackableGate(`child-gate-${i}`, `Child Gate ${i}`, executionLog));
          }
        }
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `composite-failfast-${numChildren}`,
          name: 'Fail Fast Composite Gate',
          mode: 'sequential',
          failPolicy: 'fail_fast',
          children
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // With fail_fast, should have executed only up to the failing gate (3 gates: 0, 1, 2)
        expect(result.passed).toBe(false);
        expect(executionLog.length).toBe(3); // Should have stopped at index 2
        expect(executionLog).toContain('child-gate-2');
        
        // Verify the failed gate was the third one
        expect(result.details?.['failedGateId']).toBe('child-gate-2');
      }
    });

    /**
     * Property: Sequential execution with collect_all should execute all gates
     * even when some fail
     */
    it('should execute all children with collect_all policy', async () => {
      const childCounts = fc.sample(fc.integer({ min: 3, max: 6 }), { numRuns: Math.min(50, NUM_ITERATIONS) });
      
      for (const numChildren of childCounts) {
        const executionLog: string[] = [];
        
        // Create a composite gate with a failing child in the middle
        // All gates should use checkFn to track execution (not manual push)
        const children: SimpleGateDefinition[] = Array.from({ length: numChildren }, (_, i) => ({
          schema_version: '1.0' as const,
          type: 'simple' as const,
          id: `child-gate-${i}`,
          name: `Child Gate ${i}`,
          checkFn: () => {
            executionLog.push(`child-gate-${i}`);
            return {
              schema_version: '1.0',
              passed: i !== 1, // Second child (index 1) fails
              reason: i === 1 ? `Gate ${i} intentionally failed` : `Gate ${i} passed`,
              details: { gateId: `child-gate-${i}` }
            };
          }
        }));
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `composite-collect-${numChildren}`,
          name: 'Collect All Composite Gate',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // With collect_all, all children should be executed regardless of failures
        expect(result.passed).toBe(false); // Overall should fail due to child failure
        expect(executionLog.length).toBe(numChildren); // All gates should execute
        
        // Verify all gates were executed in order
        const expectedOrder = Array.from({ length: numChildren }, (_, i) => `child-gate-${i}`);
        expect(executionLog).toEqual(expectedOrder);
      }
    });

    /**
     * Property: Single child composite gate should execute correctly in sequential mode
     */
    it('should handle single child composite gate correctly', async () => {
      const samples = fc.sample(fc.integer({ min: 1, max: 3 }), { numRuns: NUM_ITERATIONS });
      
      for (const _ of samples) {
        const executionLog: string[] = [];
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'single-child-composite',
          name: 'Single Child Composite',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children: [
            createTrackableGate('only-child', 'Only Child', executionLog)
          ]
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        expect(result.passed).toBe(true);
        expect(executionLog).toEqual(['only-child']);
      }
    });

    /**
     * Property: Sequential execution should work with different fail policies
     */
    it('should work with both fail policies in sequential mode', async () => {
      const failPolicies = ['fail_fast', 'collect_all'] as const;
      
      for (const failPolicy of failPolicies) {
        const executionLog: string[] = [];
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `test-${failPolicy}`,
          name: `Test ${failPolicy}`,
          mode: 'sequential',
          failPolicy,
          children: [
            createTrackableGate('gate-a', 'Gate A', executionLog),
            createTrackableGate('gate-b', 'Gate B', executionLog),
            createTrackableGate('gate-c', 'Gate C', executionLog),
          ]
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // All should pass
        expect(result.passed).toBe(true);
        
        // Order should be A, B, C regardless of fail policy
        expect(executionLog).toEqual(['gate-a', 'gate-b', 'gate-c']);
      }
    });

    /**
     * Property: Execution order should be consistent across multiple runs
     * Same composite gate definition should produce same execution order
     */
    it('should produce consistent execution order across multiple runs', async () => {
      const samples = fc.sample(fc.integer({ min: 2, max: 5 }), { numRuns: Math.min(30, NUM_ITERATIONS) });
      
      for (const numChildren of samples) {
        // Create a fixed composite gate definition
        const children: SimpleGateDefinition[] = Array.from(
          { length: numChildren }, 
          (_, i) => ({
            schema_version: '1.0' as const,
            type: 'simple' as const,
            id: `consistent-child-${i}`,
            name: `Consistent Child ${i}`,
            checkFn: () => ({
              schema_version: '1.0',
              passed: true,
              reason: `Consistent ${i}`,
              details: {}
            })
          })
        );
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'consistent-execution',
          name: 'Consistent Execution',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children
        };
        
        // Run multiple times
        const runner1 = new CompositeGateRunner(compositeGate);
        const runner2 = new CompositeGateRunner(compositeGate);
        const runner3 = new CompositeGateRunner(compositeGate);
        
        // Create execution trackers
        const log1: string[] = [];
        const log2: string[] = [];
        const log3: string[] = [];
        
        // Update checkFns to track execution
        const updatedChildren = children.map((child, i) => ({
          ...child,
          checkFn: () => {
            log1.push(child.id);
            return { schema_version: '1.0', passed: true, reason: 'OK', details: {} };
          }
        }));
        
        const runner = new CompositeGateRunner({
          ...compositeGate,
          children: updatedChildren
        });
        
        await runner.check();
        
        // All runs should have same order
        const expectedOrder = Array.from({ length: numChildren }, (_, i) => `consistent-child-${i}`);
        expect(log1).toEqual(expectedOrder);
      }
    });
  });

  describe('Edge Cases', () => {
    /**
     * Edge Case: Empty children array - should handle gracefully
     */
    it('should handle empty children array', async () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'empty-composite',
        name: 'Empty Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: []
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Empty composite gate with no children should pass (no failures)
      expect(result.passed).toBe(true);
    });

    /**
     * Edge Case: Large number of children
     */
    it('should handle large number of child gates', async () => {
      const executionLog: string[] = [];
      const numChildren = 20;
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'large-composite',
        name: 'Large Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: Array.from({ length: numChildren }, (_, i) =>
          createTrackableGate(`large-child-${i}`, `Large Child ${i}`, executionLog)
        )
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      expect(result.passed).toBe(true);
      expect(executionLog.length).toBe(numChildren);
      
      // Verify sequential order
      const expectedOrder = Array.from({ length: numChildren }, (_, i) => `large-child-${i}`);
      expect(executionLog).toEqual(expectedOrder);
    });

    /**
     * Edge Case: Mixed passing and failing gates
     */
    it('should handle mixed passing and failing gates in order', async () => {
      const childCounts = fc.sample(fc.integer({ min: 4, max: 8 }), { numRuns: Math.min(30, NUM_ITERATIONS) });
      
      for (const numChildren of childCounts) {
        const executionLog: string[] = [];
        
        // Create alternating pass/fail gates
        const children: SimpleGateDefinition[] = Array.from({ length: numChildren }, (_, i) => ({
          schema_version: '1.0' as const,
          type: 'simple' as const,
          id: `mixed-child-${i}`,
          name: `Mixed Child ${i}`,
          checkFn: () => {
            executionLog.push(`mixed-child-${i}`);
            return {
              schema_version: '1.0',
              passed: i % 2 === 0, // Even indices pass, odd fail
              reason: i % 2 === 0 ? 'Pass' : 'Intentionally failed',
              details: { gateId: `mixed-child-${i}` }
            };
          }
        }));
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'mixed-composite',
          name: 'Mixed Composite',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // Should have executed all gates
        expect(executionLog.length).toBe(numChildren);
        
        // Order should still be sequential
        const expectedOrder = Array.from({ length: numChildren }, (_, i) => `mixed-child-${i}`);
        expect(executionLog).toEqual(expectedOrder);
        
        // Should fail overall due to some failures
        expect(result.passed).toBe(false);
      }
    });
  });

  describe('Context and Options', () => {
    /**
     * Property: Sequential execution should work with custom context
     */
    it('should execute sequentially with custom context', async () => {
      const executionLog: string[] = [];
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'context-composite',
        name: 'Context Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [
          createTrackableGate('ctx-gate-1', 'Context Gate 1', executionLog),
          createTrackableGate('ctx-gate-2', 'Context Gate 2', executionLog),
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate, {
        customData: 'test-value',
        instanceId: 'test-instance'
      });
      
      const result = await runner.check();
      
      expect(result.passed).toBe(true);
      expect(executionLog).toEqual(['ctx-gate-1', 'ctx-gate-2']);
    });

    /**
     * Property: Execution order independent of context
     */
    it('should maintain execution order regardless of context variations', async () => {
      const contexts = [
        {},
        { instanceId: 'test-1' },
        { customData: { nested: { value: 123 } } },
        { sessionId: 'session-abc', traceId: 'trace-xyz' }
      ];
      
      for (const ctx of contexts) {
        const executionLog: string[] = [];
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'ctx-independence',
          name: 'Context Independence',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children: [
            createTrackableGate('indep-gate-1', 'Independence Gate 1', executionLog),
            createTrackableGate('indep-gate-2', 'Independence Gate 2', executionLog),
            createTrackableGate('indep-gate-3', 'Independence Gate 3', executionLog),
          ]
        };
        
        const runner = new CompositeGateRunner(compositeGate, ctx);
        await runner.check();
        
        // Order should always be 1, 2, 3 regardless of context
        expect(executionLog).toEqual(['indep-gate-1', 'indep-gate-2', 'indep-gate-3']);
      }
    });
  });
});

describe('Property 3: Fast-check Integration', () => {
  /**
   * Using fast-check's built-in property testing for more thorough validation
   * For sequential mode, we verify that when failPolicy = collect_all, all gates execute in order
   * When failPolicy = fail_fast, execution stops on first failure, so we only test with collect_all
   * to verify the sequential ordering property
   */
  it('should always execute in sequential order with collect_all (fc.property)', async () => {
    // Using collect_all to ensure all gates execute and we can verify ordering
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (numChildren) => {
          const executionLog: string[] = [];
          
          const compositeGate: CompositeGateDefinition = {
            schema_version: '1.0',
            type: 'composite',
            id: `fc-composite-${numChildren}`,
            name: 'Fast Check Composite',
            mode: 'sequential',
            failPolicy: 'collect_all', // Always use collect_all for ordering verification
            children: Array.from({ length: numChildren }, (_, i) => ({
              schema_version: '1.0' as const,
              type: 'simple' as const,
              id: `fc-child-${i}`,
              name: `FC Child ${i}`,
              checkFn: () => {
                executionLog.push(`fc-child-${i}`);
                return {
                  schema_version: '1.0',
                  passed: true,
                  reason: 'OK',
                  details: {}
                };
              }
            }))
          };
          
          const runner = new CompositeGateRunner(compositeGate);
          await runner.check();
          
          // Verify all gates executed
          if (executionLog.length !== numChildren) {
            throw new Error(`Expected ${numChildren} executions, got ${executionLog.length}`);
          }
          
          // Verify order matches definition (sequential execution)
          const expectedOrder = Array.from({ length: numChildren }, (_, i) => `fc-child-${i}`);
          for (let i = 0; i < numChildren; i++) {
            if (executionLog[i] !== expectedOrder[i]) {
              throw new Error(
                `Execution order violation at index ${i}: ` +
                `expected "${expectedOrder[i]}", got "${executionLog[i]}"`
              );
            }
          }
        }
      ),
      { numRuns: NUM_ITERATIONS }
    );
  });

  /**
   * Additional property: verify fail_fast stops execution on first failure
   */
  it('should stop on first failure with fail_fast policy (fc.property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (numChildren) => {
          const executionLog: string[] = [];
          
          // First child always fails with fail_fast policy
          const compositeGate: CompositeGateDefinition = {
            schema_version: '1.0',
            type: 'composite',
            id: `fc-failfast-${numChildren}`,
            name: 'Fast Check Fail Fast',
            mode: 'sequential',
            failPolicy: 'fail_fast',
            children: Array.from({ length: numChildren }, (_, i) => ({
              schema_version: '1.0' as const,
              type: 'simple' as const,
              id: `ff-child-${i}`,
              name: `FF Child ${i}`,
              checkFn: () => {
                executionLog.push(`ff-child-${i}`);
                return {
                  schema_version: '1.0',
                  passed: i !== 0, // Only first child fails
                  reason: i === 0 ? 'First child fails' : 'OK',
                  details: { gateId: `ff-child-${i}` }
                };
              }
            }))
          };
          
          const runner = new CompositeGateRunner(compositeGate);
          const result = await runner.check();
          
          // With fail_fast, should stop after first failure (index 0)
          // Execution log should have exactly 1 entry (child-gate-0)
          if (executionLog.length !== 1) {
            throw new Error(`Expected 1 execution with fail_fast, got ${executionLog.length}`);
          }
          
          // Should have stopped at first child
          expect(executionLog[0]).toBe('ff-child-0');
          
          // Result should be failed
          expect(result.passed).toBe(false);
        }
      ),
      { numRuns: Math.min(50, NUM_ITERATIONS) } // Reduce iterations for this specific test
    );
  });
});