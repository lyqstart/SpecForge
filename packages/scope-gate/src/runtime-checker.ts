/**
 * Runtime Scope Checker implementation
 * 
 * Enforces scope boundaries at runtime with decorators and manual checks.
 * 
 * ## Usage with Decorator
 * 
 * ```typescript
 * import { ScopeRegistry, RuntimeScopeChecker } from '@specforge/scope-gate';
 * 
 * const registry = new ScopeRegistry();
 * await registry.loadFromParentSpec();
 * 
 * const checker = new RuntimeScopeChecker(registry, {
 *   releaseBranch: 'v6.0',
 *   featureFlags: new Set(),
 *   environment: 'production'
 * });
 * 
 * class MyService {
 *   @checker.guardCapability('bugfix-workflow')
 *   async runWorkflow() {
 *     // This will throw if capability is not available
 *     return 'workflow result';
 *   }
 * }
 * ```
 * 
 * ## Usage without Decorator
 * 
 * ```typescript
 * // Manual check in async code
 * checker.checkCapability('bugfix-workflow', checker.getCurrentContext());
 * 
 * // Batch check
 * const results = checker.checkCapabilities(
 *   ['capability-a', 'capability-b'],
 *   checker.getCurrentContext()
 * );
 * ```
 */

import type {
  RuntimeScopeChecker as IRuntimeScopeChecker,
  ScopeContext,
  CheckResult
} from './types.js';
import { 
  ScopeError, 
  ScopeBoundaryViolationError, 
  CapabilityUnavailableError 
} from './types.js';
import { ScopeRegistry } from './scope-registry.js';

/**
 * Runtime Scope Checker
 * 
 * Enforces scope boundaries at runtime with decorators and manual checks.
 * Use this class to guard capability access points in your code.
 * 
 * @example
 * ```typescript
 * const registry = new ScopeRegistry();
 * await registry.loadFromParentSpec();
 * 
 * const checker = new RuntimeScopeChecker(registry, {
 *   releaseBranch: 'v6.0',
 *   featureFlags: new Set(),
 *   environment: 'production'
 * });
 * 
 * // Guard a method
 * class Service {
 *   @checker.guardCapability('some-p1-capability')
 *   async doSomething() { ... }
 * }
 * ```
 */
export class RuntimeScopeChecker implements IRuntimeScopeChecker {
  private registry: ScopeRegistry;
  private currentContext: ScopeContext;

  constructor(registry: ScopeRegistry, initialContext: ScopeContext) {
    this.registry = registry;
    this.currentContext = initialContext;
  }

  /**
   * Decorator/guard for P1/P2 capability entry points
   * 
   * Usage:
   * ```typescript
   * class MyService {
   *   @checker.guardCapability('bugfix-workflow')
   *   async runBugfixWorkflow() { ... }
   * }
   * ```
   */
  guardCapability(capabilityId: string): MethodDecorator {
    return (_target: any, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      
      // Handle case where descriptor.value is undefined (getter/setter)
      if (!originalMethod) {
        return descriptor;
      }
      
      descriptor.value = function(...args: any[]) {
        const checker: RuntimeScopeChecker = (this as any).scopeChecker || 
          (globalThis as any).scopeChecker;
        
        if (!checker) {
          throw new Error('RuntimeScopeChecker not available in context');
        }
        
        checker.checkCapability(capabilityId, checker.getCurrentContext());
        return originalMethod.apply(this, args);
      };
      
      return descriptor;
    };
  }

  /**
   * Manual check (for non-decorator contexts)
   * 
   * Throws ScopeError if capability is not available
   */
  checkCapability(capabilityId: string, context: ScopeContext): void {
    const result = this.registry.isAvailable(capabilityId, context);
    
    if (!result.available) {
      const capability = this.registry.getCapability(capabilityId);
      const scopeTag = capability?.scopeTag || "p2";
      
      // Check if capability is not registered at all
      if (!capability && result.reason?.includes('not registered')) {
        throw new CapabilityUnavailableError(
          capabilityId,
          scopeTag,
          result.requiredFlag
        );
      }
      
      // Use specialized error classes
      if (context.releaseBranch === "v6.0" && (scopeTag === "p1" || scopeTag === "p2")) {
        throw new ScopeBoundaryViolationError(
          capabilityId,
          scopeTag,
          result.requiredFlag
        );
      }
      
      throw new CapabilityUnavailableError(
        capabilityId,
        scopeTag,
        result.requiredFlag
      );
    }
  }

  /**
   * Batch check multiple capabilities
   */
  checkCapabilities(capabilityIds: string[], context: ScopeContext): CheckResult[] {
    return capabilityIds.map(capabilityId => {
      try {
        this.checkCapability(capabilityId, context);
        return {
          capabilityId,
          available: true
        };
      } catch (error) {
        if (error instanceof ScopeError) {
          return {
            capabilityId,
            available: false,
            error
          };
        }
        throw error;
      }
    });
  }

  /**
   * Check all registered capabilities for availability
   * Returns capabilities that are NOT available
   */
  checkAll(context: ScopeContext): CheckResult[] {
    const allCapabilities = this.registry.getAllCapabilities();
    return this.checkCapabilities(
      allCapabilities.map(cap => cap.id),
      context
    );
  }

  /**
   * Get current scope context
   */
  getCurrentContext(): ScopeContext {
    return {
      ...this.currentContext,
      featureFlags: new Set(this.currentContext.featureFlags)
    };
  }

  /**
   * Update current scope context
   */
  updateContext(newContext: Partial<ScopeContext>): void {
    this.currentContext = {
      ...this.currentContext,
      ...newContext
    };
  }

  /**
   * Enable a feature flag in current context
   */
  enableFeatureFlag(flag: string): void {
    this.currentContext.featureFlags.add(flag);
  }

  /**
   * Disable a feature flag in current context
   */
  disableFeatureFlag(flag: string): void {
    this.currentContext.featureFlags.delete(flag);
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureFlagEnabled(flag: string): boolean {
    return this.currentContext.featureFlags.has(flag);
  }
}