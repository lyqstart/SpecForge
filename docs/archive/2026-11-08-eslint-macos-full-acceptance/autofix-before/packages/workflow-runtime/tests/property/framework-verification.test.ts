/**
 * Property Test Framework Verification
 * Tests that the property test framework is correctly configured
 */

import { describe, it, expect } from 'vitest';
import { 
  sampleFrom, 
  simpleGateDefinitionArb, 
  compositeGateDefinitionArb,
  workflowDefinitionArb,
  gateResultArb,
  createMockGateResult,
  createSimpleGate,
  createCompositeGate,
  countGates,
  getAllGateIds,
  validateWorkflowDefinition,
  validateCompositeGate,
  isValidGate,
  getLeafGates,
  DEFAULT_PROPERTY_CONFIG,
  SAFETY_CRITICAL_CONFIG
} from './index';

describe('Property Test Framework - Generators', () => {
  
  it('should generate valid simple gate definitions', () => {
    const gates = sampleFrom(simpleGateDefinitionArb(), 10);
    
    expect(gates).toHaveLength(10);
    gates.forEach(gate => {
      expect(gate.type).toBe('simple');
      expect(gate.schema_version).toBe('1.0');
      expect(gate.id).toBeTruthy();
      expect(gate.name).toBeTruthy();
    });
  });

  it('should generate valid composite gate definitions', () => {
    const gates = sampleFrom(compositeGateDefinitionArb(2, 3), 10);
    
    expect(gates).toHaveLength(10);
    gates.forEach(gate => {
      expect(gate.type).toBe('composite');
      expect(gate.schema_version).toBe('1.0');
      expect(gate.id).toBeTruthy();
      expect(gate.name).toBeTruthy();
      expect(['sequential', 'parallel']).toContain(gate.mode);
      expect(['fail_fast', 'collect_all']).toContain(gate.failPolicy);
      expect(gate.children).toBeDefined();
      expect(gate.children.length).toBeGreaterThan(0);
    });
  });

  it('should generate valid workflow definitions', () => {
    const workflows = sampleFrom(workflowDefinitionArb(2, 4), 5);
    
    expect(workflows).toHaveLength(5);
    workflows.forEach(workflow => {
      expect(workflow.schema_version).toBe('1.0');
      expect(workflow.id).toBeTruthy();
      expect(workflow.displayName).toBeTruthy();
      expect(workflow.stateMachine).toBeDefined();
      expect(workflow.stateMachine.initial).toBeTruthy();
      expect(workflow.stateMachine.states).toBeDefined();
    });
  });

  it('should generate valid gate results', () => {
    const results = sampleFrom(gateResultArb(), 20);
    
    expect(results).toHaveLength(20);
    results.forEach(result => {
      expect(result.schema_version).toBe('1.0');
      expect(typeof result.passed).toBe('boolean');
      if (!result.passed) {
        expect(result.reason).toBeTruthy();
      }
    });
  });
});

describe('Property Test Framework - Helper Functions', () => {
  
  it('should create mock gate results correctly', () => {
    const passedResult = createMockGateResult(true);
    expect(passedResult.passed).toBe(true);
    expect(passedResult.reason).toBeUndefined();

    const failedResult = createMockGateResult(false, 'Test failure');
    expect(failedResult.passed).toBe(false);
    expect(failedResult.reason).toBe('Test failure');
  });

  it('should create simple gate definitions correctly', () => {
    const gate = createSimpleGate('test-gate', 'Test Gate');
    
    expect(gate.type).toBe('simple');
    expect(gate.id).toBe('test-gate');
    expect(gate.name).toBe('Test Gate');
    expect(gate.schema_version).toBe('1.0');
  });

  it('should create composite gate definitions correctly', () => {
    const children = [
      createSimpleGate('child-1', 'Child 1'),
      createSimpleGate('child-2', 'Child 2')
    ];
    const gate = createCompositeGate('parent', 'Parent Gate', 'sequential', 'fail_fast', children);
    
    expect(gate.type).toBe('composite');
    expect(gate.id).toBe('parent');
    expect(gate.mode).toBe('sequential');
    expect(gate.failPolicy).toBe('fail_fast');
    expect(gate.children).toHaveLength(2);
  });

  it('should count gates correctly', () => {
    const simpleGate = createSimpleGate('simple', 'Simple');
    expect(countGates(simpleGate)).toBe(1);

    const compositeGate = createCompositeGate('parent', 'Parent', 'parallel', 'collect_all', [
      createSimpleGate('child1', 'Child 1'),
      createSimpleGate('child2', 'Child 2'),
      createSimpleGate('child3', 'Child 3')
    ]);
    expect(countGates(compositeGate)).toBe(4); // 1 parent + 3 children
  });

  it('should get all gate IDs correctly', () => {
    const compositeGate = createCompositeGate('parent', 'Parent', 'sequential', 'fail_fast', [
      createSimpleGate('child1', 'Child 1'),
      createSimpleGate('child2', 'Child 2')
    ]);
    
    const ids = getAllGateIds(compositeGate);
    expect(ids).toContain('parent');
    expect(ids).toContain('child1');
    expect(ids).toContain('child2');
    expect(ids).toHaveLength(3);
  });

  it('should validate workflow definitions correctly', () => {
    const validWorkflow = {
      schema_version: '1.0' as const,
      id: 'test-workflow',
      displayName: 'Test',
      intent: 'Test intent',
      stateMachine: {
        schema_version: '1.0' as const,
        initial: 'state1',
        states: {
          state1: {
            schema_version: '1.0' as const,
            agent: 'test-agent',
            gate: { schema_version: '1.0' as const, type: 'simple' as const, id: 'gate1', name: 'Gate 1' },
            skills: [],
            next: 'state2'
          },
          state2: {
            schema_version: '1.0' as const,
            agent: 'test-agent',
            gate: { schema_version: '1.0' as const, type: 'simple' as const, id: 'gate2', name: 'Gate 2' },
            skills: []
          }
        }
      },
      artifacts: []
    };
    
    expect(validateWorkflowDefinition(validWorkflow)).toBe(true);
  });

  it('should validate composite gates correctly', () => {
    const validComposite = createCompositeGate('test', 'Test', 'sequential', 'fail_fast', [
      createSimpleGate('child1', 'Child 1'),
      createSimpleGate('child2', 'Child 2')
    ]);
    
    expect(validateCompositeGate(validComposite)).toBe(true);

    // Invalid: empty children
    const invalidComposite = createCompositeGate('test', 'Test', 'parallel', 'collect_all', []);
    expect(validateCompositeGate(invalidComposite)).toBe(false);
  });

  it('should get leaf gates correctly', () => {
    const composite = createCompositeGate('parent', 'Parent', 'parallel', 'fail_fast', [
      createSimpleGate('child1', 'Child 1'),
      createSimpleGate('child2', 'Child 2')
    ]);
    
    const leaves = getLeafGates(composite);
    expect(leaves).toHaveLength(2);
    expect(leaves[0].id).toBe('child1');
    expect(leaves[1].id).toBe('child2');
  });

  it('should check gate validity correctly', () => {
    const validSimple = createSimpleGate('test', 'Test');
    expect(isValidGate(validSimple)).toBe(true);

    const validComposite = createCompositeGate('test', 'Test', 'sequential', 'fail_fast', [
      createSimpleGate('child', 'Child')
    ]);
    expect(isValidGate(validComposite)).toBe(true);

    // Invalid gate (missing id)
    expect(isValidGate({ type: 'simple', id: '', name: 'Test' } as any)).toBe(false);
  });
});

describe('Property Test Framework - Configuration', () => {
  
  it('should have correct default configuration', () => {
    expect(DEFAULT_PROPERTY_CONFIG.numIterations).toBe(100);
    expect(DEFAULT_PROPERTY_CONFIG.verbose).toBe(false);
  });

  it('should have correct safety-critical configuration', () => {
    expect(SAFETY_CRITICAL_CONFIG.numIterations).toBe(1000);
    expect(SAFETY_CRITICAL_CONFIG.verbose).toBe(false);
  });
});