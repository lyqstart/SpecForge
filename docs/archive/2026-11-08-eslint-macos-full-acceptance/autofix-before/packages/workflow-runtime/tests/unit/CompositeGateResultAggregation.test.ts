/**
 * Unit tests for CompositeGateRunner result aggregation
 * Tests Task 3.4: 结果汇总
 * - 子 Gate 结果收集
 * - 失败原因汇总
 * - compositeGate 结果生成
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompositeGateRunner } from '../../src/GateRunner.js';
import { CompositeGateDefinition, SimpleGateDefinition } from '../../src/types.js';

describe('CompositeGateRunner Result Aggregation', () => {
  describe('子 Gate 结果收集', () => {
    it('should collect results from all child gates in sequential mode', async () => {
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

      const childGate3: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-3',
        name: 'Child Gate 3',
        checkFn: async () => ({ passed: true, reason: 'Child 3 passed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2, childGate3],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should collect results from all 3 child gates
      expect(result.passed).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details?.results).toHaveLength(3);
      
      // Verify each child result is present
      const results = result.details?.results as Array<{ passed: boolean; reason: string }>;
      expect(results[0].passed).toBe(true);
      expect(results[0].reason).toBe('Child 1 passed');
      expect(results[1].passed).toBe(true);
      expect(results[1].reason).toBe('Child 2 passed');
      expect(results[2].passed).toBe(true);
      expect(results[2].reason).toBe('Child 3 passed');
    });

    it('should collect results from all child gates in parallel mode', async () => {
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
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should collect results from all child gates
      expect(result.details?.results).toHaveLength(2);
      expect(result.passed).toBe(true);
    });

    it('should preserve detailed results in sequential mode with failures', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Passed', details: { score: 80 } }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ 
          passed: false, 
          reason: 'Validation failed',
          details: { errorCode: 'VAL_001', field: 'email' }
        }),
      };

      const childGate3: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-3',
        name: 'Child Gate 3',
        checkFn: async () => ({ passed: true, reason: 'Passed', details: { score: 90 } }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate1, childGate2, childGate3],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should aggregate results even with failure
      expect(result.passed).toBe(false);
      expect(result.details?.results).toHaveLength(3);
      
      // First should pass
      expect((result.details?.results as Array<{ passed: boolean }>)[0].passed).toBe(true);
      
      // Second should fail with details
      const failedResult = (result.details?.results as Array<{ passed: boolean; details?: Record<string, unknown> }>)[1];
      expect(failedResult.passed).toBe(false);
      expect(failedResult.details?.errorCode).toBe('VAL_001');
      expect(failedResult.details?.field).toBe('email');
      
      // Third result should be present (with collect_all policy)
      expect((result.details?.results as Array<{ passed: boolean }>)[2].passed).toBe(true);
    });
  });

  describe('失败原因汇总', () => {
    it('should aggregate failure reasons in collect_all mode', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: false, reason: 'Missing required field: name' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Invalid format: email' }),
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

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('2 of 2 child gates failed');
      expect(result.details?.failed).toBe(2);
      expect(result.details?.total).toBe(2);
      expect(result.details?.passed).toBe(0);
    });

    it('should include failed gate IDs in result details when explicitly set', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'validate-schema',
        name: 'Validate Schema',
        checkFn: async () => ({ 
          passed: false, 
          reason: 'Schema validation failed',
          details: { gateId: 'validate-schema' } // Explicitly include gateId in details
        }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'check-security',
        name: 'Check Security',
        checkFn: async () => ({ passed: true, reason: 'Security check passed' }),
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
      const result = await runner.check();

      // Verify failed gate is identified in results when explicitly included
      const results = result.details?.results as Array<{ passed: boolean; details?: { gateId?: string } }>;
      const failedResult = results.find(r => !r.passed);
      expect(failedResult).toBeDefined();
      expect(failedResult?.details?.gateId).toBe('validate-schema');
    });

    it('should include fail_fast info in sequential result when gate fails', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Failed' }),
      };

      const childGate3: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-3',
        name: 'Child Gate 3',
        checkFn: async () => ({ passed: true, reason: 'Would pass but cancelled' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2, childGate3],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      expect(result.details?.failPolicy).toBe('fail_fast');
      
      // In fail_fast, the failed gate ID should be recorded
      expect(result.details?.failedGateId).toBe('child-2');
    });

    it('should summarize errors with detailed failure context', async () => {
      const failingGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'complex-validation',
        name: 'Complex Validation',
        checkFn: async () => ({ 
          passed: false, 
          reason: 'Validation failed: multiple errors',
          details: {
            errors: [
              { field: 'username', message: 'Too short' },
              { field: 'email', message: 'Invalid format' },
              { field: 'password', message: 'Weak password' }
            ]
          }
        }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [failingGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(false);
      const results = result.details?.results as Array<{ 
        passed: boolean; 
        details?: { errors?: Array<{ field: string; message: string }> } 
      }>;
      const errorResult = results[0];
      expect(errorResult.details?.errors).toHaveLength(3);
      expect(errorResult.details?.errors?.[0].field).toBe('username');
    });
  });

  describe('compositeGate 结果生成', () => {
    it('should generate correct result structure for all-pass case', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate',
        checkFn: async () => ({ passed: true, reason: 'All good' }),
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

      // Verify result structure
      expect(result.schema_version).toBe('1.0');
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('All child gates passed');
      expect(result.details).toBeDefined();
      expect(result.details?.results).toBeDefined();
    });

    it('should generate correct result structure for partial-fail case', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: true, reason: 'Passed' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Failed' }),
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
      const result = await runner.check();

      // Verify result structure for partial failure
      expect(result.schema_version).toBe('1.0');
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('1 of 2 child gates failed');
      expect(result.details?.total).toBe(2);
      expect(result.details?.passed).toBe(1);
      expect(result.details?.failed).toBe(1);
    });

    it('should generate correct result structure for all-fail case', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: false, reason: 'Failed 1' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: false, reason: 'Failed 2' }),
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
      const result = await runner.check();

      // Verify result structure for all failures
      expect(result.passed).toBe(false);
      expect(result.details?.total).toBe(2);
      expect(result.details?.passed).toBe(0);
      expect(result.details?.failed).toBe(2);
    });

    it('should include failPolicy in result details', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate',
        checkFn: async () => ({ passed: false, reason: 'Failed' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // failPolicy should be included in result details
      expect(result.details?.failPolicy).toBe('fail_fast');
    });

    it('should include failedGateId in sequential fail_fast result', async () => {
      const childGate1: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate 1',
        checkFn: async () => ({ passed: false, reason: 'Failed at first gate' }),
      };

      const childGate2: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-2',
        name: 'Child Gate 2',
        checkFn: async () => ({ passed: true, reason: 'Would pass' }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'fail_fast',
        children: [childGate1, childGate2],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Should identify the failed gate ID
      expect(result.details?.failedGateId).toBe('child-1');
    });

    it('should generate result with gate ID in parallel mode when explicitly included', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'test-gate',
        name: 'Test Gate',
        checkFn: async () => ({ 
          passed: false, 
          reason: 'Test failure',
          details: { gateId: 'test-gate' } // Explicitly include gateId
        }),
      };

      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'main-composite',
        name: 'Main Composite',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      // Each child result should have gateId in details when explicitly set
      const results = result.details?.results as Array<{ details?: { gateId?: string } }>;
      expect(results[0].details?.gateId).toBe('test-gate');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty children array', async () => {
      const compositeGate: CompositeGateDefinition = {
        type: 'composite',
        id: 'composite-gate',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const runner = new CompositeGateRunner(compositeGate);
      const result = await runner.check();

      expect(result.passed).toBe(true);
      expect(result.details?.results).toHaveLength(0);
    });

    it('should handle nested composite gates', async () => {
      const innerChild1: SimpleGateDefinition = {
        type: 'simple',
        id: 'inner-1',
        name: 'Inner Child 1',
        checkFn: async () => ({ passed: true, reason: 'Inner passed' }),
      };

      const innerChild2: SimpleGateDefinition = {
        type: 'simple',
        id: 'inner-2',
        name: 'Inner Child 2',
        checkFn: async () => ({ passed: false, reason: 'Inner failed' }),
      };

      const innerComposite: CompositeGateDefinition = {
        type: 'composite',
        id: 'inner-composite',
        name: 'Inner Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [innerChild1, innerChild2],
      };

      const outerChild: SimpleGateDefinition = {
        type: 'simple',
        id: 'outer-child',
        name: 'Outer Child',
        checkFn: async () => ({ passed: true, reason: 'Outer passed' }),
      };

      const outerComposite: CompositeGateDefinition = {
        type: 'composite',
        id: 'outer-composite',
        name: 'Outer Composite',
        mode: 'parallel',
        failPolicy: 'collect_all',
        children: [innerComposite, outerChild],
      };

      const runner = new CompositeGateRunner(outerComposite);
      const result = await runner.check();

      // Should aggregate results from nested composite
      expect(result.passed).toBe(false); // inner failed
      expect(result.details?.results).toHaveLength(2);
      
      // First result is from inner composite (which failed)
      const innerResult = (result.details?.results as Array<{ passed: boolean }>)[0];
      expect(innerResult.passed).toBe(false);
      
      // Second result is from outer child (which passed)
      const outerResult = (result.details?.results as Array<{ passed: boolean }>)[1];
      expect(outerResult.passed).toBe(true);
    });

    it('should preserve original result details in aggregation', async () => {
      const childGate: SimpleGateDefinition = {
        type: 'simple',
        id: 'child-1',
        name: 'Child Gate',
        checkFn: async () => ({ 
          passed: true, 
          reason: 'Validation complete',
          details: {
            validatedFields: ['name', 'email', 'age'],
            duration: 150,
            timestamp: '2024-01-15T10:30:00Z'
          }
        }),
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
      const result = await runner.check();

      // Original details should be preserved
      const childResult = (result.details?.results as Array<{ details?: Record<string, unknown> }>)[0];
      expect(childResult.details?.validatedFields).toEqual(['name', 'email', 'age']);
      expect(childResult.details?.duration).toBe(150);
      expect(childResult.details?.timestamp).toBe('2024-01-15T10:30:00Z');
    });
  });
});