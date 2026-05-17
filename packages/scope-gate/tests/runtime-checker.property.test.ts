/**
 * Property Test: Error message consistency
 * 
 * Feature: Runtime Scope Checker
 * Property SG-4: Error message consistency - 错误消息应该是一致的
 * 
 * **Validates: Property SG-4** (No Silent Failures)
 * 
 * For all scope boundary violations, the error message must clearly indicate:
 * - Which capability was attempted
 * - Why it's unavailable (P1/P2 in V6.0)
 * - How to enable it (if applicable)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RuntimeScopeChecker } from '../src/runtime-checker.js';
import { ScopeRegistry } from '../src/scope-registry.js';
import { ScopeError, ScopeBoundaryViolationError, CapabilityUnavailableError } from '../src/types.js';
import type { CapabilityDefinition, ScopeContext } from '../src/types.js';

// Helper to create capability definition
function createCapabilityArb(): fc.Arbitrary<CapabilityDefinition> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/\s+/g, '-').toLowerCase()),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p0' | 'p1' | 'p2'>('p0', 'p1', 'p2'),
    entryPoints: fc.array(fc.string()),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 })),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

// Helper to create scope context for V6.0
function createV60ContextArb(): fc.Arbitrary<ScopeContext> {
  return fc.record({
    releaseBranch: fc.constantFrom<'v6.0'>('v6.0'),
    featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 30 })).map(arr => new Set(arr)),
    environment: fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test')
  }, { withDeletedKeys: false });
}

describe('Property SG-4: Error Message Consistency', () => {
  /**
   * Property: Same capability with same context produces same error message
   * 
   * For identical capability + context combinations, the error message
   * (including message text, code, capabilityId, requiredFlag) must be identical.
   */
  describe('Error Message Determinism', () => {
    it('should produce identical error messages for the same capability and context', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag !== 'p0'),
          fc.constantFrom<'v6.0'>('v6.0'),
          (capability, branch) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: branch,
              featureFlags: new Set(), // No feature flags
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            // Try to check the same capability multiple times
            const errors: ScopeError[] = [];
            
            for (let i = 0; i < 5; i++) {
              try {
                checker.checkCapability(capability.id, context);
              } catch (error) {
                if (error instanceof ScopeError) {
                  errors.push(error);
                }
              }
            }
            
            // All errors should have identical messages
            if (errors.length > 0) {
              const firstError = errors[0];
              for (const err of errors) {
                expect(err.message).toBe(firstError.message);
                expect(err.code).toBe(firstError.code);
                expect(err.capabilityId).toBe(firstError.capabilityId);
                expect(err.requiredFlag).toBe(firstError.requiredFlag);
                expect(err.scopeTag).toBe(firstError.scopeTag);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce deterministic errors across different checker instances', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1' || cap.scopeTag === 'p2'),
          (capability) => {
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            // Create two separate checkers with same capability
            const registry1 = new ScopeRegistry();
            const registry2 = new ScopeRegistry();
            registry1.registerCapability(capability);
            registry2.registerCapability(capability);
            
            const checker1 = new RuntimeScopeChecker(registry1, context);
            const checker2 = new RuntimeScopeChecker(registry2, context);
            
            // Get errors from both checkers
            let error1: ScopeError | null = null;
            let error2: ScopeError | null = null;
            
            try {
              checker1.checkCapability(capability.id, context);
            } catch (error) {
              if (error instanceof ScopeError) {
                error1 = error;
              }
            }
            
            try {
              checker2.checkCapability(capability.id, context);
            } catch (error) {
              if (error instanceof ScopeError) {
                error2 = error;
              }
            }
            
            // Both should have produced errors
            expect(error1).not.toBeNull();
            expect(error2).not.toBeNull();
            
            // Messages should be identical
            expect(error1!.message).toBe(error2!.message);
            expect(error1!.code).toBe(error2!.code);
            expect(error1!.requiredFlag).toBe(error2!.requiredFlag);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Error messages contain required information
   * 
   * All error messages must clearly indicate:
   * - Which capability was attempted (capabilityId)
   * - Why it's unavailable (P1/P2 in V6.0)
   * - How to enable it (requiredFlag if applicable)
   */
  describe('Error Message Completeness', () => {
    it('should include capability ID in error message for P1 capabilities', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              // Should have thrown an error
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeError);
              const scopeError = error as ScopeError;
              
              // Error must contain capability ID
              expect(scopeError.message).toContain(capability.id);
              expect(scopeError.capabilityId).toBe(capability.id);
              
              // Error must indicate it's a P1 capability
              expect(scopeError.message).toMatch(/P1|p1/i);
              
              // Error must provide way to enable (feature flag)
              expect(scopeError.requiredFlag).toBeDefined();
              expect(scopeError.requiredFlag).toBe(`enable_${capability.id}`);
              
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include capability ID in error message for P2 capabilities', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p2'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeError);
              const scopeError = error as ScopeError;
              
              // Error must contain capability ID
              expect(scopeError.message).toContain(capability.id);
              expect(scopeError.capabilityId).toBe(capability.id);
              
              // Error must indicate it's a P2 capability
              expect(scopeError.message).toMatch(/P2|p2/i);
              
              // Error must provide way to enable (feature flag)
              expect(scopeError.requiredFlag).toBeDefined();
              expect(scopeError.requiredFlag).toBe(`enable_${capability.id}`);
              
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include how to enable capability when feature flag is available', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag !== 'p0'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeError);
              const scopeError = error as ScopeError;
              
              // Message should contain instructions on how to enable
              expect(scopeError.message).toMatch(/enable|feature flag|flag/i);
              expect(scopeError.requiredFlag).toBeDefined();
              
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Error messages are properly formatted
   * 
   * Error messages should follow consistent formatting:
   * - Start with scope level (P1/P2)
   * - Include capability identifier
   * - Include actionable guidance
   */
  describe('Error Message Format Consistency', () => {
    it('should use consistent error code for V6.0 scope violations', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1' || cap.scopeTag === 'p2'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeError);
              const scopeError = error as ScopeError;
              
              // Should use SCOPE_BOUNDARY_VIOLATION for V6.0 violations
              expect(scopeError.code).toBe('SCOPE_BOUNDARY_VIOLATION');
              
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use ScopeBoundaryViolationError for V6.0 P1/P2 violations', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1' || cap.scopeTag === 'p2'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeBoundaryViolationError);
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return CAPABILITY_UNAVAILABLE for unregistered capabilities', () => {
      return fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (capabilityId) => {
            const registry = new ScopeRegistry();
            // Don't register any capability
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capabilityId, context);
              return false;
            } catch (error) {
              expect(error).toBeInstanceOf(ScopeError);
              const scopeError = error as ScopeError;
              
              // Should use CAPABILITY_UNAVAILABLE for unregistered
              expect(scopeError.code).toBe('CAPABILITY_UNAVAILABLE');
              
              // Should mention the capability
              expect(scopeError.capabilityId).toBe(capabilityId);
              
              return true;
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: Batch check returns consistent errors
   * 
   * When checking multiple capabilities, each should have
   * consistent error information.
   */
  describe('Batch Check Error Consistency', () => {
    it('should return consistent errors for batch checks', () => {
      return fc.assert(
        fc.property(
          fc.array(createCapabilityArb().filter(cap => cap.scopeTag !== 'p0'), { minLength: 1, maxLength: 5 }),
          (capabilities) => {
            const registry = new ScopeRegistry();
            for (const cap of capabilities) {
              registry.registerCapability(cap);
            }
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            const results = checker.checkCapabilities(
              capabilities.map(c => c.id),
              context
            );
            
            // All unavailable capabilities should have errors
            const unavailableResults = results.filter(r => !r.available);
            
            for (const result of unavailableResults) {
              expect(result.error).toBeDefined();
              expect(result.error!.capabilityId).toBe(result.capabilityId);
              expect(result.error!.message).toContain(result.capabilityId);
            }
            
            // Check determinism: same batch check should produce same results
            const results2 = checker.checkCapabilities(
              capabilities.map(c => c.id),
              context
            );
            
            for (let i = 0; i < results.length; i++) {
              expect(results[i].available).toBe(results2[i].available);
              if (!results[i].available && !results2[i].available) {
                expect(results[i].error!.message).toBe(results2[i].error!.message);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: Error messages are not silent
   * 
   * Error messages must provide clear indication of what went wrong.
   */
  describe('No Silent Failures', () => {
    it('should never have empty or undefined error messages', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          fc.constantFrom<'v6.0'>('v6.0'),
          (capability, branch) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: branch,
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
            } catch (error) {
              if (error instanceof ScopeError) {
                // Error message must not be empty
                expect(error.message.length).toBeGreaterThan(0);
                
                // Error message must contain capability ID
                expect(error.message).toContain(capability.id);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always throw ScopeError subclass, not generic Error', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag !== 'p0'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            try {
              checker.checkCapability(capability.id, context);
              return false;
            } catch (error) {
              // Must be ScopeError or its subclass (ScopeBoundaryViolationError, CapabilityUnavailableError)
              expect(error).toBeInstanceOf(ScopeError);
              // Verify it's a proper subclass with the required code property
              const scopeError = error as ScopeError;
              expect(scopeError.code).toBeDefined();
              expect(scopeError.capabilityId).toBeDefined();
              expect(scopeError.scopeTag).toBeDefined();
              
              // Code must be one of the valid error codes
              expect(['SCOPE_BOUNDARY_VIOLATION', 'FEATURE_FLAG_REQUIRED', 'CAPABILITY_UNAVAILABLE']).toContain(scopeError.code);
              
              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});