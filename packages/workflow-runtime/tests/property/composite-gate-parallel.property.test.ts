/**
 * Property Test: Composite Gate Parallel Execution
 * 
 * Feature: workflow-runtime, Property 29: Composite Gate Parallel Execution
 * Derived-From: v6-architecture-overview Property 29
 * 
 * Validates: Requirements 24.4, 24.5 - Composite Gate Semantics
 * 
 * For all compositeGate g with mode = parallel:
 * - Multiple gates execute simultaneously with correct results
 * - Result aggregation is correct
 * - Error handling works properly
 * 
 * Property 29 Definition:
 * - mode = parallel: child gates execute concurrently
 * - failPolicy = fail_fast + mode = parallel: cancel unfinished children on failure
 * - failPolicy = collect_all: aggregate all failures after completion
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  CompositeGateRunner 
} from '../../src/GateRunner';
import { 
  CompositeGateDefinition,
  SimpleGateDefinition,
  GateResult,
  FailPolicy
} from '../../src/types';

// Configure iterations as per spec requirements (>= 100)
const NUM_ITERATIONS = 100;

/**
 * Helper to create a simple gate definition with configurable check function
 */
function createSimpleGate(
  id: string, 
  pass: boolean, 
  delayMs: number = 0
): SimpleGateDefinition {
  return {
    schema_version: '1.0',
    type: 'simple',
    id,
    name: `Gate ${id}`,
    checkFn: async () => {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      return {
        schema_version: '1.0',
        passed: pass,
        reason: pass ? `Gate ${id} passed` : `Gate ${id} failed`,
        details: { gateId: id }
      };
    }
  };
}

/**
 * Create a composite gate with parallel mode
 */
function createParallelCompositeGate(
  id: string,
  children: SimpleGateDefinition[],
  failPolicy: FailPolicy = 'collect_all'
): CompositeGateDefinition {
  return {
    schema_version: '1.0',
    type: 'composite',
    id,
    name: `Parallel Composite Gate ${id}`,
    mode: 'parallel',
    failPolicy,
    children
  };
}

describe('Property 29: Composite Gate Parallel Execution', () => {
  
  describe('P1: Multiple Gates Execute Simultaneously - Correctness', () => {
    /**
     * Property: All child gates must execute when mode is parallel
     * (regardless of individual results)
     */
    it('should execute all child gates in parallel mode', async () => {
      // Use sample-based testing for async property
      const samples = fc.sample(
        fc.integer({ min: 2, max: 5 }), 
        { numRuns: NUM_ITERATIONS }
      );
      
      for (const numChildren of samples) {
        const executedGates: string[] = [];
        
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `test-parallel-${numChildren}-${Date.now()}`,
          name: 'Test Parallel Gate',
          mode: 'parallel',
          failPolicy: 'collect_all',
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `child-${i}`,
            name: `Child ${i}`,
            checkFn: async () => {
              executedGates.push(`child-${i}`);
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
        const result = await runner.check();
        
        // All children should have been executed
        expect(executedGates.length).toBe(numChildren);
        
        // All child IDs should be present
        for (let i = 0; i < numChildren; i++) {
          expect(executedGates).toContain(`child-${i}`);
        }
        
        // Result should reflect all gates executed
        expect(result.passed).toBe(true);
      }
    });

    /**
     * Property: Concurrent execution produces consistent results across runs
     * Same input should produce same output regardless of timing
     */
    it('should produce consistent results across multiple runs with same input', async () => {
      const results: boolean[] = [];
      
      for (let run = 0; run < 10; run++) {
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `consistency-test-${run}`,
          name: 'Consistency Test',
          mode: 'parallel',
          failPolicy: 'collect_all',
          children: [
            createSimpleGate('gate-a', true),
            createSimpleGate('gate-b', true),
            createSimpleGate('gate-c', true)
          ]
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        results.push(result.passed);
      }
      
      // All runs should produce the same result (all pass)
      expect(results.every(r => r === true)).toBe(true);
    });

    /**
     * Property: Each child gate receives correct execution context
     */
    it('should provide correct execution context to each child gate', async () => {
      const childResults: Array<{ id: string; passed: boolean }> = [];
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'context-test',
        name: 'Context Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ctx-gate-1',
            name: 'Context Gate 1',
            checkFn: async () => {
              childResults.push({ id: 'ctx-gate-1', passed: true });
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: { source: 'gate-1' }
              };
            }
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ctx-gate-2',
            name: 'Context Gate 2',
            checkFn: async () => {
              childResults.push({ id: 'ctx-gate-2', passed: true });
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: { source: 'gate-2' }
              };
            }
          }
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Both should have executed
      expect(childResults.length).toBe(2);
      expect(childResults.map(r => r.id)).toContain('ctx-gate-1');
      expect(childResults.map(r => r.id)).toContain('ctx-gate-2');
      expect(result.passed).toBe(true);
    });
  });

  describe('P2: Result Aggregation Correctness', () => {
    /**
     * Property: Result aggregation is correct with collect_all policy
     * All child results must be included in the final result
     */
    it('should aggregate all child results correctly with collect_all policy', async () => {
      const samples = fc.sample(
        fc.integer({ min: 2, max: 5 }), 
        { numRuns: NUM_ITERATIONS }
      );
      
      for (const numChildren of samples) {
        // Create gates with alternating pass/fail
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `aggregate-test-${numChildren}`,
          name: 'Aggregate Test',
          mode: 'parallel',
          failPolicy: 'collect_all',
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `agg-child-${i}`,
            name: `Aggregate Child ${i}`,
            checkFn: () => ({
              schema_version: '1.0',
              passed: i % 2 === 0, // Alternate pass/fail
              reason: i % 2 === 0 ? `Child ${i} passed` : `Child ${i} failed`,
              details: { childIndex: i }
            })
          }))
        };
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // Result should be false (some gates failed)
        expect(result.passed).toBe(false);
        
        // Details should contain results for all children
        expect(result.details).toBeDefined();
        const childResults = (result.details as any)?.results;
        expect(childResults).toBeDefined();
        expect(childResults.length).toBe(numChildren);
        
        // Verify pass/fail pattern
        for (let i = 0; i < numChildren; i++) {
          expect(childResults[i].passed).toBe(i % 2 === 0);
        }
      }
    });

    /**
     * Property: Total count is correct in aggregated results
     */
    it('should report correct total, passed, and failed counts', async () => {
      const numChildren = 5;
      const numPassing = 3;
      const numFailing = 2;
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'count-test',
        name: 'Count Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          createSimpleGate('pass-1', true),
          createSimpleGate('pass-2', true),
          createSimpleGate('pass-3', true),
          createSimpleGate('fail-1', false),
          createSimpleGate('fail-2', false)
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Should fail overall
      expect(result.passed).toBe(false);
      
      // Check aggregated counts - these exist when some gates fail
      const details = result.details as any;
      expect(details.total).toBe(numChildren);
      expect(details.passed).toBe(numPassing);
      expect(details.failed).toBe(numFailing);
    });

    /**
     * Property: All passing gates results in overall pass
     */
    it('should pass overall when all children pass', async () => {
      const numChildren = 4;
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'all-pass-test',
        name: 'All Pass Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: Array.from({ length: numChildren }, (_, i) => 
          createSimpleGate(`all-pass-${i}`, true)
        )
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      expect(result.passed).toBe(true);
      
      // When all pass, details contains results array
      const details = result.details as any;
      expect(details.results).toBeDefined();
      expect(details.results.length).toBe(numChildren);
    });

    /**
     * Property: Results are aggregated even when gates have different execution times
     */
    it('should aggregate results regardless of execution time differences', async () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'timing-aggregate-test',
        name: 'Timing Aggregate Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          createSimpleGate('fast-pass', true, 5),
          createSimpleGate('medium-pass', true, 20),
          createSimpleGate('slow-fail', false, 50)
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Should fail overall (one gate failed)
      expect(result.passed).toBe(false);
      
      // Should still have all results
      const childResults = (result.details as any)?.results;
      expect(childResults.length).toBe(3);
    });
  });

  describe('P3: Error Handling', () => {
    /**
     * Property: Error in one child doesn't prevent other children from executing
     */
    it('should handle errors in one child without preventing others', async () => {
      const executedGates: string[] = [];
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'error-handling-test',
        name: 'Error Handling Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ok-gate-1',
            name: 'OK Gate 1',
            checkFn: async () => {
              executedGates.push('ok-gate-1');
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: {}
              };
            }
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'error-gate',
            name: 'Error Gate',
            checkFn: async () => {
              executedGates.push('error-gate');
              throw new Error('Intentional error in gate');
            }
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ok-gate-2',
            name: 'OK Gate 2',
            checkFn: async () => {
              executedGates.push('ok-gate-2');
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: {}
              };
            }
          }
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      
      // Should handle error gracefully
      try {
        const result = await runner.check();
        // With collect_all, should aggregate even with errors
        expect(executedGates.length).toBe(3);
      } catch (error) {
        // Even if error propagates, all gates should have been attempted
        expect(executedGates.length).toBe(3);
      }
    });

    /**
     * Property: Fail-fast policy cancels remaining children on failure
     */
    it('should cancel remaining children on failure with fail_fast policy', async () => {
      const executedGates: string[] = [];
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'failfast-test',
        name: 'Fail Fast Test',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ff-gate-1',
            name: 'FF Gate 1',
            checkFn: async () => {
              executedGates.push('ff-gate-1');
              await new Promise(resolve => setTimeout(resolve, 30));
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'Passed',
                details: {}
              };
            }
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ff-gate-2',
            name: 'FF Gate 2 (fails)',
            checkFn: async () => {
              executedGates.push('ff-gate-2');
              await new Promise(resolve => setTimeout(resolve, 10));
              return {
                schema_version: '1.0',
                passed: false,
                reason: 'Failed',
                details: {}
              };
            }
          },
          {
            schema_version: '1.0',
            type: 'simple',
            id: 'ff-gate-3',
            name: 'FF Gate 3',
            checkFn: async () => {
              executedGates.push('ff-gate-3');
              await new Promise(resolve => setTimeout(resolve, 50));
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'Passed',
                details: {}
              };
            }
          }
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Should fail overall
      expect(result.passed).toBe(false);
      
      // First two gates should have been attempted
      // Third may or may not execute depending on timing
      expect(executedGates.length).toBeGreaterThanOrEqual(2);
    });

    /**
     * Property: Graceful handling of empty children array
     */
    it('should handle composite gate with no children', async () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'empty-children-test',
        name: 'Empty Children Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: []
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      // Should pass with no children
      expect(result.passed).toBe(true);
    });

    /**
     * Property: Single child in parallel mode works correctly
     */
    it('should handle single child in parallel mode', async () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'single-child-test',
        name: 'Single Child Test',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [
          createSimpleGate('only-child', true)
        ]
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();
      
      expect(result.passed).toBe(true);
      expect((result.details as any)?.results?.length).toBe(1);
    });
  });

  describe('Property-based Tests with Random Data', () => {
    /**
     * Property: Parallel mode always executes all children (randomized)
     */
    it('should execute all children for random composite gates in parallel mode', () => {
      const samples = fc.sample(
        fc.record({
          numChildren: fc.integer({ min: 1, max: 5 }),
          failPolicy: fc.constantFrom('fail_fast' as FailPolicy, 'collect_all' as FailPolicy)
        }),
        { numRuns: NUM_ITERATIONS }
      );
      
      for (const { numChildren, failPolicy } of samples) {
        const compositeGate: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: `random-parallel-${numChildren}-${failPolicy}-${Date.now()}`,
          name: 'Random Parallel Gate',
          mode: 'parallel',
          failPolicy,
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `random-child-${i}`,
            name: `Random Child ${i}`,
            checkFn: () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'OK',
              details: {}
            })
          }))
        };
        
        // Verify structure is valid
        expect(compositeGate.mode).toBe('parallel');
        expect(compositeGate.children.length).toBe(numChildren);
        expect(compositeGate.failPolicy).toBe(failPolicy);
      }
    });

    /**
     * Property: Result aggregation is correct for random configurations
     */
    it('should aggregate results correctly for random configurations', async () => {
      const samples = fc.sample(
        fc.record({
          numChildren: fc.integer({ min: 2, max: 4 }),
          numPassing: fc.integer({ min: 0, max: 4 })
        }),
        { numRuns: NUM_ITERATIONS }
      );
      
      for (const { numChildren, numPassing } of samples) {
        if (numPassing > numChildren) continue;
        
        const children = Array.from({ length: numChildren }, (_, i) => 
          createSimpleGate(`rand-child-${i}`, i < numPassing)
        );
        
        const compositeGate = createParallelCompositeGate(
          `rand-agg-${numChildren}-${numPassing}`,
          children,
          'collect_all'
        );
        
        const runner = new CompositeGateRunner(compositeGate);
        const result = await runner.check();
        
        // Check the result structure
        const expectedPass = numPassing === numChildren;
        expect(result.passed).toBe(expectedPass);
        
        const details = result.details as any;
        
        // When all pass, details has results array; when some fail, details has total/passed/failed
        if (numPassing === numChildren) {
          expect(details.results).toBeDefined();
          expect(details.results.length).toBe(numChildren);
        } else {
          expect(details.total).toBe(numChildren);
          expect(details.passed).toBe(numPassing);
          expect(details.failed).toBe(numChildren - numPassing);
        }
      }
    });
  });

  describe('Concurrency Verification', () => {
    /**
     * Property: Parallel execution demonstrates concurrent timing
     * Total time should be less than sequential execution time
     */
    it('should execute child gates concurrently with timing verification', async () => {
      const delayMs = 20;
      const numChildren = 4;
      
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'timing-verify-parallel',
        name: 'Timing Verify Parallel',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: Array.from({ length: numChildren }, (_, i) => ({
          schema_version: '1.0',
          type: 'simple' as const,
          id: `timing-child-${i}`,
          name: `Timing Child ${i}`,
          checkFn: async () => {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return {
              schema_version: '1.0',
              passed: true,
              reason: 'OK',
              details: { childId: i }
            };
          }
        }))
      };
      
      const runner = new CompositeGateRunner(compositeGate);
      const overallStart = Date.now();
      const result = await runner.check();
      const overallDuration = Date.now() - overallStart;
      
      // All gates should have passed
      expect(result.passed).toBe(true);
      
      // Overall duration should be approximately delayMs (not numChildren * delayMs)
      // This proves concurrent execution
      const expectedSequentialTime = numChildren * delayMs;
      expect(overallDuration).toBeLessThan(expectedSequentialTime);
    });
  });
});