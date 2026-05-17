/**
 * Property Test Helpers for Workflow Runtime
 * Utility functions for property-based testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { 
  WorkflowDefinition, 
  WorkflowInstance, 
  GateDefinition, 
  GateResult,
  CompositeGateDefinition,
  SimpleGateDefinition
} from '../../src/types';

/**
 * Test configuration options
 */
export interface PropertyTestConfig {
  /** Number of iterations to run */
  numIterations: number;
  /** Enable verbose output */
  verbose: boolean;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Default test configuration
 */
export const DEFAULT_PROPERTY_CONFIG: PropertyTestConfig = {
  numIterations: 100,
  verbose: false
};

/**
 * Extended configuration for safety-critical properties
 */
export const SAFETY_CRITICAL_CONFIG: PropertyTestConfig = {
  numIterations: 1000,
  verbose: false
};

/**
 * Run a property test with custom configuration
 */
export function runPropertyTest(
  name: string,
  testFn: () => void,
  config: PropertyTestConfig = DEFAULT_PROPERTY_CONFIG
): void {
  describe(`Property: ${name}`, () => {
    for (let i = 0; i < config.numIterations; i++) {
      it(`should hold for iteration ${i + 1}`, () => {
        if (config.verbose) {
          console.log(`Running iteration ${i + 1} of ${config.numIterations}`);
        }
        testFn();
      });
    }
  });
}

/**
 * Assert that a condition holds, throw descriptive error if not
 */
export function assertProperty<T>(
  condition: boolean,
  message: string,
  actualValue?: T,
  expectedValue?: T
): asserts condition {
  if (!condition) {
    const valueInfo = actualValue !== undefined && expectedValue !== undefined
      ? `\n  Actual: ${JSON.stringify(actualValue)}\n  Expected: ${JSON.stringify(expectedValue)}`
      : '';
    throw new Error(`Property violation: ${message}${valueInfo}`);
  }
}

/**
 * Assert two values are equal
 */
export function assertEquals<T>(
  actual: T,
  expected: T,
  message: string = 'Values should be equal'
): void {
  assertProperty(
    actual === expected,
    message,
    actual,
    expected
  );
}

/**
 * Assert value is within range
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  message: string = `Value should be between ${min} and ${max}`
): void {
  assertProperty(
    value >= min && value <= max,
    message,
    value,
    `[${min}, ${max}]`
  );
}

/**
 * Assert array is not empty
 */
export function assertNonEmpty<T>(
  arr: T[],
  message: string = 'Array should not be empty'
): void {
  assertProperty(
    arr.length > 0,
    message,
    arr.length,
    '> 0'
  );
}

/**
 * Assert object has required properties
 */
export function assertHasProperties(
  obj: Record<string, unknown>,
  requiredProperties: string[],
  message: string = 'Object should have required properties'
): void {
  const missing = requiredProperties.filter(prop => !(prop in obj));
  assertProperty(
    missing.length === 0,
    `${message}. Missing: ${missing.join(', ')}`,
    Object.keys(obj),
    requiredProperties
  );
}

/**
 * Helper to create a mock GateResult
 */
export function createMockGateResult(passed: boolean, reason?: string): GateResult {
  return {
    schema_version: "1.0",
    passed,
    reason,
    details: {}
  };
}

/**
 * Helper to create a simple gate definition for testing
 */
export function createSimpleGate(
  id: string,
  name: string,
  checkFn?: () => Promise<GateResult> | GateResult
): SimpleGateDefinition {
  return {
    schema_version: "1.0",
    type: 'simple',
    id,
    name,
    checkFn
  };
}

/**
 * Helper to create a composite gate definition for testing
 */
export function createCompositeGate(
  id: string,
  name: string,
  mode: 'sequential' | 'parallel',
  failPolicy: 'fail_fast' | 'collect_all',
  children: GateDefinition[]
): CompositeGateDefinition {
  return {
    schema_version: "1.0",
    type: 'composite',
    id,
    name,
    mode,
    failPolicy,
    children
  };
}

/**
 * Count total gates in a gate definition (including nested composite gates)
 */
export function countGates(gate: GateDefinition): number {
  if (gate.type === 'simple') {
    return 1;
  }
  
  let count = 1; // Count the composite gate itself
  for (const child of gate.children) {
    count += countGates(child);
  }
  return count;
}

/**
 * Get all gate IDs from a gate definition (including nested)
 */
export function getAllGateIds(gate: GateDefinition): string[] {
  const ids: string[] = [gate.id];
  
  if (gate.type === 'composite') {
    for (const child of gate.children) {
      ids.push(...getAllGateIds(child));
    }
  }
  
  return ids;
}

/**
 * Validate workflow definition structure
 */
export function validateWorkflowDefinition(def: WorkflowDefinition): boolean {
  try {
    // Check required fields
    if (!def.id || !def.displayName || !def.stateMachine) {
      return false;
    }
    
    // Check state machine
    if (!def.stateMachine.initial || !def.stateMachine.states) {
      return false;
    }
    
    // Check all referenced states exist
    const stateIds = Object.keys(def.stateMachine.states);
    if (!stateIds.includes(def.stateMachine.initial)) {
      return false;
    }
    
    // Validate each state
    for (const [stateId, state] of Object.entries(def.stateMachine.states)) {
      if (!state.gate || !state.agent) {
        return false;
      }
      
      // Validate next reference if exists
      if (state.next) {
        const nextState = typeof state.next === 'string' ? state.next : Object.values(state.next)[0];
        if (nextState && !stateIds.includes(nextState)) {
          return false;
        }
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate composite gate definition structure
 */
export function validateCompositeGate(gate: CompositeGateDefinition): boolean {
  try {
    // Check required fields
    if (!gate.id || !gate.name || !gate.mode || !gate.failPolicy || !gate.children) {
      return false;
    }
    
    // Validate mode
    if (!['sequential', 'parallel'].includes(gate.mode)) {
      return false;
    }
    
    // Validate fail policy
    if (!['fail_fast', 'collect_all'].includes(gate.failPolicy)) {
      return false;
    }
    
    // Validate children
    if (gate.children.length === 0) {
      return false;
    }
    
    // Recursively validate children
    for (const child of gate.children) {
      if (!child.id || !child.type) {
        return false;
      }
      
      if (child.type === 'composite' && !validateCompositeGate(child)) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract all leaf gates from a composite gate
 */
export function getLeafGates(gate: GateDefinition): SimpleGateDefinition[] {
  if (gate.type === 'simple') {
    return [gate];
  }
  
  const leaves: SimpleGateDefinition[] = [];
  for (const child of gate.children) {
    leaves.push(...getLeafGates(child));
  }
  return leaves;
}

/**
 * Check if a gate definition is valid
 */
export function isValidGate(gate: GateDefinition): boolean {
  if (!gate.id || !gate.type) {
    return false;
  }
  
  if (gate.type === 'simple') {
    return true;
  }
  
  if (gate.type === 'composite') {
    return validateCompositeGate(gate);
  }
  
  return false;
}

/**
 * Generate a summary of a property test run
 */
export interface PropertyTestSummary {
  name: string;
  iterations: number;
  passed: number;
  failed: number;
  errors: Error[];
}

export function createTestSummary(
  name: string,
  iterations: number,
  errors: Error[]
): PropertyTestSummary {
  return {
    name,
    iterations,
    passed: iterations - errors.length,
    failed: errors.length,
    errors
  };
}

/**
 * Print test summary to console
 */
export function printTestSummary(summary: PropertyTestSummary): void {
  console.log('\n===========================================');
  console.log(`Property Test: ${summary.name}`);
  console.log(`Iterations: ${summary.iterations}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  
  if (summary.errors.length > 0) {
    console.log('\nFailures:');
    summary.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.message}`);
    });
  }
  console.log('===========================================\n');
}

/**
 * Setup function for property test modules
 */
export function setupPropertyTests(): void {
  // Global setup can be added here if needed
}

/**
 * Teardown function for property test modules
 */
export function teardownPropertyTests(): void {
  // Global teardown can be added here if needed
}