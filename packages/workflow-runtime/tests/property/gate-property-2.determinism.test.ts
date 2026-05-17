/**
 * Property Test: Gate Execution Determinism
 * 
 * Feature: workflow, Property 2: Gate Execution Determinism
 * 
 * Validates: Requirements 2.2 - THE Gate_Runner SHALL implement check() method 
 * and return GateResult.
 * 
 * For a given Gate definition and context, the check() method should always 
 * return the same GateResult (deterministic execution).
 * 
 * Derived-From: v6-architecture-overview Property 2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  SimpleGateRunner, 
  CompositeGateRunner,
  createGateRunner 
} from '../../src/GateRunner';
import { 
  SimpleGateDefinition, 
  CompositeGateDefinition,
  GateResult
} from '../../src/types';

// Configure iterations as per spec requirements (>= 100)
const NUM_ITERATIONS = 100;

// Custom arbitraries - filter out strings with special characters that might cause issues
const validStringArb = (minLen: number, maxLen: number) => 
  fc.string({ minLength: minLen, maxLength: maxLen })
    .filter(s => s.length > 0 && /^[a-zA-Z0-9_-]+$/.test(s));

const simpleGateArb = fc.record({
  schema_version: fc.constant("1.0"),
  type: fc.constant('simple' as const),
  id: validStringArb(1, 20),
  name: validStringArb(1, 50)
});

describe('Property 2: Gate Execution Determinism', () => {
  
  describe('Simple Gate Determinism', () => {
    /**
     * Property: Same simple gate with same check function should return same result
     * across multiple executions
     */
    it('should produce consistent results for simple gates with deterministic check functions', async () => {
      let passCount = 0;
      
      const gateDef: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'det-gate-1',
        name: 'Deterministic Gate 1',
        checkFn: () => {
          passCount++;
          return {
            schema_version: '1.0',
            passed: true,
            reason: 'Deterministic pass',
            details: { deterministic: true }
          };
        }
      };
      
      const runner = new SimpleGateRunner(gateDef);
      
      // Execute multiple times
      const results: GateResult[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await runner.check();
        results.push(result);
      }
      
      // All results should be identical
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i].passed).toBe(firstResult.passed);
        expect(results[i].reason).toBe(firstResult.reason);
      }
      
      // checkFn was called 5 times
      expect(passCount).toBe(5);
    });

    /**
     * Property: Simple gates without check functions should consistently return pass
     */
    it('should consistently return pass for simple gates without check functions', async () => {
      // Use sample-based testing to avoid async property issues
      const samples = fc.sample(simpleGateArb, { numRuns: NUM_ITERATIONS });
      
      for (const gateDef of samples) {
        const runner = new SimpleGateRunner(gateDef);
        
        // Execute multiple times
        const results: GateResult[] = [];
        for (let i = 0; i < 5; i++) {
          const result = await runner.check();
          results.push(result);
        }
        
        // All results should be pass (default behavior)
        for (const result of results) {
          expect(result.passed).toBe(true);
        }
      }
    });

    /**
     * Property: Same gate definition should produce identical results regardless of 
     * execution order when executed in isolation
     */
    it('should produce identical results regardless of execution order', async () => {
      // Use sample-based testing
      const samples = fc.sample(simpleGateArb, { numRuns: NUM_ITERATIONS });
      
      for (const gateDef of samples) {
        const runner1 = new SimpleGateRunner(gateDef, { executionId: 1 });
        const runner2 = new SimpleGateRunner(gateDef, { executionId: 2 });
        const runner3 = new SimpleGateRunner(gateDef, { executionId: 3 });
        
        const result1 = await runner1.check();
        const result2 = await runner2.check();
        const result3 = await runner3.check();
        
        // All should have same pass/fail status
        expect(result1.passed).toBe(result2.passed);
        expect(result2.passed).toBe(result3.passed);
      }
    });
  });

  describe('Composite Gate Determinism', () => {
    /**
     * Property: Same composite gate should produce same aggregated results
     */
    it('should produce consistent results for composite gates', async () => {
      // Use sample-based testing
      const samples = fc.sample(fc.integer({ min: 2, max: 5 }), { numRuns: NUM_ITERATIONS });
      
      for (const numChildren of samples) {
        const compositeGateDef: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'composite-det',
          name: 'Composite Deterministic',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `child-${i}`,
            name: `Child ${i}`,
            checkFn: () => ({
              schema_version: '1.0',
              passed: true,
              reason: 'OK',
              details: { childId: i }
            })
          }))
        };
        
        const runner = new CompositeGateRunner(compositeGateDef);
        
        // Execute multiple times
        const results: GateResult[] = [];
        for (let i = 0; i < 3; i++) {
          const result = await runner.check();
          results.push(result);
        }
        
        // All results should have same pass/fail status
        const firstResult = results[0];
        for (let i = 1; i < results.length; i++) {
          expect(results[i].passed).toBe(firstResult.passed);
        }
      }
    });

    /**
     * Property: Sequential composite gates should execute in deterministic order
     */
    it('should execute sequential composite gates in deterministic order', async () => {
      // Use sample-based testing
      const samples = fc.sample(fc.integer({ min: 2, max: 5 }), { numRuns: NUM_ITERATIONS });
      
      for (const numChildren of samples) {
        const executionOrder: string[] = [];
        
        const compositeGateDef: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'sequential-test-gate',
          name: 'Sequential Test Gate',
          mode: 'sequential',
          failPolicy: 'collect_all',
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `child-gate-${i}`,
            name: `Child Gate ${i}`,
            checkFn: () => {
              executionOrder.push(`child-gate-${i}`);
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: {}
              };
            }
          }))
        };
        
        const runner = new CompositeGateRunner(compositeGateDef);
        
        // Execute and verify order
        await runner.check();
        
        // Order should be sequential: 0, 1, 2, ...
        const expectedOrder = Array.from({ length: numChildren }, (_, i) => `child-gate-${i}`);
        expect(executionOrder).toEqual(expectedOrder);
      }
    });

    /**
     * Property: Parallel composite gates should complete all children regardless of 
     * completion order
     */
    it('should complete all children in parallel mode', async () => {
      // Use sample-based testing
      const samples = fc.sample(fc.integer({ min: 2, max: 5 }), { numRuns: NUM_ITERATIONS });
      
      for (const numChildren of samples) {
        const completedChildren: string[] = [];
        
        const compositeGateDef: CompositeGateDefinition = {
          schema_version: '1.0',
          type: 'composite',
          id: 'parallel-test-gate',
          name: 'Parallel Test Gate',
          mode: 'parallel',
          failPolicy: 'collect_all',
          children: Array.from({ length: numChildren }, (_, i) => ({
            schema_version: '1.0',
            type: 'simple' as const,
            id: `parallel-child-${i}`,
            name: `Parallel Child ${i}`,
            checkFn: () => {
              completedChildren.push(`parallel-child-${i}`);
              return {
                schema_version: '1.0',
                passed: true,
                reason: 'OK',
                details: {}
              };
            }
          }))
        };
        
        const runner = new CompositeGateRunner(compositeGateDef);
        const result = await runner.check();
        
        // All children should have been executed
        expect(completedChildren.length).toBe(numChildren);
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('Gate Factory Determinism', () => {
    /**
     * Property: createGateRunner should create appropriate runner type consistently
     */
    it('should create consistent runner types for the same gate definition', async () => {
      // Use sample-based testing
      const samples = fc.sample(simpleGateArb, { numRuns: NUM_ITERATIONS });
      
      for (const gateDef of samples) {
        // Create multiple runners from same definition
        const runner1 = createGateRunner(gateDef);
        const runner2 = createGateRunner(gateDef);
        
        // Both should be of same type
        expect(runner1.constructor.name).toBe(runner2.constructor.name);
        
        // Both should handle same gate ID
        expect(runner1.getGate().id).toBe(runner2.getGate().id);
      }
    });
  });

  describe('Context Independence', () => {
    /**
     * Property: Gate execution should not be affected by unrelated context changes
     */
    it('should produce same results regardless of unrelated context variations', async () => {
      // Use sample-based testing
      const samples = fc.sample(simpleGateArb, { numRuns: NUM_ITERATIONS });
      
      for (const gateDef of samples) {
        const gateWithCheck: SimpleGateDefinition = {
          ...gateDef,
          checkFn: () => ({
            schema_version: '1.0',
            passed: true,
            reason: 'Context independent',
            details: {}
          })
        };
        
        // Execute with various context values
        const runner1 = new SimpleGateRunner(gateWithCheck, { extra: 'value1' });
        const runner2 = new SimpleGateRunner(gateWithCheck, { extra: 'value2' });
        const runner3 = new SimpleGateRunner(gateWithCheck, { unrelated: 123 });
        
        const result1 = await runner1.check();
        const result2 = await runner2.check();
        const result3 = await runner3.check();
        
        // All should produce same result
        expect(result1.passed).toBe(true);
        expect(result2.passed).toBe(true);
        expect(result3.passed).toBe(true);
      }
    });
  });

  describe('Error Handling Determinism', () => {
    /**
     * Property: Same error condition should produce consistent error results
     */
    it('should produce consistent error results for the same error condition', async () => {
      // Use sample-based testing
      const samples = fc.sample(simpleGateArb, { numRuns: NUM_ITERATIONS });
      
      for (const gateDef of samples) {
        const errorMessage = 'Deterministic error';
        
        const gateWithErrorCheck: SimpleGateDefinition = {
          ...gateDef,
          checkFn: () => {
            throw new Error(errorMessage);
          }
        };
        
        const runner = new SimpleGateRunner(gateWithErrorCheck);
        
        // Execute multiple times - all should fail with same reason
        const results: GateResult[] = [];
        for (let i = 0; i < 3; i++) {
          const result = await runner.check();
          results.push(result);
        }
        
        // All should be failed
        for (const result of results) {
          expect(result.passed).toBe(false);
        }
        
        // All should have error in reason
        for (const result of results) {
          expect(result.reason).toContain(errorMessage);
        }
      }
    });
  });
});

describe('Property 2: Edge Cases', () => {
  /**
   * Edge Case: Single child composite gate
   */
  it('should handle single child composite gate deterministically', async () => {
    const singleChildGate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'single-child-gate',
      name: 'Single Child Gate',
      mode: 'sequential',
      failPolicy: 'collect_all',
      children: [
        {
          schema_version: '1.0',
          type: 'simple',
          id: 'only-child',
          name: 'Only Child',
          checkFn: () => ({
            schema_version: '1.0',
            passed: true,
            reason: 'Single child passed',
            details: {}
          })
        }
      ]
    };
    
    const runner = new CompositeGateRunner(singleChildGate);
    const result1 = await runner.check();
    const result2 = await runner.check();
    
    expect(result1.passed).toBe(result2.passed);
    expect(result1.passed).toBe(true);
  });

  /**
   * Edge Case: Gate with undefined context
   */
  it('should handle undefined context deterministically', async () => {
    const gateDef: SimpleGateDefinition = {
      schema_version: '1.0',
      type: 'simple',
      id: 'context-test-gate',
      name: 'Context Test Gate'
    };
    
    const runner = new SimpleGateRunner(gateDef);
    
    // Execute with undefined context
    const result1 = await runner.check(undefined);
    const result2 = await runner.check(undefined);
    
    // Both should produce same result (default pass)
    expect(result1.passed).toBe(true);
    expect(result2.passed).toBe(true);
  });

  /**
   * Edge Case: Large number of child gates
   */
  it('should handle large number of child gates deterministically', async () => {
    const largeCompositeGate: CompositeGateDefinition = {
      schema_version: '1.0',
      type: 'composite',
      id: 'large-gate',
      name: 'Large Gate',
      mode: 'parallel',
      failPolicy: 'collect_all',
      children: Array.from({ length: 10 }, (_, i) => ({
        schema_version: '1.0',
        type: 'simple' as const,
        id: `child-${i}`,
        name: `Child ${i}`,
        checkFn: () => ({
          schema_version: '1.0',
          passed: true,
          reason: 'OK',
          details: { index: i }
        })
      }))
    };
    
    const runner = new CompositeGateRunner(largeCompositeGate);
    const result1 = await runner.check();
    const result2 = await runner.check();
    
    expect(result1.passed).toBe(result2.passed);
    expect(result1.passed).toBe(true);
  });
});