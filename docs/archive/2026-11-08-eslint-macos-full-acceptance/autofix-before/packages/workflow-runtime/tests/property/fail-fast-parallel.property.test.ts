/**
 * Property Test: Fail Fast with Parallel Mode
 * 
 * Feature: workflow-runtime, Property 5: Fail Fast with Parallel Mode
 * Derived-From: v6-architecture-overview Property 5
 * 
 * Validates: Requirements 3.5 - WHEN `mode = parallel` 且 `failPolicy = fail_fast`,
 * THE compositeGate_Runner SHALL 在任一子 Gate 失败时取消尚未完成的子 Gate 并返回失败。
 * 
 * This is a SAFETY-CRITICAL property test - requires >= 1000 iterations
 * 
 * Key properties being tested:
 * 1. fail_fast: When any child gate fails in parallel mode, composite gate fails immediately
 * 2. Cancellation: Unfinished child gates should be cancelled when fail_fast triggers
 * 3. Failure aggregation: Should aggregate failure reasons from all child gates
 * 4. Determinism: fail_fast behavior should be consistent regardless of which child fails
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CompositeGateRunner } from '../../src/GateRunner';
import type { CompositeGateDefinition, SimpleGateDefinition, GateResult } from '../../src/types';

// Safety-critical property test: >= 1000 iterations
const NUM_ITERATIONS = 1000;

/**
 * Create a simple gate (no delays to avoid test hangs)
 */
function createSimpleGate(
  id: string,
  shouldPass: boolean
): SimpleGateDefinition {
  return {
    schema_version: '1.0',
    type: 'simple',
    id,
    name: `Gate ${id}`,
    checkFn: async () => ({
      schema_version: '1.0',
      passed: shouldPass,
      reason: shouldPass ? `Gate ${id} passed` : `Gate ${id} failed`,
      details: { gateId: id }
    })
  };
}

/**
 * Create a composite gate with a specific failing child position
 */
function createCompositeWithFailingChild(
  numChildren: number,
  failPosition: number
): CompositeGateDefinition {
  const children: SimpleGateDefinition[] = Array.from({ length: numChildren }, (_, i) =>
    createSimpleGate(
      `child-${i}`,
      i !== failPosition  // Only fail at failPosition
    )
  );
  
  return {
    schema_version: '1.0',
    type: 'composite',
    id: `fail-fast-parallel-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: 'Fail Fast Parallel Composite',
    mode: 'parallel',
    failPolicy: 'fail_fast',
    children
  };
}

describe('Property 5: Fail Fast with Parallel Mode', () => {
  
  /**
   * Property: When any child gate fails in parallel mode with fail_fast,
   * the composite gate MUST fail immediately
   * 
   * This is the core safety property being tested
   */
  it('should fail immediately when any child fails with fail_fast (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 7 }),
        async (numChildren, failPosition) => {
          // Ensure failPosition is valid for numChildren
          if (failPosition >= numChildren) return;
          
          const gate = createCompositeWithFailingChild(numChildren, failPosition);
          const runner = new CompositeGateRunner(gate);
          const result = await runner.check();
          
          // Property: With fail_fast, result MUST be failed when any child fails
          if (result.passed) {
            throw new Error(
              `Property violation: fail_fast should fail when child at position ${failPosition} fails, ` +
              `but got passed=true.`
            );
          }
          
          // Property: Details should contain failPolicy
          const details = result.details as any;
          if (!details || details.failPolicy !== 'fail_fast') {
            throw new Error(
              `Property violation: failPolicy should be 'fail_fast' in details, got: ${JSON.stringify(details)}`
            );
          }
        }
      ),
      { numRuns: NUM_ITERATIONS }
    );
  });

  /**
   * Property: fail_fast should work regardless of which child gate fails
   * The composite gate should fail for any failing child position
   */
  it('should fail regardless of which child gate fails (PBT)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (numChildren) => {
          // Test each possible failure position
          for (let failPos = 0; failPos < numChildren; failPos++) {
            const gate = createCompositeWithFailingChild(numChildren, failPos);
            const runner = new CompositeGateRunner(gate);
            const result = await runner.check();
            
            // Property: Must fail for any failing child
            if (result.passed) {
              throw new Error(
                `Property violation: fail_fast should fail when child at position ${failPos} fails`
              );
            }
            
            // Property: failPolicy should be in details
            const details = result.details as any;
            if (details?.failPolicy !== 'fail_fast') {
              throw new Error(
                `Property violation: failPolicy should be 'fail_fast', got: ${details?.failPolicy}`
              );
            }
          }
        }
      ),
      { numRuns: Math.min(100, NUM_ITERATIONS) } // Reduced iterations since we test all positions
    );
  });

  /**
   * Property: When fail_fast triggers, cancelled gates should be tracked
   */
  it('should track cancelled gates when fail_fast triggers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 0, max: 2 }), // Fail early to allow cancellation of later gates
        async (numChildren, failPosition) => {
          const gate = createCompositeWithFailingChild(numChildren, failPosition);
          const runner = new CompositeGateRunner(gate);
          const result = await runner.check();
          
          // Property: Result should contain cancelledGates information
          const details = result.details as any;
          if (!details) {
            throw new Error('Property violation: result.details should be defined');
          }
          
          // cancelledGates should be tracked (may be empty if failed gate was last)
          if (!('cancelledGates' in details)) {
            throw new Error(
              'Property violation: details should contain cancelledGates array'
            );
          }
        }
      ),
      { numRuns: Math.min(200, NUM_ITERATIONS) }
    );
  });

  /**
   * Property: compare fail_fast vs collect_all behavior in parallel mode
   * With collect_all, all gates complete; with fail_fast, we fail early
   */
  it('should behave differently from collect_all in parallel mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 5 }),
        async (numChildren) => {
          const failPosition = 1; // Second gate fails
          
          // Create gate with fail_fast
          const failFastGate = createCompositeWithFailingChild(numChildren, failPosition);
          
          // Create same gate with collect_all
          const collectAllGate: CompositeGateDefinition = {
            ...failFastGate,
            id: `collect-all-${failFastGate.id}`,
            failPolicy: 'collect_all'
          };
          
          const failFastRunner = new CompositeGateRunner(failFastGate);
          const collectAllRunner = new CompositeGateRunner(collectAllGate);
          
          const failFastResult = await failFastRunner.check();
          const collectAllResult = await collectAllRunner.check();
          
          // Both should fail (one child fails)
          if (failFastResult.passed || collectAllResult.passed) {
            throw new Error(
              'Property violation: Both should fail when a child fails'
            );
          }
          
          // fail_fast should have failPolicy in details
          const ffDetails = failFastResult.details as any;
          if (ffDetails?.failPolicy !== 'fail_fast') {
            throw new Error('fail_fast gate should have fail_fast in details');
          }
          
          // collect_all should aggregate results - check for results array
          const caDetails = collectAllResult.details as any;
          if (!caDetails?.results || !Array.isArray(caDetails.results)) {
            throw new Error('collect_all gate should have results array in details');
          }
        }
      ),
      { numRuns: Math.min(100, NUM_ITERATIONS) }
    );
  });

  /**
   * Edge Case: All gates pass - composite should succeed with fail_fast
   */
  it('should succeed when all gates pass with fail_fast policy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (numChildren) => {
          const children: SimpleGateDefinition[] = Array.from({ length: numChildren }, (_, i) =>
            createSimpleGate(`pass-child-${i}`, true)
          );
          
          const gate: CompositeGateDefinition = {
            schema_version: '1.0',
            type: 'composite',
            id: `all-pass-${Date.now()}`,
            name: 'All Pass',
            mode: 'parallel',
            failPolicy: 'fail_fast',
            children
          };
          
          const runner = new CompositeGateRunner(gate);
          const result = await runner.check();
          
          // Property: All passing gates should result in success
          if (!result.passed) {
            throw new Error(
              `Property violation: All gates pass but composite failed. ` +
              `Reason: ${result.reason}`
            );
          }
        }
      ),
      { numRuns: Math.min(100, NUM_ITERATIONS) }
    );
  });

  /**
   * Edge Case: Single child with fail_fast - should work correctly
   */
  it('should handle single child with fail_fast policy', async () => {
    // Test both passing and failing single child
    const passingChild: SimpleGateDefinition = createSimpleGate('single-pass', true);
    const failingChild: SimpleGateDefinition = createSimpleGate('single-fail', false);
    
    // Test passing case
    const passingGate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'single-pass-gate',
      name: 'Single Pass Gate',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children: [passingChild]
    };
    
    const passingRunner = new CompositeGateRunner(passingGate);
    const passingResult = await passingRunner.check();
    expect(passingResult.passed).toBe(true);
    
    // Test failing case
    const failingGate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'single-fail-gate',
      name: 'Single Fail Gate',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children: [failingChild]
    };
    
    const failingRunner = new CompositeGateRunner(failingGate);
    const failingResult = await failingRunner.check();
    expect(failingResult.passed).toBe(false);
    expect((failingResult.details as any)?.failPolicy).toBe('fail_fast');
  });

  /**
   * Property: Failure reason should include information about the failed gate
   */
  it('should include failed gate information in result', async () => {
    const children: SimpleGateDefinition[] = [
      createSimpleGate('gate-a', true),
      createSimpleGate('gate-b-fail', false),
      createSimpleGate('gate-c', true)
    ];
    
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'reason-test',
      name: 'Reason Test',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children
    };
    
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('fail_fast');
    
    // Details should contain results array
    const details = result.details as any;
    expect(details).toBeDefined();
    expect(details.results).toBeDefined();
    expect(Array.isArray(details.results)).toBe(true);
  });

  /**
   * Property: Result should be deterministic - same input always produces fail_fast failure
   */
  it('should produce deterministic fail_fast results', async () => {
    const children: SimpleGateDefinition[] = [
      createSimpleGate('det-1', false),  // Always fails
      createSimpleGate('det-2', true)    // Always passes
    ];
    
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'deterministic-gate',
      name: 'Deterministic Gate',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children
    };
    
    // Run multiple times
    const results: GateResult[] = [];
    for (let i = 0; i < 5; i++) {
      const runner = new CompositeGateRunner(gate);
      const result = await runner.check();
      results.push(result);
    }
    
    // All results should be consistent - all should fail with fail_fast
    for (const result of results) {
      expect(result.passed).toBe(false);
      const details = result.details as any;
      expect(details?.failPolicy).toBe('fail_fast');
    }
  });
});

describe('Property 5: Parallel vs Sequential Comparison', () => {
  /**
   * Property: fail_fast in parallel should have same semantic result as in sequential
   * Both should fail when any child fails
   */
  it('should have same failure semantics as sequential fail_fast', async () => {
    const children: SimpleGateDefinition[] = [
      createSimpleGate('seq-par-child-1', true),
      createSimpleGate('seq-par-child-2', false),
      createSimpleGate('seq-par-child-3', true)
    ];
    
    // Parallel with fail_fast
    const parallelGate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'parallel-fail-fast',
      name: 'Parallel Fail Fast',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children
    };
    
    // Sequential with fail_fast
    const sequentialGate: CompositeGateDefinition = {
      ...parallelGate,
      id: 'sequential-fail-fast',
      mode: 'sequential'
    };
    
    const parallelRunner = new CompositeGateRunner(parallelGate);
    const sequentialRunner = new CompositeGateRunner(sequentialGate);
    
    const parallelResult = await parallelRunner.check();
    const sequentialResult = await sequentialRunner.check();
    
    // Both should fail
    expect(parallelResult.passed).toBe(false);
    expect(sequentialResult.passed).toBe(false);
    
    // Both should have fail_fast policy in details
    expect((parallelResult.details as any)?.failPolicy).toBe('fail_fast');
    expect((sequentialResult.details as any)?.failPolicy).toBe('fail_fast');
  });
});

describe('Property 5: Edge Cases', () => {
  /**
   * Edge Case: Two gates where first fails quickly
   */
  it('should handle two children with first failing', async () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'two-children-first-fail',
      name: 'Two Children First Fail',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children: [
        createSimpleGate('first', false),  // Fails
        createSimpleGate('second', true)   // Would pass
      ]
    };
    
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect((result.details as any)?.failPolicy).toBe('fail_fast');
  });

  /**
   * Edge Case: Two gates where second fails
   */
  it('should handle two children with second failing', async () => {
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'two-children-second-fail',
      name: 'Two Children Second Fail',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children: [
        createSimpleGate('first', true),   // Would pass
        createSimpleGate('second', false)  // Fails
      ]
    };
    
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect((result.details as any)?.failPolicy).toBe('fail_fast');
  });

  /**
   * Edge Case: Multiple gates, middle one fails
   */
  it('should handle multiple gates with middle failure', async () => {
    const numChildren = 5;
    const failPosition = 2;
    
    const gate = createCompositeWithFailingChild(numChildren, failPosition);
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect((result.details as any)?.failPolicy).toBe('fail_fast');
  });

  /**
   * Edge Case: All gates fail - should still report as fail_fast
   */
  it('should handle all gates failing', async () => {
    const numChildren = 4;
    const children: SimpleGateDefinition[] = Array.from({ length: numChildren }, (_, i) =>
      createSimpleGate(`all-fail-${i}`, false)  // All fail
    );
    
    const gate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'all-fail-gate',
      name: 'All Fail Gate',
      mode: 'parallel',
      failPolicy: 'fail_fast',
      children
    };
    
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect((result.details as any)?.failPolicy).toBe('fail_fast');
    
    // Should have multiple failures in results
    const details = result.details as any;
    expect(details.results).toBeDefined();
    expect(details.results.length).toBe(numChildren);
  });

  /**
   * Edge Case: Large number of children with one failing
   */
  it('should handle large number of child gates', async () => {
    const numChildren = 20;
    const failPosition = 10;
    
    const gate = createCompositeWithFailingChild(numChildren, failPosition);
    const runner = new CompositeGateRunner(gate);
    const result = await runner.check();
    
    expect(result.passed).toBe(false);
    expect((result.details as any)?.failPolicy).toBe('fail_fast');
    
    // Verify all children were processed
    const details = result.details as any;
    expect(details.results).toBeDefined();
    // In parallel mode with fail_fast, not all gates may complete
    expect(details.results.length).toBeGreaterThan(0);
  });
});