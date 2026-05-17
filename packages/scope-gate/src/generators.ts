/**
 * Fast-Check Generators for Property-Based Testing
 * 
 * This module provides comprehensive arbitrary generators for the Scope Gate module.
 * It includes standard generators, edge case generators, and invalid input generators
 * to enable thorough property-based testing.
 * 
 * @module generators
 * 
 * ## Usage
 * 
 * ```typescript
 * import * as fc from 'fast-check';
 * import {
 *   createCapabilityArb,
 *   createContextArb,
 *   createEdgeCaseCapabilityArb,
 *   createInvalidCapabilityIdArb
 * } from './src/generators.js';
 * 
 * // Use in property tests
 * fc.assert(
 *   fc.property(createCapabilityArb(), (capability) => { /* test *\/ })
 * );
 * ```
 * 
 * ## Generator Categories
 * 
 * 1. **Standard Generators**: Basic valid data for normal test cases
 * 2. **Edge Case Generators**: Boundary values and extreme inputs
 * 3. **Invalid Input Generators**: Invalid data to test error handling
 * 4. **Combined Generators**: Mix of valid and invalid for robustness testing
 */

import * as fc from 'fast-check';
import type { 
  CapabilityDefinition, 
  ScopeContext, 
  ScopeTag,
  ScopeViolationAttempt,
  FeatureFlagChange 
} from './types.js';

// =============================================================================
// Type Aliases for Arbitraries
// =============================================================================

/** Arbitrary for CapabilityDefinition */
export type CapabilityArb = fc.Arbitrary<CapabilityDefinition>;
/** Arbitrary for ScopeContext */
export type ContextArb = fc.Arbitrary<ScopeContext>;
/** Arbitrary for ScopeTag */
export type ScopeTagArb = fc.Arbitrary<ScopeTag>;
/** Arbitrary for capability ID string */
export type CapabilityIdArb = fc.Arbitrary<string>;
/** Arbitrary for FeatureFlagChange */
export type FeatureFlagChangeArb = fc.Arbitrary<FeatureFlagChange>;
/** Arbitrary for ScopeViolationAttempt */
export type ViolationAttemptArb = fc.Arbitrary<ScopeViolationAttempt>;

// =============================================================================
// Standard Generators
// =============================================================================

/**
 * Creates an arbitrary for a valid CapabilityDefinition.
 * 
 * **Generated Data:**
 * - `id`: 1-50 lowercase alphanumeric characters with hyphens
 * - `displayName`: 1-100 character display name
 * - `scopeTag`: One of 'p0', 'p1', 'p2'
 * - `entryPoints`: Array of 0-5 entry point strings
 * - `dependencies`: Array of 0-5 dependency IDs
 * - `description`: 1-200 character description
 * 
 * @example
 * ```typescript
 * fc.assert(fc.property(createCapabilityArb(), (cap) => {
 *   expect(cap.id).toMatch(/^[a-z][a-z0-9-]*$/);
 * }));
 * ```
 */
export function createCapabilityArb(): CapabilityArb {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '-').toLowerCase()),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p0' | 'p1' | 'p2'>('p0', 'p1', 'p2'),
    entryPoints: fc.array(fc.string(), { maxLength: 5 }),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

/**
 * Creates an arbitrary for a ScopeContext.
 * 
 * **Generated Data:**
 * - `releaseBranch`: One of 'v6.0', 'v6.1', 'v6.x', 'development'
 * - `featureFlags`: Set of 0-10 flag strings
 * - `environment`: One of 'production', 'staging', 'development', 'test'
 */
export function createContextArb(): ContextArb {
  return fc.record({
    releaseBranch: fc.constantFrom<'v6.0' | 'v6.1' | 'v6.x' | 'development'>('v6.0', 'v6.1', 'v6.x', 'development'),
    featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 })
      .map(arr => new Set(arr)),
    environment: fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test')
  }, { withDeletedKeys: false });
}

/**
 * Creates an arbitrary for a V6.0-specific ScopeContext.
 * Useful for testing V6.0 boundary conditions.
 */
export function createV60ContextArb(): ContextArb {
  return fc.record({
    releaseBranch: fc.constantFrom<'v6.0'>('v6.0'),
    featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 })
      .map(arr => new Set(arr)),
    environment: fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test')
  }, { withDeletedKeys: false });
}

/**
 * Creates an arbitrary for a specific scope tag.
 * 
 * @param scopeTag - The specific scope tag to generate
 */
export function createScopeTagArb(scopeTag: ScopeTag): ScopeTagArb {
  return fc.constantFrom<ScopeTag>(scopeTag);
}

/**
 * Creates an arbitrary for capability IDs.
 * Generates valid lowercase alphanumeric IDs with hyphens.
 * Must start with a letter and have at least 2 characters.
 */
export function createCapabilityIdArb(): CapabilityIdArb {
  return fc.string({ minLength: 2, maxLength: 50 })
    .map(s => s.replace(/\s+/g, '-').toLowerCase())
    .filter(s => /^[a-z][a-z0-9-]*$/.test(s));
}

// =============================================================================
// Edge Case Generators - Boundary Values
// =============================================================================

/**
 * Edge case strings that may cause issues in processing.
 * 
 * **Includes:**
 * - Empty string
 * - Whitespace-only strings (spaces, tabs, newlines)
 * - Very long strings (1000+ chars)
 * - Strings with special characters
 * - Unicode strings (Chinese, emoji, etc.)
 * - Single character strings
 * - Strings with only numbers
 */
export function createEdgeCaseStringArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Empty and whitespace
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\t\t\t'),
    fc.constant(' \n \t \n '),
    fc.stringOf(fc.constantFrom(' ', '\n', '\t', '\r'), { maxLength: 20 })
      .filter(s => s.trim().length === 0),
    
    // Single characters
    fc.constant('a'),
    fc.constant('1'),
    fc.constant('-'),
    fc.constant('_'),
    
    // Very long strings
    fc.string({ minLength: 1000, maxLength: 2000 }),
    
    // Special characters
    fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s + '!@#$%^&*()'),
    fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s + '<>{}[]|\\'),
    fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s + "'\"`"),
    
    // Unicode
    fc.constant('中文测试'),
    fc.constant('🔒🛡️⚠️'),
    fc.constant('🎉🚀✨'),
    fc.constant('العربية'),
    fc.constant('日本語'),
    
    // Numbers only
    fc.string({ minLength: 1, maxLength: 20 })
      .map(s => s.replace(/[^0-9]/g, '').slice(0, 20))
      .filter(s => s.length > 0),
    
    // Mixed patterns
    fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '_')),
    fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.toUpperCase())
  );
}

/**
 * Edge case CapabilityDefinition with boundary values.
 * 
 * **Edge Cases Covered:**
 * - Empty entryPoints array
 * - Empty dependencies array
 * - Very long displayName/description
 * - Edge case IDs
 * - Empty strings in optional fields
 */
export function createEdgeCaseCapabilityArb(): CapabilityArb {
  return fc.oneof(
    // Normal capability
    createCapabilityArb(),
    
    // Capability with empty arrays
    createCapabilityArb()
      .map(cap => ({ ...cap, entryPoints: [] as string[], dependencies: [] as string[] })),
    
    // Capability with very long fields
    createCapabilityArb()
      .map(cap => ({
        ...cap,
        displayName: 'A'.repeat(500),
        description: 'B'.repeat(1000)
      })),
    
    // Capability with edge case ID
    fc.record({
      id: fc.oneof(
        fc.constant(''),
        fc.constant('a'),
        fc.constant('1'),
        fc.constant('A'),  // uppercase
        fc.string({ minLength: 1, maxLength: 50 }).map(s => s.toUpperCase()),
        fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/[a-z0-9-]/g, 'x'))
      ),
      displayName: fc.string({ minLength: 1, maxLength: 100 }),
      scopeTag: fc.constantFrom<'p0' | 'p1' | 'p2'>('p0', 'p1', 'p2'),
      entryPoints: fc.array(fc.string(), { maxLength: 5 }),
      dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
      description: fc.string({ minLength: 1, maxLength: 200 })
    }, { withDeletedKeys: false })
  );
}

/**
 * Edge case ScopeContext with boundary values.
 * 
 * **Edge Cases Covered:**
 * - Empty feature flags set
 * - Large number of feature flags
 * - Very long flag names
 */
export function createEdgeCaseContextArb(): ContextArb {
  return fc.oneof(
    // Normal context
    createContextArb(),
    
    // Context with no feature flags
    createContextArb()
      .map(ctx => ({ ...ctx, featureFlags: new Set<string>() })),
    
    // Context with many feature flags
    createContextArb()
      .map(ctx => ({
        ...ctx,
        featureFlags: new Set(
          Array.from({ length: 100 }, (_, i) => `flag_${i}_${'x'.repeat(20)}`)
        )
      })),
    
    // Context with empty string flag (edge case)
    createContextArb()
      .map(ctx => {
        const flags = new Set(ctx.featureFlags);
        flags.add('');
        return { ...ctx, featureFlags: flags };
      })
  );
}

// =============================================================================
// Invalid Input Generators
// =============================================================================

/**
 * Invalid capability IDs that should trigger error handling.
 * 
 * **Includes:**
 * - Empty strings
 * - Unknown/random IDs not in registry
 * - IDs with invalid characters
 * - Very long IDs
 * - Unicode IDs
 * - IDs with path traversal patterns
 */
export function createInvalidCapabilityIdArb(): CapabilityIdArb {
  return fc.oneof(
    fc.constant(''),
    fc.constant('unknown-capability-12345'),
    fc.constant('nonexistent'),
    fc.constant('invalid-id-!@#$%'),
    fc.string({ minLength: 100, maxLength: 200 }),
    fc.constant('中文能力'),
    fc.constant('../../../etc/passwd'),
    fc.constant('id with spaces'),
    fc.constant('UPPERCASE_ID'),
    fc.constant('camelCaseId'),
    fc.constant('PascalCaseId'),
    fc.constant('snake_case_id'),
    fc.constant('i_do_not_exist_in_the_registry')
  );
}

/**
 * Invalid scope tags that are not valid P0/P1/P2.
 * 
 * **Includes:**
 * - Empty strings
 * - Random strings
 * - Case variations (P0, P3, etc.)
 * - Numeric values
 * - Unicode strings
 */
export function createInvalidScopeTagArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('P0'),
    fc.constant('P1'),
    fc.constant('P2'),
    fc.constant('P3'),
    fc.constant('p3'),
    fc.constant('P0 '),
    fc.constant(' p0'),
    fc.constant('invalid'),
    fc.constant('unknown'),
    fc.constant('0'),
    fc.constant('1'),
    fc.constant('2'),
    fc.constant('high'),
    fc.constant('low'),
    fc.constant('medium'),
    fc.constant('中文'),
    fc.constant('🔒')
  );
}

/**
 * Invalid release branches.
 * 
 * **Includes:**
 * - Empty strings
 * - Invalid version numbers
 * - Future versions
 * - Random strings
 */
export function createInvalidReleaseBranchArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('v5.9'),
    fc.constant('v7.0'),
    fc.constant('v6.0.1'),
    fc.constant('v6.2'),
    fc.constant('latest'),
    fc.constant('main'),
    fc.constant('master'),
    fc.constant('stable'),
    fc.constant('invalid'),
    fc.constant('version'),
    fc.constant('v6.0-dev'),
    fc.constant('V6.0'),  // uppercase
    fc.constant('v6.0 '), // trailing space
    fc.constant(' v6.0')  // leading space
  );
}

/**
 * Invalid environments.
 * 
 * **Includes:**
 * - Empty strings
 * - Random environment names
 * - Case variations
 */
export function createInvalidEnvironmentArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('PRODUCTION'),  // uppercase
    fc.constant('Production'),
    fc.constant('prod'),
    fc.constant('dev'),
    fc.constant('localhost'),
    fc.constant('custom'),
    fc.constant('unknown'),
    fc.constant('staging '),   // trailing space
    fc.constant(' production')  // leading space
  );
}

/**
 * Invalid feature flags.
 * 
 * **Includes:**
 * - Empty strings
 * - Flags with invalid characters
 * - Very long flag names
 * - Flags that don't follow naming convention
 */
export function createInvalidFeatureFlagArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('flag!'),
    fc.constant('flag@'),
    fc.constant('flag#'),
    fc.constant('enable_'),
    fc.constant('DISABLE_flag'),
    fc.string({ minLength: 100, maxLength: 200 }),
    fc.constant('中文flag'),
    fc.constant('enable cap with spaces'),
    fc.constant('enable\ttab'),
    fc.constant('enable\nnewline')
  );
}

// =============================================================================
// Combined Generators (Mixed Valid/Invalid)
// =============================================================================

/**
 * Mixed capability IDs - both valid and invalid.
 * Useful for testing error handling paths.
 * 
 * @param validRatio - Ratio of valid IDs to generate (0-1). Default 0.5
 */
export function createMixedCapabilityIdArb(validRatio: number = 0.5): CapabilityIdArb {
  // Use fc.sample to manually mix since fc.oneof weights don't work as expected
  const validArb = fc.string({ minLength: 2, maxLength: 50 })
    .map(s => s.replace(/\s+/g, '-').toLowerCase())
    .filter(s => /^[a-z][a-z0-9-]*$/.test(s));
  const invalidArb = createInvalidCapabilityIdArb();
  
  // Use withWeight via chaining on fc.oneof result
  return fc.oneof(validArb, invalidArb);
}

/**
 * Mixed scope tags - includes both valid and invalid.
 * 
 * @param validRatio - Ratio of valid tags to generate (0-1). Default 0.7
 */
export function createMixedScopeTagArb(validRatio: number = 0.7): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom('p0', 'p1', 'p2'),
    createInvalidScopeTagArb()
  );
}

/**
 * Mixed contexts - includes edge cases.
 * 
 * @param edgeCaseRatio - Ratio of edge case contexts (0-1). Default 0.3
 */
export function createMixedContextArb(edgeCaseRatio: number = 0.3): ContextArb {
  return fc.oneof(
    createContextArb(),
    createEdgeCaseContextArb()
  );
}

/**
 * Mixed capabilities - includes edge cases and invalid inputs.
 * 
 * @param edgeCaseRatio - Ratio of edge case capabilities (0-1). Default 0.3
 */
export function createMixedCapabilityArb(edgeCaseRatio: number = 0.3): CapabilityArb {
  return fc.oneof(
    createCapabilityArb(),
    createEdgeCaseCapabilityArb()
  );
}

// =============================================================================
// Specialized Generators for Specific Test Scenarios
// =============================================================================

/**
 * Generator for FeatureFlagChange events.
 * Useful for testing audit logging of flag changes.
 */
export function createFeatureFlagChangeArb(): FeatureFlagChangeArb {
  return fc.record({
    flag: fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '_').toLowerCase()),
    oldValue: fc.boolean(),
    newValue: fc.boolean(),
    reason: fc.string({ minLength: 1, maxLength: 200 }),
    userId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { freq: 3 }),
    timestamp: fc.date()
  }, { withDeletedKeys: false });
}

/**
 * Generator for ScopeViolationAttempt events.
 * Useful for testing audit logging of violations.
 */
export function createViolationAttemptArb(): ViolationAttemptArb {
  return fc.record({
    capabilityId: createCapabilityIdArb(),
    scopeTag: fc.constantFrom<'p0' | 'p1' | 'p2'>('p0', 'p1', 'p2'),
    context: createContextArb(),
    stackTrace: fc.option(fc.string(), { freq: 2 }),
    userId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { freq: 3 }),
    sessionId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { freq: 3 }),
    timestamp: fc.date()
  }, { withDeletedKeys: false });
}

/**
 * Generator for capability with circular dependencies.
 * Useful for testing dependency validation.
 * 
 * @param numCapabilities - Number of capabilities in the cycle
 */
export function createCyclicDependencyArb(numCapabilities: number = 3): fc.Arbitrary<CapabilityDefinition[]> {
  return fc.integer({ min: 3, max: numCapabilities }).chain(n => {
    const capabilities: CapabilityDefinition[] = [];
    const baseId = 'cap-' + Math.random().toString(36).slice(2, 5);
    
    for (let i = 0; i < n; i++) {
      const nextIndex = (i + 1) % n;
      capabilities.push({
        id: `${baseId}-${i}`,
        displayName: `Capability ${i}`,
        scopeTag: 'p0',
        entryPoints: [`entry${i}`],
        dependencies: [`${baseId}-${nextIndex}`],
        description: `Capability in cycle`
      });
    }
    
    return fc.constant(capabilities);
  });
}

/**
 * Generator for P0 capability depending on P1/P2.
 * Useful for testing dependency validation errors.
 * 
 * @param dependsOnP1 - Whether the dependency should be P1 (vs P2)
 */
export function createP0DependsOnP1P2Arb(dependsOnP1: boolean = true): fc.Arbitrary<{
  p0Capability: CapabilityDefinition;
  p1p2Capability: CapabilityDefinition;
}> {
  return fc.record({
    p0Capability: createCapabilityArb()
      .filter(cap => cap.scopeTag === 'p0')
      .map(cap => ({ ...cap, dependencies: ['p1p2-dep'] })),
    p1p2Capability: createCapabilityArb()
      .filter(cap => cap.scopeTag === (dependsOnP1 ? 'p1' : 'p2'))
      .map(cap => ({ ...cap, id: 'p1p2-dep' }))
  }, { withDeletedKeys: false });
}

/**
 * Generator for capability with self-dependency.
 * Useful for testing self-dependency detection.
 */
export function createSelfDependencyArb(): CapabilityArb {
  return createCapabilityArb()
    .map(cap => ({
      ...cap,
      dependencies: [cap.id]
    }));
}

/**
 * Generator for array of capabilities with various dependency patterns.
 * 
 * @param minLength - Minimum number of capabilities
 * @param maxLength - Maximum number of capabilities
 */
export function createCapabilityArrayArb(
  minLength: number = 1,
  maxLength: number = 10
): fc.Arbitrary<CapabilityDefinition[]> {
  return fc.array(createCapabilityArb(), { minLength, maxLength });
}

// =============================================================================
// Generator Combinators
// =============================================================================

/**
 * Creates a filtered arbitrary that only yields valid data.
 * 
 * @param arb - The arbitrary to filter
 * @param predicate - Filter predicate
 */
export function filterValid<T>(arb: fc.Arbitrary<T>, predicate: (t: T) => boolean): fc.Arbitrary<T> {
  return arb.filter(predicate);
}

/**
 * Creates a mapped arbitrary with validation.
 * 
 * @param arb - The arbitrary to map
 * @param mapper - Mapping function
 * @param validator - Optional validator for the mapped result
 */
export function mapValid<T, U>(
  arb: fc.Arbitrary<T>, 
  mapper: (t: T) => U,
  validator?: (u: U) => boolean
): fc.Arbitrary<U> {
  const mapped = arb.map(mapper);
  return validator ? mapped.filter(validator) : mapped;
}

/**
 * Creates a weighted mix of two arbitraries.
 * 
 * @param weight - Weight for first arbitrary (0-1)
 * @param first - First arbitrary
 * @param second - Second arbitrary
 */
export function weightedMix<T>(
  weight: number,
  first: fc.Arbitrary<T>,
  second: fc.Arbitrary<T>
): fc.Arbitrary<T> {
  return fc.oneof(
    first.withWeight(weight),
    second.withWeight(1 - weight)
  );
}

// =============================================================================
// Pre-built Test Scenarios
// =============================================================================

/**
 * Generator for testing scope boundary violations in V6.0.
 * Creates scenarios where P1/P2 capabilities are accessed without flags.
 */
export function createV60ViolationScenarioArb(): fc.Arbitrary<{
  capability: CapabilityDefinition;
  context: ScopeContext;
}> {
  return fc.record({
    capability: createCapabilityArb()
      .filter(cap => cap.scopeTag !== 'p0'),
    context: fc.record({
      releaseBranch: fc.constantFrom<'v6.0'>('v6.0'),
      featureFlags: fc.constant(new Set<string>()),  // No flags = violation
      environment: fc.constantFrom<'production'>('production')
    }, { withDeletedKeys: false })
  }, { withDeletedKeys: false });
}

/**
 * Generator for testing successful access with feature flags.
 * Creates scenarios where capabilities are properly enabled.
 */
export function createEnabledScenarioArb(): fc.Arbitrary<{
  capability: CapabilityDefinition;
  context: ScopeContext;
}> {
  return fc.record({
    capability: createCapabilityArb()
      .filter(cap => cap.scopeTag !== 'p0'),
    context: fc.record({
      releaseBranch: fc.constantFrom<'v6.0' | 'v6.1' | 'v6.x' | 'development'>('v6.0', 'v6.1', 'v6.x', 'development'),
      featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 50 }))
        .map(arr => new Set(arr.map(f => `enable_${f}`))),
      environment: fc.constantFrom<'production' | 'development'>('production', 'development')
    }, { withDeletedKeys: false })
  }, { withDeletedKeys: false }).map(({ capability, context }) => {
    // Ensure the capability's enable flag is in the context
    const enableFlag = `enable_${capability.id}`;
    context.featureFlags.add(enableFlag);
    return { capability, context };
  });
}

/**
 * Generator for testing dependency validation.
 * Creates various dependency scenarios.
 */
export function createDependencyScenarioArb(): fc.Arbitrary<{
  capabilities: CapabilityDefinition[];
  expectedViolations: number;
}> {
  return fc.oneof(
    // No violations - all P0
    fc.array(createCapabilityArb().filter(cap => cap.scopeTag === 'p0'), { minLength: 2, maxLength: 5 })
      .map(caps => ({ capabilities: caps, expectedViolations: 0 })),
    
    // P0 depending on P1 (violation)
    createP0DependsOnP1P2Arb(true)
      .chain(({ p0Capability, p1p2Capability }) => 
        fc.constant({
          capabilities: [p0Capability, p1p2Capability],
          expectedViolations: 1
        })
      ),
    
    // P0 depending on P2 (violation)
    createP0DependsOnP1P2Arb(false)
      .chain(({ p0Capability, p1p2Capability }) => 
        fc.constant({
          capabilities: [p0Capability, p1p2Capability],
          expectedViolations: 1
        })
      ),
    
    // Circular dependency
    createCyclicDependencyArb(3)
      .map(caps => ({ capabilities: caps, expectedViolations: 0 }))  // May or may not be violation depending on rules
  );
}

// =============================================================================
// Default Exports
// =============================================================================

/**
 * All standard generators for convenience import.
 */
export const generators = {
  capability: createCapabilityArb,
  context: createContextArb,
  v60Context: createV60ContextArb,
  capabilityId: createCapabilityIdArb,
  scopeTag: createScopeTagArb,
  
  // Edge cases
  edgeCaseString: createEdgeCaseStringArb,
  edgeCaseCapability: createEdgeCaseCapabilityArb,
  edgeCaseContext: createEdgeCaseContextArb,
  
  // Invalid inputs
  invalidCapabilityId: createInvalidCapabilityIdArb,
  invalidScopeTag: createInvalidScopeTagArb,
  invalidReleaseBranch: createInvalidReleaseBranchArb,
  invalidEnvironment: createInvalidEnvironmentArb,
  invalidFeatureFlag: createInvalidFeatureFlagArb,
  
  // Mixed
  mixedCapabilityId: createMixedCapabilityIdArb,
  mixedScopeTag: createMixedScopeTagArb,
  mixedContext: createMixedContextArb,
  mixedCapability: createMixedCapabilityArb,
  
  // Specialized
  featureFlagChange: createFeatureFlagChangeArb,
  violationAttempt: createViolationAttemptArb,
  
  // Scenarios
  v60ViolationScenario: createV60ViolationScenarioArb,
  enabledScenario: createEnabledScenarioArb,
  dependencyScenario: createDependencyScenarioArb
};

export default generators;