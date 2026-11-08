/**
 * Unit tests for GateDefinition interface
 * 
 * Validates: Requirements 2.1 (Gate execution engine)
 */

import { describe, it, expect } from 'vitest';
import {
  GateDefinition,
  SimpleGateDefinition,
  CompositeGateDefinition,
  GateResult,
  CompositeGateMode,
  FailPolicy,
} from '../../src/types.js';

describe('GateDefinition Interface', () => {
  describe('SimpleGateDefinition', () => {
    it('should have required fields', () => {
      const gate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'test-gate-1',
        name: 'Test Gate',
      };

      expect(gate.schema_version).toBe('1.0');
      expect(gate.type).toBe('simple');
      expect(gate.id).toBe('test-gate-1');
      expect(gate.name).toBe('Test Gate');
    });

    it('should be assignable to GateDefinition', () => {
      const simpleGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'simple-gate-1',
        name: 'Simple Gate',
      };

      const gate: GateDefinition = simpleGate;
      expect(gate.type).toBe('simple');
      expect(gate.id).toBe('simple-gate-1');
    });

    it('should support optional checkFn field', () => {
      const gateWithCheckFn: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'gate-with-check',
        name: 'Gate with Check Function',
        checkFn: async () => ({
          schema_version: '1.0',
          passed: true,
          reason: 'Test passed',
        }),
      };

      expect(gateWithCheckFn.checkFn).toBeDefined();
    });

    it('should support synchronous checkFn', () => {
      const gateWithSyncCheck: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'gate-sync-check',
        name: 'Gate with Sync Check',
        checkFn: () => ({
          schema_version: '1.0',
          passed: true,
          reason: 'Sync test passed',
        }),
      };

      expect(gateWithSyncCheck.checkFn).toBeDefined();
    });

    it('should validate schema_version field', () => {
      const gate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'valid-gate',
        name: 'Valid Gate',
      };

      expect(gate.schema_version).toBe('1.0');
    });
  });

  describe('CompositeGateDefinition', () => {
    it('should have required fields', () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'composite-gate-1',
        name: 'Composite Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      expect(compositeGate.schema_version).toBe('1.0');
      expect(compositeGate.type).toBe('composite');
      expect(compositeGate.id).toBe('composite-gate-1');
      expect(compositeGate.name).toBe('Composite Gate');
      expect(compositeGate.mode).toBe('sequential');
      expect(compositeGate.failPolicy).toBe('collect_all');
      expect(compositeGate.children).toEqual([]);
    });

    it('should be assignable to GateDefinition', () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'composite-gate-2',
        name: 'Composite Gate 2',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [],
      };

      const gate: GateDefinition = compositeGate;
      expect(gate.type).toBe('composite');
      expect(gate.id).toBe('composite-gate-2');
    });

    it('should support all CompositeGateMode values', () => {
      const sequentialGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'sequential-gate',
        name: 'Sequential Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const parallelGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'parallel-gate',
        name: 'Parallel Gate',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [],
      };

      expect(sequentialGate.mode).toBe('sequential');
      expect(parallelGate.mode).toBe('parallel');
    });

    it('should support all FailPolicy values', () => {
      const failFastGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'fail-fast-gate',
        name: 'Fail Fast Gate',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [],
      };

      const collectAllGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'collect-all-gate',
        name: 'Collect All Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      expect(failFastGate.failPolicy).toBe('fail_fast');
      expect(collectAllGate.failPolicy).toBe('collect_all');
    });

    it('should support nested children', () => {
      const childGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'child-gate',
        name: 'Child Gate',
      };

      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'parent-gate',
        name: 'Parent Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [childGate],
      };

      expect(compositeGate.children).toHaveLength(1);
      expect(compositeGate.children[0].type).toBe('simple');
      expect(compositeGate.children[0].id).toBe('child-gate');
    });

    it('should support deeply nested composite gates', () => {
      const innerComposite: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'inner-composite',
        name: 'Inner Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const outerComposite: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'outer-composite',
        name: 'Outer Composite',
        mode: 'parallel',
        failPolicy: 'fail_fast',
        children: [innerComposite],
      };

      expect(outerComposite.children).toHaveLength(1);
      expect(outerComposite.children[0].type).toBe('composite');
      expect(outerComposite.children[0].id).toBe('inner-composite');
    });
  });

  describe('GateDefinition Union Type', () => {
    it('should accept SimpleGateDefinition', () => {
      const simpleGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'simple-union',
        name: 'Simple Union Gate',
      };

      const gate: GateDefinition = simpleGate;
      expect(gate.type).toBe('simple');
    });

    it('should accept CompositeGateDefinition', () => {
      const compositeGate: CompositeGateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'composite-union',
        name: 'Composite Union Gate',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      const gate: GateDefinition = compositeGate;
      expect(gate.type).toBe('composite');
    });

    it('should be used in workflow state definitions', () => {
      const simpleGate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'workflow-gate',
        name: 'Workflow Gate',
      };

      const workflowState = {
        schema_version: '1.0',
        agent: 'test-agent',
        gate: simpleGate as GateDefinition,
        skills: ['skill-1', 'skill-2'],
      };

      expect(workflowState.gate.type).toBe('simple');
      expect(workflowState.gate.id).toBe('workflow-gate');
    });

    it('should support type narrowing with type guards', () => {
      const simpleGate: GateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'type-guard-simple',
        name: 'Type Guard Simple',
      };

      const compositeGate: GateDefinition = {
        schema_version: '1.0',
        type: 'composite',
        id: 'type-guard-composite',
        name: 'Type Guard Composite',
        mode: 'sequential',
        failPolicy: 'collect_all',
        children: [],
      };

      if (simpleGate.type === 'simple') {
        expect(simpleGate.id).toBe('type-guard-simple');
      }

      if (compositeGate.type === 'composite') {
        expect(compositeGate.mode).toBe('sequential');
        expect(compositeGate.failPolicy).toBe('collect_all');
      }
    });
  });

  describe('Integration with GateResult', () => {
    it('should produce GateResult from checkFn', async () => {
      const gate: SimpleGateDefinition = {
        schema_version: '1.0',
        type: 'simple',
        id: 'result-gate',
        name: 'Result Gate',
        checkFn: async () => ({
          schema_version: '1.0',
          passed: true,
          reason: 'Integration test passed',
          details: { test: 'value' },
        }),
      };

      if (gate.checkFn) {
        const result: GateResult = await gate.checkFn();
        expect(result.schema_version).toBe('1.0');
        expect(result.passed).toBe(true);
        expect(result.reason).toBe('Integration test passed');
        expect(result.details?.test).toBe('value');
      }
    });

    it('should validate GateResult schema_version', () => {
      const result: GateResult = {
        schema_version: '1.0',
        passed: false,
        reason: 'Test failed',
      };

      expect(result.schema_version).toBe('1.0');
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('Test failed');
    });
  });
});